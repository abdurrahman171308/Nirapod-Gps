import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LocationPoint,
  LocationPointDocument,
} from '../../database/schemas/location-point.schema';
import {
  DevicesService,
  IGNITION_STATE_FRESH_MS,
  ONLINE_THRESHOLD_MS,
  UserContext,
} from '../devices/devices.service';
import { LocationsService } from '../locations/locations.service';
import { TripsService } from '../trips/trips.service';
import { StopsQueryDto, TrackingQueryDto } from './dto';
import { LocationHistoryQueryDto } from '../locations/dto';
import { TripQueryDto } from '../trips/dto';

interface LiveDeviceState {
  isOnline?: boolean;
  lastSeenAt?: Date | null;
  lastIgnition?: boolean;
  lastIgnitionAt?: Date | null;
}

interface LiveLocationSnapshot {
  toObject?: () => Record<string, unknown>;
  speed?: number | null;
  serverTime?: Date | string | null;
}

@Injectable()
export class TrackingService {
  constructor(
    @InjectModel(LocationPoint.name)
    private readonly locationPointModel: Model<LocationPointDocument>,
    private readonly devicesService: DevicesService,
    private readonly locationsService: LocationsService,
    private readonly tripsService: TripsService,
  ) {}

  async getLive(imei: string, user: UserContext) {
    const device = await this.devicesService.validateDeviceAccessByImei(
      imei,
      user,
    );
    const latestLocation = await this.devicesService.getLatestLocation(
      imei,
      user,
    );
    const isOnline = this.isCurrentlyOnline(device);

    return {
      imei,
      isOnline,
      lastSeenAt: device.lastSeenAt,
      latestLocation: this.buildLiveLocation(latestLocation, device, isOnline),
    };
  }

  async getHistory(query: TrackingQueryDto, user: UserContext) {
    const locationQuery: LocationHistoryQueryDto = {
      from: query.from,
      to: query.to,
      limit: query.limit,
      skip: query.skip,
    };

    return this.locationsService.getHistory(query.imei, locationQuery, user);
  }

  async getTrips(query: TrackingQueryDto, user: UserContext) {
    const tripQuery: TripQueryDto = {
      from: query.from,
      to: query.to,
      limit: query.limit,
      skip: query.skip,
    };

    return this.tripsService.findAll(query.imei, tripQuery, user);
  }

  async getStops(query: StopsQueryDto, user: UserContext) {
    await this.devicesService.validateDeviceAccessByImei(query.imei, user);

    const filter: any = { imei: query.imei };
    if (query.from || query.to) {
      filter.deviceTime = {};
      if (query.from) {
        filter.deviceTime.$gte = new Date(query.from);
      }
      if (query.to) {
        filter.deviceTime.$lte = new Date(query.to);
      }
    }

    const points = await this.locationPointModel
      .find(filter)
      .sort({ deviceTime: 1 })
      .select('lat lng speed deviceTime')
      .lean()
      .exec();

    const minStopMs = (query.minStopMinutes ?? 5) * 60 * 1000;
    const stops: Array<{
      startTime: Date;
      endTime: Date;
      durationSeconds: number;
      lat: number;
      lng: number;
    }> = [];

    let stopStartIndex: number | null = null;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const isStopped = (point.speed ?? 0) <= 1;

      if (isStopped && stopStartIndex === null) {
        stopStartIndex = i;
      }

      if (!isStopped && stopStartIndex !== null) {
        const start = points[stopStartIndex];
        const end = points[i - 1];
        const durationMs =
          new Date(end.deviceTime).getTime() -
          new Date(start.deviceTime).getTime();

        if (durationMs >= minStopMs) {
          stops.push({
            startTime: start.deviceTime,
            endTime: end.deviceTime,
            durationSeconds: Math.round(durationMs / 1000),
            lat: start.lat,
            lng: start.lng,
          });
        }

        stopStartIndex = null;
      }
    }

    if (stopStartIndex !== null && points.length > 0) {
      const start = points[stopStartIndex];
      const end = points[points.length - 1];
      const durationMs =
        new Date(end.deviceTime).getTime() -
        new Date(start.deviceTime).getTime();

      if (durationMs >= minStopMs) {
        stops.push({
          startTime: start.deviceTime,
          endTime: end.deviceTime,
          durationSeconds: Math.round(durationMs / 1000),
          lat: start.lat,
          lng: start.lng,
        });
      }
    }

    return {
      imei: query.imei,
      minStopMinutes: query.minStopMinutes ?? 5,
      totalStops: stops.length,
      stops,
    };
  }

  private isRecentlyActive(lastSeenAt?: Date | null): boolean {
    if (!lastSeenAt) return false;
    return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
  }

  private isCurrentlyOnline(device: LiveDeviceState): boolean {
    return Boolean(device.isOnline && this.isRecentlyActive(device.lastSeenAt));
  }

  private hasFreshIgnitionReport(lastIgnitionAt?: Date | null): boolean {
    if (!lastIgnitionAt) return false;
    return (
      Date.now() - new Date(lastIgnitionAt).getTime() <
      IGNITION_STATE_FRESH_MS
    );
  }

  private getCurrentIgnition(device: LiveDeviceState): boolean | undefined {
    if (!this.isCurrentlyOnline(device)) return undefined;
    if (!this.hasFreshIgnitionReport(device.lastIgnitionAt)) return undefined;
    return typeof device.lastIgnition === 'boolean'
      ? device.lastIgnition
      : undefined;
  }

  private hasFreshLocationForLiveState(
    location: LiveLocationSnapshot,
    lastSeenAt?: Date | null,
  ): boolean {
    if (!lastSeenAt || !location.serverTime) return false;

    const lastSeenAtMs = new Date(lastSeenAt).getTime();
    const locationServerTimeMs = new Date(location.serverTime).getTime();

    if (!Number.isFinite(lastSeenAtMs) || !Number.isFinite(locationServerTimeMs)) {
      return false;
    }

    const latestActivityLagMs = lastSeenAtMs - locationServerTimeMs;

    return (
      latestActivityLagMs <= 1000 &&
      Date.now() - locationServerTimeMs < ONLINE_THRESHOLD_MS
    );
  }

  private buildLiveLocation(
    latestLocation: (LocationPointDocument & LiveLocationSnapshot) | null,
    device: LiveDeviceState,
    isOnline: boolean,
  ) {
    if (!latestLocation) {
      return null;
    }

    const location =
      typeof latestLocation.toObject === 'function'
        ? latestLocation.toObject()
        : { ...latestLocation };
    const hasFreshLocation = this.hasFreshLocationForLiveState(
      latestLocation,
      device.lastSeenAt,
    );
    const currentIgnition = this.getCurrentIgnition(device);

    return {
      ...location,
      speed: isOnline && hasFreshLocation ? (latestLocation.speed ?? 0) : 0,
      ignition: isOnline ? currentIgnition : false,
    };
  }
}
