import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alert, AlertDocument } from '../../database/schemas/alert.schema';
import {
  LocationPoint,
  LocationPointDocument,
} from '../../database/schemas/location-point.schema';
import { AlertType } from '../../common/enums/alert-type.enum';
import { DevicesService, UserContext } from '../devices/devices.service';
import { DeviceReportQueryDto, IdleTimeReportQueryDto } from './dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(LocationPoint.name)
    private readonly locationPointModel: Model<LocationPointDocument>,
    @InjectModel(Alert.name)
    private readonly alertModel: Model<AlertDocument>,
    private readonly devicesService: DevicesService,
  ) {}

  async getDailyDistance(query: DeviceReportQueryDto, user: UserContext) {
    await this.devicesService.validateDeviceAccessByImei(query.imei, user);
    const points = await this.getPoints(query);

    const byDay = new Map<string, Array<{ lat: number; lng: number }>>();

    for (const point of points) {
      const day = new Date(point.deviceTime).toISOString().slice(0, 10);
      if (!byDay.has(day)) {
        byDay.set(day, []);
      }
      byDay.get(day)?.push({ lat: point.lat, lng: point.lng });
    }

    const days = [...byDay.entries()].map(([day, values]) => {
      const distanceKm = this.calculateDistance(values);
      return { day, distanceKm: Math.round(distanceKm * 100) / 100 };
    });

    const totalDistanceKm = days.reduce((sum, d) => sum + d.distanceKm, 0);

    return {
      imei: query.imei,
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      days,
    };
  }

  async getIdleTime(query: IdleTimeReportQueryDto, user: UserContext) {
    await this.devicesService.validateDeviceAccessByImei(query.imei, user);

    const points = await this.getPoints(query);
    const thresholdMs = (query.idleThresholdMinutes ?? 5) * 60 * 1000;

    let totalIdleMs = 0;
    let idleStart: Date | null = null;

    for (const point of points) {
      const isIdle = (point.speed ?? 0) <= 1;

      if (isIdle && !idleStart) {
        idleStart = point.deviceTime;
      }

      if (!isIdle && idleStart) {
        const idleMs =
          new Date(point.deviceTime).getTime() - new Date(idleStart).getTime();
        if (idleMs >= thresholdMs) {
          totalIdleMs += idleMs;
        }
        idleStart = null;
      }
    }

    if (idleStart && points.length > 0) {
      const end = points[points.length - 1].deviceTime;
      const idleMs = new Date(end).getTime() - new Date(idleStart).getTime();
      if (idleMs >= thresholdMs) {
        totalIdleMs += idleMs;
      }
    }

    return {
      imei: query.imei,
      idleThresholdMinutes: query.idleThresholdMinutes ?? 5,
      totalIdleSeconds: Math.round(totalIdleMs / 1000),
      totalIdleHours: Math.round((totalIdleMs / (1000 * 60 * 60)) * 100) / 100,
    };
  }

  async getOverspeedReport(query: DeviceReportQueryDto, user: UserContext) {
    await this.devicesService.validateDeviceAccessByImei(query.imei, user);

    const filter: any = { imei: query.imei, type: AlertType.OVERSPEED };

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) {
        filter.createdAt.$gte = new Date(query.from);
      }
      if (query.to) {
        filter.createdAt.$lte = new Date(query.to);
      }
    }

    const alerts = await this.alertModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const maxSpeed = alerts.reduce(
      (max, alert) => Math.max(max, alert.speed ?? 0),
      0,
    );

    return {
      imei: query.imei,
      totalOverspeedAlerts: alerts.length,
      maxRecordedSpeed: maxSpeed,
      alerts,
    };
  }

  async getEngineHours(query: DeviceReportQueryDto, user: UserContext) {
    await this.devicesService.validateDeviceAccessByImei(query.imei, user);

    const points = await this.getPoints(query);
    let engineOnMs = 0;
    let engineStartCount = 0;
    let prevIgnition: boolean | undefined = undefined;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const curr = point.ignition ?? false;

      // Count OFF → ON transitions as engine starts
      if (prevIgnition === false && curr === true) {
        engineStartCount++;
      }

      if (i > 0 && (points[i - 1].ignition ?? false)) {
        const deltaMs =
          new Date(point.deviceTime).getTime() -
          new Date(points[i - 1].deviceTime).getTime();
        if (deltaMs > 0 && deltaMs <= 10 * 60 * 1000) {
          engineOnMs += deltaMs;
        }
      }

      prevIgnition = curr;
    }

    return {
      imei: query.imei,
      engineStartCount,
      engineOnSeconds: Math.round(engineOnMs / 1000),
      engineOnHours: Math.round((engineOnMs / (1000 * 60 * 60)) * 100) / 100,
    };
  }

  private async getPoints(query: DeviceReportQueryDto) {
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

    return this.locationPointModel
      .find(filter)
      .sort({ deviceTime: 1 })
      .select('lat lng speed deviceTime ignition')
      .lean()
      .exec();
  }

  private calculateDistance(points: Array<{ lat: number; lng: number }>) {
    let total = 0;

    for (let i = 1; i < points.length; i++) {
      total += this.haversine(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    }

    return total;
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
    const r = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
  }

  private toRad(value: number) {
    return value * (Math.PI / 180);
  }
}
