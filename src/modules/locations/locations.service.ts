import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LocationPoint,
  LocationPointDocument,
} from '../../database/schemas/location-point.schema';
import { LocationHistoryQueryDto } from './dto';
import { DevicesService, UserContext } from '../devices/devices.service';

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(LocationPoint.name)
    private locationPointModel: Model<LocationPointDocument>,
    private devicesService: DevicesService,
  ) {}

  async getHistory(
    imei: string,
    query: LocationHistoryQueryDto,
    user: UserContext,
  ): Promise<{
    locations: any[];
    total: number;
    hasMore: boolean;
  }> {
    // Validate user has access to this device
    await this.devicesService.validateDeviceAccessByImei(imei, user);

    const filter: any = { imei };

    if (query.from || query.to) {
      filter.deviceTime = {};

      if (query.from) {
        filter.deviceTime.$gte = new Date(query.from);
      }

      if (query.to) {
        filter.deviceTime.$lte = new Date(query.to);
      }
    }

    const limit = query.limit || 1000;
    const skip = query.skip || 0;

    const [locations, total] = await Promise.all([
      this.locationPointModel
        .find(filter)
        .sort({ deviceTime: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.locationPointModel.countDocuments(filter).exec(),
    ]);

    return {
      locations,
      total,
      hasMore: skip + locations.length < total,
    };
  }

  async getHistoryAsPolyline(
    imei: string,
    query: LocationHistoryQueryDto,
    user: UserContext,
  ): Promise<{
    points: { lat: number; lng: number; speed: number; deviceTime: Date }[];
    total: number;
  }> {
    const result = await this.getHistory(imei, query, user);

    return {
      points: result.locations.map((loc) => ({
        lat: loc.lat,
        lng: loc.lng,
        speed: loc.speed,
        deviceTime: loc.deviceTime,
      })),
      total: result.total,
    };
  }

  async getStatistics(
    imei: string,
    from: Date,
    to: Date,
    user: UserContext,
  ): Promise<{
    totalPoints: number;
    maxSpeed: number;
    avgSpeed: number;
    totalDistance: number;
  }> {
    // Validate user has access to this device
    await this.devicesService.validateDeviceAccessByImei(imei, user);

    const stats = await this.locationPointModel.aggregate([
      {
        $match: {
          imei,
          deviceTime: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          totalPoints: { $sum: 1 },
          maxSpeed: { $max: '$speed' },
          avgSpeed: { $avg: '$speed' },
        },
      },
    ]);

    if (stats.length === 0) {
      return {
        totalPoints: 0,
        maxSpeed: 0,
        avgSpeed: 0,
        totalDistance: 0,
      };
    }

    const locations = await this.locationPointModel
      .find({
        imei,
        deviceTime: { $gte: from, $lte: to },
      })
      .sort({ deviceTime: 1 })
      .select('lat lng')
      .lean()
      .exec();

    const totalDistance = this.calculateTotalDistance(locations);

    return {
      totalPoints: stats[0].totalPoints,
      maxSpeed: stats[0].maxSpeed || 0,
      avgSpeed: Math.round((stats[0].avgSpeed || 0) * 100) / 100,
      totalDistance: Math.round(totalDistance * 100) / 100,
    };
  }

  private calculateTotalDistance(
    locations: { lat: number; lng: number }[],
  ): number {
    let totalDistance = 0;

    for (let i = 1; i < locations.length; i++) {
      totalDistance += this.haversineDistance(
        locations[i - 1].lat,
        locations[i - 1].lng,
        locations[i].lat,
        locations[i].lng,
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
    const R = 6371;
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

  async deleteOldLocations(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.locationPointModel
      .deleteMany({ createdAt: { $lt: cutoffDate } })
      .exec();

    return result.deletedCount;
  }
}
