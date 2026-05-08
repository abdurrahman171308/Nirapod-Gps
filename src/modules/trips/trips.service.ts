import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Trip, TripDocument } from '../../database/schemas/trip.schema';
import {
  LocationPoint,
  LocationPointDocument,
} from '../../database/schemas/location-point.schema';
import { Device, DeviceDocument } from '../../database/schemas/device.schema';
import { TripQueryDto } from './dto';
import { DevicesService, UserContext } from '../devices/devices.service';
import { NormalizedTelemetry } from '../../common/types/gps.type';
import {
  GPS_DEVICE_HEARTBEAT,
  GPS_LOCATION_EVENT,
} from '../gps-ingest/tcp-server.service';
import { ReverseGeocodingService } from './reverse-geocoding.service';

export interface LocationPointData {
  lat: number;
  lng: number;
  speed: number;
  deviceTime: Date;
  ignition?: boolean;
}

interface TripPointData {
  lat: number;
  lng: number;
  speed: number;
  deviceTime: Date;
  ignition?: boolean;
}

interface TripAddressSource {
  _id?: unknown;
  startAddress?: string;
  endAddress?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
}

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  // Trip detection thresholds
  private readonly STOP_DURATION_THRESHOLD = 5 * 60 * 1000; // 5 minutes stopped = end of trip
  private readonly MIN_SPEED_THRESHOLD = 2; // km/h - below this is considered stopped
  private readonly MIN_TRIP_DISTANCE = 0.1; // km - minimum 100m to be a valid trip
  private readonly MIN_TRIP_DURATION = 60; // seconds - minimum 1 minute trip

  // Rolling buffer for auto trip detection: imei -> buffered points
  private readonly tripBuffer = new Map<string, TripPointData[]>();
  // Track when device last moved: imei -> timestamp ms
  private readonly lastMovingTime = new Map<string, number>();
  // In-progress trip start per device: imei -> start point
  private readonly activeTripStart = new Map<string, TripPointData>();

  constructor(
    @InjectModel(Trip.name)
    private tripModel: Model<TripDocument>,
    @InjectModel(LocationPoint.name)
    private locationPointModel: Model<LocationPointDocument>,
    @InjectModel(Device.name)
    private deviceModel: Model<DeviceDocument>,
    private devicesService: DevicesService,
    private reverseGeocodingService: ReverseGeocodingService,
  ) {}

  @OnEvent(GPS_LOCATION_EVENT)
  async handleLocationForTripDetection(
    telemetry: NormalizedTelemetry,
  ): Promise<void> {
    try {
      const { imei, lat, lng, speed, deviceTime } = telemetry;
      const point: TripPointData = {
        lat,
        lng,
        speed,
        deviceTime: new Date(deviceTime),
        ignition: telemetry.ignition,
      };

      const isMoving = speed > this.MIN_SPEED_THRESHOLD;

      if (isMoving) {
        if (!this.activeTripStart.has(imei)) {
          this.activeTripStart.set(imei, point);
          this.tripBuffer.set(imei, [point]);
        } else {
          this.tripBuffer.get(imei)?.push(point);
        }
        this.lastMovingTime.set(imei, new Date(deviceTime).getTime());
      } else {
        const lastMoved = this.lastMovingTime.get(imei);
        const tripStart = this.activeTripStart.get(imei);
        const buffer = this.tripBuffer.get(imei);

        if (tripStart && lastMoved && buffer && buffer.length > 1) {
          const stopDuration = new Date(deviceTime).getTime() - lastMoved;

          if (
            telemetry.ignition === false ||
            stopDuration >= this.STOP_DURATION_THRESHOLD
          ) {
            // Finalize the trip
            const trip = await this.withStoredPlaceNames(
              this.createTripFromPoints(tripStart, buffer),
            );
            if (this.isValidTrip(trip)) {
              const device = await this.deviceModel.findOne({ imei }).exec();
              if (device) {
                await this.tripModel.create({
                  deviceId: device._id,
                  imei,
                  ...trip,
                });
                this.logger.log(
                  `Auto-detected trip for ${imei}: ${trip.distance} km`,
                );
              }
            }
            // Reset state
            this.activeTripStart.delete(imei);
            this.tripBuffer.delete(imei);
            this.lastMovingTime.delete(imei);
          } else {
            // Short stop — keep buffering
            buffer.push(point);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error in auto trip detection: ${error}`);
    }
  }

  @OnEvent(GPS_DEVICE_HEARTBEAT)
  async handleDeviceHeartbeatForTripDetection(data: {
    imei: string;
    at: Date;
  }): Promise<void> {
    try {
      const lastMoved = this.lastMovingTime.get(data.imei);
      const tripStart = this.activeTripStart.get(data.imei);
      const buffer = this.tripBuffer.get(data.imei);

      if (!tripStart || !lastMoved || !buffer || buffer.length <= 1) {
        return;
      }

      const stopDuration = new Date(data.at).getTime() - lastMoved;
      if (stopDuration < this.STOP_DURATION_THRESHOLD) {
        return;
      }

      const trip = await this.withStoredPlaceNames(
        this.createTripFromPoints(tripStart, buffer),
      );
      if (this.isValidTrip(trip)) {
        const device = await this.deviceModel.findOne({ imei: data.imei }).exec();
        if (device) {
          await this.tripModel.create({
            deviceId: device._id,
            imei: data.imei,
            ...trip,
          });
          this.logger.log(
            `Auto-detected trip for ${data.imei}: ${trip.distance} km (heartbeat inactivity)`,
          );
        }
      }

      this.activeTripStart.delete(data.imei);
      this.tripBuffer.delete(data.imei);
      this.lastMovingTime.delete(data.imei);
    } catch (error) {
      this.logger.error(`Error finalizing trip on heartbeat: ${error}`);
    }
  }

  async findAll(
    imei: string,
    query: TripQueryDto,
    user: UserContext,
  ): Promise<{ trips: Trip[]; total: number; hasMore: boolean }> {
    // Validate user has access to this device
    await this.devicesService.validateDeviceAccessByImei(imei, user);

    const filter: any = { imei };

    if (query.from || query.to) {
      filter.startTime = {};
      if (query.from) {
        filter.startTime.$gte = new Date(query.from);
      }
      if (query.to) {
        filter.startTime.$lte = new Date(query.to);
      }
    }

    const limit = query.limit || 50;
    const skip = query.skip || 0;

    let [trips, total] = await this.findTripsByFilter(filter, limit, skip);

    if (total === 0) {
      const backfilled = await this.backfillTripsIfMissing(imei, query);
      if (backfilled > 0) {
        [trips, total] = await this.findTripsByFilter(filter, limit, skip);
      }
    }

    const enrichedTrips = await this.enrichAndPersistTripAddresses(trips);

    return {
      trips: enrichedTrips as Trip[],
      total,
      hasMore: skip + trips.length < total,
    };
  }

  async findOne(
    imei: string,
    tripId: string,
    user: UserContext,
  ): Promise<Trip> {
    // Validate user has access to this device
    await this.devicesService.validateDeviceAccessByImei(imei, user);

    const trip = await this.tripModel
      .findOne({ _id: tripId, imei })
      .lean()
      .exec();

    if (!trip) {
      throw new NotFoundException(`Trip not found`);
    }

    const [enrichedTrip] = await this.enrichAndPersistTripAddresses([trip]);
    return enrichedTrip as Trip;
  }

  async getTripRoute(
    imei: string,
    tripId: string,
    user: UserContext,
  ): Promise<{ trip: Trip; route: LocationPointData[] }> {
    const trip = await this.findOne(imei, tripId, user);

    const route = await this.locationPointModel
      .find({
        imei,
        deviceTime: { $gte: trip.startTime, $lte: trip.endTime },
      })
      .sort({ deviceTime: 1 })
      .select('lat lng speed deviceTime ignition')
      .lean()
      .exec();

    return { trip, route };
  }

  async getSummary(
    imei: string,
    from: Date,
    to: Date,
    user: UserContext,
  ): Promise<{
    totalTrips: number;
    totalDistance: number;
    totalDuration: number;
    avgTripDistance: number;
    avgTripDuration: number;
    maxSpeed: number;
  }> {
    // Validate user has access to this device
    await this.devicesService.validateDeviceAccessByImei(imei, user);

    const stats = await this.tripModel.aggregate([
      {
        $match: {
          imei,
          startTime: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          totalTrips: { $sum: 1 },
          totalDistance: { $sum: '$distance' },
          totalDuration: { $sum: '$duration' },
          avgTripDistance: { $avg: '$distance' },
          avgTripDuration: { $avg: '$duration' },
          maxSpeed: { $max: '$maxSpeed' },
        },
      },
    ]);

    if (stats.length === 0) {
      return {
        totalTrips: 0,
        totalDistance: 0,
        totalDuration: 0,
        avgTripDistance: 0,
        avgTripDuration: 0,
        maxSpeed: 0,
      };
    }

    return {
      totalTrips: stats[0].totalTrips,
      totalDistance: Math.round(stats[0].totalDistance * 100) / 100,
      totalDuration: Math.round(stats[0].totalDuration),
      avgTripDistance: Math.round(stats[0].avgTripDistance * 100) / 100,
      avgTripDuration: Math.round(stats[0].avgTripDuration),
      maxSpeed: stats[0].maxSpeed || 0,
    };
  }

  async detectAndSaveTrips(
    imei: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const device = await this.deviceModel.findOne({ imei }).exec();

    if (!device) {
      throw new NotFoundException(`Device with IMEI ${imei} not found`);
    }

    // Get location points for the period
    const points = await this.locationPointModel
      .find({
        imei,
        deviceTime: { $gte: from, $lte: to },
      })
      .sort({ deviceTime: 1 })
      .lean()
      .exec();

    if (points.length < 2) {
      return 0;
    }

    const trips = this.detectTrips(points);

    // Delete existing trips in this period to avoid duplicates
    await this.tripModel.deleteMany({
      imei,
      startTime: { $gte: from, $lte: to },
    });

    // Save detected trips
    const tripDocs = [];
    for (const trip of trips) {
      tripDocs.push({
        deviceId: device._id,
        imei,
        ...(await this.withStoredPlaceNames(trip)),
      });
    }

    if (tripDocs.length > 0) {
      await this.tripModel.insertMany(tripDocs);
    }

    this.logger.log(`Detected ${tripDocs.length} trips for device ${imei}`);

    return tripDocs.length;
  }

  private async findTripsByFilter(
    filter: Record<string, unknown>,
    limit: number,
    skip: number,
  ): Promise<[TripAddressSource[], number]> {
    return Promise.all([
      this.tripModel
        .find(filter)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.tripModel.countDocuments(filter).exec(),
    ]);
  }

  private async backfillTripsIfMissing(
    imei: string,
    query: TripQueryDto,
  ): Promise<number> {
    const range = await this.resolveBackfillRange(imei, query);
    if (!range) {
      return 0;
    }

    try {
      return await this.detectAndSaveTrips(imei, range.from, range.to);
    } catch (error) {
      this.logger.warn(
        `Trip backfill skipped for ${imei}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  private async resolveBackfillRange(
    imei: string,
    query: TripQueryDto,
  ): Promise<{ from: Date; to: Date } | null> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to) {
      return { from, to };
    }

    const [firstPoint, lastPoint] = await Promise.all([
      from
        ? Promise.resolve(null)
        : this.locationPointModel
            .findOne({ imei })
            .sort({ deviceTime: 1 })
            .select('deviceTime')
            .lean()
            .exec(),
      to
        ? Promise.resolve(null)
        : this.locationPointModel
            .findOne({ imei })
            .sort({ deviceTime: -1 })
            .select('deviceTime')
            .lean()
            .exec(),
    ]);

    const resolvedFrom = from ?? firstPoint?.deviceTime;
    const resolvedTo = to ?? lastPoint?.deviceTime;

    if (
      !resolvedFrom ||
      !resolvedTo ||
      isNaN(new Date(resolvedFrom).getTime()) ||
      isNaN(new Date(resolvedTo).getTime()) ||
      new Date(resolvedFrom).getTime() >= new Date(resolvedTo).getTime()
    ) {
      return null;
    }

    return {
      from: new Date(resolvedFrom),
      to: new Date(resolvedTo),
    };
  }

  private detectTrips(
    points: TripPointData[],
  ): Omit<Trip, '_id' | 'deviceId' | 'imei' | 'createdAt' | 'updatedAt'>[] {
    const trips: Omit<
      Trip,
      '_id' | 'deviceId' | 'imei' | 'createdAt' | 'updatedAt'
    >[] = [];

    let tripStart: TripPointData | null = null;
    let tripPoints: TripPointData[] = [];
    let lastMovingTime: Date | null = null;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const isMoving = point.speed >= this.MIN_SPEED_THRESHOLD;

      if (isMoving) {
        if (!tripStart) {
          // Start new trip
          tripStart = point;
          tripPoints = [point];
        } else {
          tripPoints.push(point);
        }
        lastMovingTime = point.deviceTime;
      } else if (tripStart && lastMovingTime) {
        // Vehicle stopped
        const stopDuration =
          new Date(point.deviceTime).getTime() -
          new Date(lastMovingTime).getTime();

        if (stopDuration >= this.STOP_DURATION_THRESHOLD) {
          // End the trip
          const trip = this.createTripFromPoints(tripStart, tripPoints);
          if (this.isValidTrip(trip)) {
            trips.push(trip);
          }
          tripStart = null;
          tripPoints = [];
          lastMovingTime = null;
        } else {
          // Short stop, continue trip
          tripPoints.push(point);
        }
      }
    }

    // Handle last trip if still ongoing
    if (tripStart && tripPoints.length > 1) {
      const trip = this.createTripFromPoints(tripStart, tripPoints);
      if (this.isValidTrip(trip)) {
        trips.push(trip);
      }
    }

    return trips;
  }

  private createTripFromPoints(
    start: TripPointData,
    points: TripPointData[],
  ): Omit<Trip, '_id' | 'deviceId' | 'imei' | 'createdAt' | 'updatedAt'> {
    const end = points[points.length - 1];
    const speeds = points.map((p) => p.speed).filter((s) => s > 0);

    const distance = this.calculateTotalDistance(points);
    const duration = Math.round(
      (new Date(end.deviceTime).getTime() -
        new Date(start.deviceTime).getTime()) /
        1000,
    );

    return {
      startTime: start.deviceTime,
      endTime: end.deviceTime,
      startLat: start.lat,
      startLng: start.lng,
      endLat: end.lat,
      endLng: end.lng,
      distance: Math.round(distance * 100) / 100,
      maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
      avgSpeed:
        speeds.length > 0
          ? Math.round(
              (speeds.reduce((a, b) => a + b, 0) / speeds.length) * 100,
            ) / 100
          : 0,
      duration,
      pointCount: points.length,
    };
  }

  private isValidTrip(
    trip: Omit<Trip, '_id' | 'deviceId' | 'imei' | 'createdAt' | 'updatedAt'>,
  ): boolean {
    return (
      trip.distance >= this.MIN_TRIP_DISTANCE &&
      trip.duration >= this.MIN_TRIP_DURATION
    );
  }

  private calculateTotalDistance(
    points: { lat: number; lng: number }[],
  ): number {
    let totalDistance = 0;

    for (let i = 1; i < points.length; i++) {
      totalDistance += this.haversineDistance(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    }

    return totalDistance;
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private async enrichAndPersistTripAddresses<T extends TripAddressSource>(
    trips: T[],
  ): Promise<Array<T & { startAddress?: string; endAddress?: string }>> {
    const enrichedTrips: Array<
      T & { startAddress?: string; endAddress?: string }
    > = [];

    for (const trip of trips) {
      const enrichedTrip = await this.withAddressFallback(trip);
      const updates: Partial<Pick<Trip, 'startAddress' | 'endAddress'>> = {};

      if (
        trip._id &&
        this.shouldPersistAddress(trip.startAddress, enrichedTrip.startAddress)
      ) {
        updates.startAddress = enrichedTrip.startAddress;
      }

      if (
        trip._id &&
        this.shouldPersistAddress(trip.endAddress, enrichedTrip.endAddress)
      ) {
        updates.endAddress = enrichedTrip.endAddress;
      }

      if (trip._id && Object.keys(updates).length > 0) {
        await this.tripModel
          .updateOne({ _id: trip._id }, { $set: updates })
          .exec();
      }

      enrichedTrips.push(enrichedTrip);
    }

    return enrichedTrips;
  }

  private async withStoredPlaceNames<T extends TripAddressSource>(
    trip: T,
  ): Promise<T & { startAddress?: string; endAddress?: string }> {
    const startAddress = await this.resolvePlaceName(
      trip.startAddress,
      trip.startLat,
      trip.startLng,
    );
    const endAddress = await this.resolvePlaceName(
      trip.endAddress,
      trip.endLat,
      trip.endLng,
    );

    return {
      ...trip,
      ...(startAddress ? { startAddress } : {}),
      ...(endAddress ? { endAddress } : {}),
    };
  }

  private async withAddressFallback<T extends TripAddressSource>(
    trip: T,
  ): Promise<T & { startAddress?: string; endAddress?: string }> {
    const startAddress =
      (await this.resolvePlaceName(
        trip.startAddress,
        trip.startLat,
        trip.startLng,
      )) || this.formatCoordinateLabel(trip.startLat, trip.startLng);
    const endAddress =
      (await this.resolvePlaceName(
        trip.endAddress,
        trip.endLat,
        trip.endLng,
      )) || this.formatCoordinateLabel(trip.endLat, trip.endLng);

    return {
      ...trip,
      startAddress,
      endAddress,
    };
  }

  private async resolvePlaceName(
    address: string | undefined,
    lat?: number,
    lng?: number,
  ): Promise<string | undefined> {
    const storedAddress = this.getStoredPlaceName(address);
    if (storedAddress) {
      return storedAddress;
    }

    return this.reverseGeocodingService.reverse(lat, lng);
  }

  private getStoredPlaceName(address?: string): string | undefined {
    const cleanedAddress = address?.trim();
    if (!cleanedAddress || this.isCoordinateLabel(cleanedAddress)) {
      return undefined;
    }

    return cleanedAddress;
  }

  private shouldPersistAddress(
    currentAddress: string | undefined,
    nextAddress: string | undefined,
  ): boolean {
    return (
      !!nextAddress &&
      !this.isCoordinateLabel(nextAddress) &&
      this.getStoredPlaceName(currentAddress) !== nextAddress
    );
  }

  private isCoordinateLabel(address: string): boolean {
    return /^-?\d+(\.\d+)?[NS],\s*-?\d+(\.\d+)?[EW]$/.test(address);
  }

  private formatCoordinateLabel(
    lat?: number,
    lng?: number,
  ): string | undefined {
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return undefined;
    }

    const latDirection = lat >= 0 ? 'N' : 'S';
    const lngDirection = lng >= 0 ? 'E' : 'W';

    return `${Math.abs(lat).toFixed(5)}${latDirection}, ${Math.abs(lng).toFixed(
      5,
    )}${lngDirection}`;
  }
}
