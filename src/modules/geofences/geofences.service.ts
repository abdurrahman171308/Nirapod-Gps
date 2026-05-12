import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Geofence,
  GeofenceDocument,
} from '../../database/schemas/geofence.schema';
import { CreateGeofenceDto, UpdateGeofenceDto } from './dto';
import { DevicesService, UserContext } from '../devices/devices.service';
import { Role } from '../../common/enums/roles.enum';
import { GPS_LOCATION_EVENT } from '../gps-ingest/tcp-server.service';
import { NormalizedTelemetry } from '../../common/types/gps.type';
import { AlertsService } from '../alerts/alerts.service';
import { AlertType } from '../../common/enums/alert-type.enum';

@Injectable()
export class GeofencesService {
  private readonly deviceState = new Map<string, Set<string>>();

  constructor(
    @InjectModel(Geofence.name)
    private readonly geofenceModel: Model<GeofenceDocument>,
    private readonly devicesService: DevicesService,
    private readonly alertsService: AlertsService,
  ) {}

  async create(dto: CreateGeofenceDto) {
    this.validateGeofenceShape(dto);
    const geofence = new this.geofenceModel({
      ...dto,
      type: dto.type ?? 'polygon',
      isActive: dto.isActive ?? true,
      deviceImeis: dto.deviceImeis ?? [],
      points: dto.points ?? [],
    });

    return geofence.save();
  }

  async findAll(user: UserContext) {
    if (user.role === Role.ADMIN) {
      return this.geofenceModel.find().sort({ createdAt: -1 }).lean().exec();
    }

    const assignedImeis = await this.devicesService.getAssignedImeis(
      user.userId,
    );
    if (assignedImeis.length === 0) {
      return [];
    }

    return this.geofenceModel
      .find({
        $or: [
          { deviceImeis: { $size: 0 } },
          { deviceImeis: { $in: assignedImeis } },
        ],
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async update(id: string, dto: UpdateGeofenceDto, user: UserContext) {
    this.validateGeofenceShape(dto);

    if (user.role !== Role.ADMIN) {
      const geofence = await this.geofenceModel.findById(id).lean().exec();
      if (!geofence) {
        throw new NotFoundException('Geofence not found');
      }
      const subscribedIds = user.subscribedDeviceIds ?? [];
      let hasAccess = geofence.deviceImeis.length === 0;
      if (!hasAccess) {
        const checks = await Promise.all(
          geofence.deviceImeis.map((imei) =>
            this.devicesService.isImeiSubscribedByUser(imei, subscribedIds),
          ),
        );
        hasAccess = checks.some(Boolean);
      }
      if (!hasAccess) {
        throw new ForbiddenException('You do not have permission to update this geofence');
      }
    }

    const geofence = await this.geofenceModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();

    if (!geofence) {
      throw new NotFoundException('Geofence not found');
    }

    return geofence;
  }

  async remove(id: string) {
    const result = await this.geofenceModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Geofence not found');
    }
  }

  async assignDevice(id: string, imei: string, user: UserContext) {
    if (user.role !== Role.ADMIN) {
      const owned = await this.devicesService.isImeiSubscribedByUser(imei, user.subscribedDeviceIds ?? []);
      if (!owned) {
        throw new BadRequestException('You can only assign devices that belong to your subscription');
      }
    }

    const geofence = await this.geofenceModel
      .findByIdAndUpdate(
        id,
        { $addToSet: { deviceImeis: imei } },
        { new: true },
      )
      .exec();

    if (!geofence) {
      throw new NotFoundException('Geofence not found');
    }

    return geofence;
  }

  async unassignDevice(id: string, imei: string, user: UserContext) {
    if (user.role !== Role.ADMIN) {
      const owned = await this.devicesService.isImeiSubscribedByUser(imei, user.subscribedDeviceIds ?? []);
      if (!owned) {
        throw new BadRequestException('You can only unassign devices that belong to your subscription');
      }
    }

    const geofence = await this.geofenceModel
      .findByIdAndUpdate(id, { $pull: { deviceImeis: imei } }, { new: true })
      .exec();

    if (!geofence) {
      throw new NotFoundException('Geofence not found');
    }

    return geofence;
  }

  @OnEvent(GPS_LOCATION_EVENT)
  async evaluateGeofences(telemetry: NormalizedTelemetry) {
    const geofences = await this.geofenceModel
      .find({
        isActive: true,
        $or: [{ deviceImeis: { $size: 0 } }, { deviceImeis: telemetry.imei }],
      })
      .lean()
      .exec();

    if (geofences.length === 0) {
      return;
    }

    const currentInside = new Set<string>();

    for (const geofence of geofences) {
      const inside = this.isInsideGeofence(
        geofence,
        telemetry.lat,
        telemetry.lng,
      );

      if (inside) {
        currentInside.add(geofence._id.toString());
      }
    }

    const previousInside =
      this.deviceState.get(telemetry.imei) ?? new Set<string>();
    const entered = [...currentInside].filter((id) => !previousInside.has(id));
    const exited = [...previousInside].filter((id) => !currentInside.has(id));

    if (entered.length || exited.length) {
      const device = await this.devicesService.getOrCreateDevice(
        telemetry.imei,
      );

      for (const geofenceId of entered) {
        const geofence = geofences.find((g) => g._id.toString() === geofenceId);
        if (!geofence) {
          continue;
        }

        await this.alertsService.create(
          device._id,
          telemetry.imei,
          AlertType.GEOFENCE_ENTER,
          `Entered geofence: ${geofence.name}`,
          telemetry.lat,
          telemetry.lng,
          telemetry.speed,
          {
            geofenceId,
            geofenceName: geofence.name,
            deviceTime: telemetry.deviceTime,
          },
        );
      }

      for (const geofenceId of exited) {
        const geofence = geofences.find((g) => g._id.toString() === geofenceId);
        if (!geofence) {
          continue;
        }

        await this.alertsService.create(
          device._id,
          telemetry.imei,
          AlertType.GEOFENCE_EXIT,
          `Exited geofence: ${geofence.name}`,
          telemetry.lat,
          telemetry.lng,
          telemetry.speed,
          {
            geofenceId,
            geofenceName: geofence.name,
            deviceTime: telemetry.deviceTime,
          },
        );
      }
    }

    this.deviceState.set(telemetry.imei, currentInside);
  }

  private validateGeofenceShape(dto: Partial<CreateGeofenceDto>) {
    const type = dto.type ?? 'polygon';

    if (type === 'polygon') {
      if (!dto.points || dto.points.length < 3) {
        throw new BadRequestException(
          'Polygon geofence requires at least 3 points',
        );
      }
    }

    if (type === 'circle') {
      if (
        dto.centerLat === undefined ||
        dto.centerLng === undefined ||
        dto.radiusMeters === undefined
      ) {
        throw new BadRequestException(
          'Circle geofence requires centerLat, centerLng and radiusMeters',
        );
      }
    }
  }

  private isInsideGeofence(
    geofence: Geofence,
    lat: number,
    lng: number,
  ): boolean {
    if (geofence.type === 'circle') {
      if (
        geofence.centerLat === undefined ||
        geofence.centerLng === undefined ||
        geofence.radiusMeters === undefined
      ) {
        return false;
      }

      return (
        this.haversineDistanceMeters(
          lat,
          lng,
          geofence.centerLat,
          geofence.centerLng,
        ) <= geofence.radiusMeters
      );
    }

    if (!geofence.points || geofence.points.length < 3) {
      return false;
    }

    return this.pointInPolygon(lat, lng, geofence.points);
  }

  private pointInPolygon(
    lat: number,
    lng: number,
    points: Array<{ lat: number; lng: number }>,
  ) {
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].lng;
      const yi = points[i].lat;
      const xj = points[j].lng;
      const yj = points[j].lat;

      const intersect =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  private haversineDistanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ) {
    const r = 6371000;
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
