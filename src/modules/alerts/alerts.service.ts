import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Alert, AlertDocument } from '../../database/schemas/alert.schema';
import { Device, DeviceDocument } from '../../database/schemas/device.schema';
import { AlertType } from '../../common/enums/alert-type.enum';
import { NormalizedTelemetry } from '../../common/types/gps.type';
import {
  GPS_LOCATION_EVENT,
  GPS_ALARM_EVENT,
  GPS_DEVICE_DISCONNECTED,
} from '../gps-ingest/tcp-server.service';
import { AlertQueryDto } from './dto';
import { DevicesService, UserContext } from '../devices/devices.service';
import { Role } from '../../common/enums/roles.enum';
import { FcmService } from '../fcm/fcm.service';
import { UsersService } from '../users/users.service';

export const ALERT_CREATED_EVENT = 'alert.created';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private lastAlertTime: Map<string, number> = new Map();
  private readonly ALERT_COOLDOWN_MS = 60000;
  // Tracks last known ignition state per device to detect ON/OFF transitions
  private ignitionState: Map<string, boolean> = new Map();
  // How long a device must be silent with engine-ON before we treat it as engine-OFF
  private readonly STALE_ENGINE_MS = 4 * 60 * 1000; // 4 minutes

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
    private devicesService: DevicesService,
    private fcmService: FcmService,
    private usersService: UsersService,
  ) {}

  async create(
    deviceId: Types.ObjectId | undefined,
    imei: string | undefined,
    type: AlertType,
    message: string,
    lat?: number,
    lng?: number,
    speed?: number,
    meta?: Record<string, any>,
  ): Promise<AlertDocument> {
    const alert = new this.alertModel({
      ...(deviceId && { deviceId }),
      ...(imei && { imei }),
      type,
      message,
      lat,
      lng,
      speed,
      meta,
    });

    const savedAlert = await alert.save();

    // Fire FCM push to the device owner (non-blocking); skip for system notifications (no device)
    if (deviceId) {
      this.sendPushForAlert(deviceId, type, message).catch((err) =>
        this.logger.error(`FCM push error: ${err}`),
      );
    }

    return savedAlert;
  }

  async findByDevice(
    imei: string,
    query: AlertQueryDto,
    user: UserContext,
  ): Promise<{ alerts: any[]; total: number }> {
    // Validate user has access to this device
    await this.devicesService.validateDeviceAccessByImei(imei, user);

    const filter: any = { imei };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.isAcknowledged !== undefined) {
      filter.isAcknowledged = query.isAcknowledged;
    }

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) {
        filter.createdAt.$gte = new Date(query.from);
      }
      if (query.to) {
        filter.createdAt.$lte = new Date(query.to);
      }
    }

    const [alerts, total] = await Promise.all([
      this.alertModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(query.skip || 0)
        .limit(query.limit || 50)
        .lean()
        .exec(),
      this.alertModel.countDocuments(filter).exec(),
    ]);

    return {
      alerts,
      total,
    };
  }

  async findAll(
    query: AlertQueryDto,
  ): Promise<{ alerts: any[]; total: number }> {
    const filter: any = {};

    if (query.type) {
      filter.type = query.type;
    }

    if (query.isAcknowledged !== undefined) {
      filter.isAcknowledged = query.isAcknowledged;
    }

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) {
        filter.createdAt.$gte = new Date(query.from);
      }
      if (query.to) {
        filter.createdAt.$lte = new Date(query.to);
      }
    }

    const [alerts, total] = await Promise.all([
      this.alertModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(query.skip || 0)
        .limit(query.limit || 50)
        .lean()
        .exec(),
      this.alertModel.countDocuments(filter).exec(),
    ]);

    return {
      alerts,
      total,
    };
  }

  async acknowledge(
    alertId: string,
    user: UserContext,
  ): Promise<AlertDocument | null> {
    const alert = await this.alertModel.findById(alertId).exec();

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    // Validate user has access to the device this alert belongs to (skip for system notifications)
    if (alert.imei) {
      await this.devicesService.validateDeviceAccessByImei(alert.imei, user);
    }

    const updatedAlert = await this.alertModel
      .findByIdAndUpdate(
        alertId,
        {
          isAcknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy: new Types.ObjectId(user.userId),
        },
        { new: true },
      )
      .exec();

    return updatedAlert;
  }

  async acknowledgeMultiple(
    alertIds: string[],
    userId: string,
  ): Promise<number> {
    const result = await this.alertModel
      .updateMany(
        { _id: { $in: alertIds.map((id) => new Types.ObjectId(id)) } },
        {
          isAcknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy: new Types.ObjectId(userId),
        },
      )
      .exec();

    return result.modifiedCount;
  }

  async findForMyDevices(
    query: AlertQueryDto,
    user: UserContext,
  ): Promise<{ alerts: any[]; total: number }> {
    const assignedImeis = await this.devicesService.getAssignedImeis(user.userId);

    const orClauses: any[] = [{ type: AlertType.SYSTEM_NOTIFICATION }];
    if (assignedImeis.length > 0) orClauses.push({ imei: { $in: assignedImeis } });

    const filter: any = { $or: orClauses };

    if (query.type) filter.type = query.type;
    if (query.isAcknowledged !== undefined) filter.isAcknowledged = query.isAcknowledged;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    const [alerts, total] = await Promise.all([
      this.alertModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(query.skip || 0)
        .limit(query.limit || 50)
        .lean()
        .exec(),
      this.alertModel.countDocuments(filter).exec(),
    ]);

    return { alerts, total };
  }

  /** Notification inbox for the current user — alerts for their devices, newest first */
  async getNotifications(
    user: UserContext,
    query: AlertQueryDto,
  ): Promise<{ alerts: any[]; total: number; unreadCount: number }> {
    // Admins see all alerts
    const filter: any = {};
    if (user.role !== Role.ADMIN) {
      const assignedImeis = await this.devicesService.getAssignedImeis(user.userId);
      // Always include SYSTEM_NOTIFICATION (broadcast alerts have no imei)
      if (assignedImeis.length === 0) {
        filter.$or = [{ type: AlertType.SYSTEM_NOTIFICATION }];
      } else {
        filter.$or = [
          { imei: { $in: assignedImeis } },
          { type: AlertType.SYSTEM_NOTIFICATION },
        ];
      }
    }
    if (query.type) filter.type = query.type;
    if (query.isAcknowledged !== undefined) filter.isAcknowledged = query.isAcknowledged;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    const [alerts, total, unreadCount] = await Promise.all([
      this.alertModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(query.skip || 0)
        .limit(query.limit || 50)
        .lean()
        .exec(),
      this.alertModel.countDocuments(filter).exec(),
      this.alertModel.countDocuments({ ...(filter.$or ? { $or: filter.$or } : {}), isRead: false }).exec(),
    ]);

    return { alerts, total, unreadCount };
  }

  /** Latest 5 unacknowledged alerts for the current user — for notification badge/preview */
  async getLatestUnacknowledged(user: UserContext): Promise<any[]> {
    // Admins see all unacknowledged alerts
    if (user.role === Role.ADMIN) {
      return this.alertModel
        .find({ isAcknowledged: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .exec();
    }

    const assignedImeis = await this.devicesService.getAssignedImeis(user.userId);

    const orClauses: any[] = [{ type: AlertType.SYSTEM_NOTIFICATION }];
    if (assignedImeis.length > 0) orClauses.push({ imei: { $in: assignedImeis } });

    return this.alertModel
      .find({ isAcknowledged: false, $or: orClauses })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();
  }

  /** Mark a single alert as read */
  async markAsRead(alertId: string, user: UserContext): Promise<AlertDocument | null> {
    const alert = await this.alertModel.findById(alertId).exec();
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);

    if (alert.imei) {
      await this.devicesService.validateDeviceAccessByImei(alert.imei, user);
    }

    return this.alertModel
      .findByIdAndUpdate(alertId, { isRead: true, readAt: new Date() }, { new: true })
      .exec();
  }

  /** Mark all unread alerts for the user's devices as read */
  async markAllAsRead(user: UserContext): Promise<number> {
    const now = new Date();
    const userId = new Types.ObjectId(user.userId);

    if (user.role === Role.ADMIN) {
      const result = await this.alertModel
        .updateMany(
          { $or: [{ isRead: false }, { isAcknowledged: false }] },
          {
            isRead: true,
            readAt: now,
            isAcknowledged: true,
            acknowledgedAt: now,
            acknowledgedBy: userId,
          },
        )
        .exec();
      return result.modifiedCount;
    }

    const assignedImeis = await this.devicesService.getAssignedImeis(user.userId);

    const deviceOrClauses: any[] = [{ type: AlertType.SYSTEM_NOTIFICATION }];
    if (assignedImeis.length > 0) deviceOrClauses.push({ imei: { $in: assignedImeis } });

    const result = await this.alertModel
      .updateMany(
        {
          $or: deviceOrClauses,
          $and: [{ $or: [{ isRead: false }, { isAcknowledged: false }] }],
        },
        {
          isRead: true,
          readAt: now,
          isAcknowledged: true,
          acknowledgedAt: now,
          acknowledgedBy: userId,
        },
      )
      .exec();

    return result.modifiedCount;
  }

  async getUnacknowledgedCount(user: UserContext): Promise<number> {
    // For admin, count all unacknowledged alerts
    if (user.role === Role.ADMIN) {
      return this.alertModel.countDocuments({ isAcknowledged: false }).exec();
    }

    // For regular users, count only alerts for their assigned devices
    const assignedImeis = await this.devicesService.getAssignedImeis(user.userId);

    const orClauses: any[] = [{ type: AlertType.SYSTEM_NOTIFICATION }];
    if (assignedImeis.length > 0) orClauses.push({ imei: { $in: assignedImeis } });

    return this.alertModel
      .countDocuments({ isAcknowledged: false, $or: orClauses })
      .exec();
  }

  private async sendPushForAlert(
    deviceId: Types.ObjectId,
    type: AlertType,
    message: string,
  ): Promise<void> {
    const device = await this.deviceModel.findById(deviceId).select('assignedUserId name plateNumber').lean().exec();
    if (!device?.assignedUserId) return;

    const fcmToken = await this.usersService.getFcmTokenByUserId(
      device.assignedUserId.toString(),
    );
    if (!fcmToken) return;

    await this.fcmService.sendToToken(fcmToken, `Alert: ${type}`, message, {
      deviceName: device.name,
      plateNumber: device.plateNumber ?? '',
      type,
      alertId: deviceId.toString(),
    });
  }

  @OnEvent(GPS_LOCATION_EVENT)
  async checkOverspeed(telemetry: NormalizedTelemetry): Promise<void> {
    try {
      const device = await this.devicesService.getOrCreateDevice(telemetry.imei);

      if (telemetry.speed > device.speedLimitKph) {
        const alertKey = `${telemetry.imei}:${AlertType.OVERSPEED}`;
        const lastAlert = this.lastAlertTime.get(alertKey);
        const now = Date.now();

        if (lastAlert && now - lastAlert < this.ALERT_COOLDOWN_MS) {
          return;
        }

        this.lastAlertTime.set(alertKey, now);

        const message = `Speed limit exceeded: ${telemetry.speed} km/h (limit: ${device.speedLimitKph} km/h)`;

        await this.create(
          device._id,
          telemetry.imei,
          AlertType.OVERSPEED,
          message,
          telemetry.lat,
          telemetry.lng,
          telemetry.speed,
          {
            speedLimit: device.speedLimitKph,
            actualSpeed: telemetry.speed,
            deviceTime: telemetry.deviceTime,
          },
        );

        this.logger.log(
          `Overspeed alert: ${telemetry.imei} - ${telemetry.speed} km/h`,
        );
      }
    } catch (error) {
      this.logger.error(`Error checking overspeed: ${error}`);
    }
  }

  @OnEvent(GPS_LOCATION_EVENT)
  async checkIgnitionChange(telemetry: NormalizedTelemetry): Promise<void> {
    if (telemetry.ignition === undefined) return;

    const prev = this.ignitionState.get(telemetry.imei);
    const curr = telemetry.ignition;

    if (prev === curr) return;

    // First data point with ignition=OFF — just record, no alert needed
    if (prev === undefined && !curr) {
      this.ignitionState.set(telemetry.imei, curr);
      return;
    }

    this.ignitionState.set(telemetry.imei, curr);

    try {
      const device = await this.devicesService.getOrCreateDevice(telemetry.imei);

      const type = curr ? AlertType.ENGINE_ON : AlertType.ENGINE_OFF;
      const deviceLabel = device.plateNumber
        ? `${device.name} (${device.plateNumber})`
        : device.name;
      const message = curr
        ? `Engine turned ON for ${deviceLabel}`
        : `Engine turned OFF for ${deviceLabel}`;

      await this.create(
        device._id,
        telemetry.imei,
        type,
        message,
        telemetry.lat,
        telemetry.lng,
        telemetry.speed,
        { deviceTime: telemetry.deviceTime },
      );

      this.devicesService
        .recordIgnitionChange(telemetry.imei, telemetry.serverTime, curr)
        .catch((err) => this.logger.error(`recordIgnitionChange failed: ${err}`));

      this.logger.log(`Ignition ${curr ? 'ON' : 'OFF'}: ${telemetry.imei}`);
    } catch (error) {
      this.logger.error(`Error checking ignition change: ${error}`);
    }
  }

  @OnEvent(GPS_DEVICE_DISCONNECTED)
  async handleDeviceDisconnected(data: { imei: string }): Promise<void> {
    const lastIgnition = this.ignitionState.get(data.imei);
    // Clear ignition state on disconnect so next connect gets a fresh reading
    this.ignitionState.delete(data.imei);

    // Device stopped transmitting with engine ON → treat disconnect as ENGINE_OFF
    if (lastIgnition === true) {
      try {
        const now = new Date();
        const device = await this.devicesService.getOrCreateDevice(data.imei);
        const deviceLabel = device.plateNumber
          ? `${device.name} (${device.plateNumber})`
          : device.name;
        await this.create(
          device._id,
          data.imei,
          AlertType.ENGINE_OFF,
          `Engine turned OFF for ${deviceLabel}`,
          undefined,
          undefined,
          undefined,
          { trigger: 'disconnect' },
        );
        await this.devicesService.recordIgnitionChange(data.imei, now, false);
        this.logger.log(`ENGINE_OFF alert (disconnect): ${data.imei}`);
      } catch (error) {
        this.logger.error(`Error creating ENGINE_OFF alert on disconnect: ${error}`);
      }
    }
  }

  /**
   * Runs every minute. For any device last tracked with engine ON that has been
   * silent for STALE_ENGINE_MS, fire an ENGINE_OFF alert immediately rather than
   * waiting up to 15 minutes for the TCP socket timeout to trigger the disconnect handler.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async detectStaleEngineOn(): Promise<void> {
    if (this.ignitionState.size === 0) return;

    const staleThreshold = new Date(Date.now() - this.STALE_ENGINE_MS);

    for (const [imei, ignition] of this.ignitionState.entries()) {
      if (!ignition) continue;

      try {
        const device = await this.deviceModel
          .findOne({ imei })
          .select('_id name plateNumber lastSeenAt isOnline')
          .lean()
          .exec();

        if (!device) continue;
        if (device.isOnline) continue;
        if (device.lastSeenAt && new Date(device.lastSeenAt) > staleThreshold) continue;

        // Device is offline and has been silent long enough — create ENGINE_OFF
        this.ignitionState.set(imei, false);

        const now = new Date();
        const deviceLabel = device.plateNumber
          ? `${device.name} (${device.plateNumber})`
          : device.name;

        await this.create(
          device._id as Types.ObjectId,
          imei,
          AlertType.ENGINE_OFF,
          `Engine turned OFF for ${deviceLabel}`,
          undefined,
          undefined,
          undefined,
          { trigger: 'stale' },
        );
        await this.devicesService.recordIgnitionChange(imei, now, false);

        this.logger.log(`ENGINE_OFF alert (stale): ${imei}`);
      } catch (error) {
        this.logger.error(`ENGINE_OFF stale check failed for ${imei}: ${error}`);
      }
    }
  }

  @OnEvent(GPS_ALARM_EVENT)
  async handleDeviceAlarm(alarmData: any): Promise<void> {
    try {
      const device = await this.devicesService.getOrCreateDevice(alarmData.imei);

      let alertType: AlertType;
      switch (alarmData.alarmType) {
        case 1:
          alertType = AlertType.SOS;
          break;
        case 2:
          alertType = AlertType.POWER_CUT;
          break;
        case 3:
          alertType = AlertType.VIBRATION;
          break;
        case 4:
          alertType = AlertType.GEOFENCE_ENTER;
          break;
        case 5:
          alertType = AlertType.GEOFENCE_EXIT;
          break;
        case 6:
          alertType = AlertType.OVERSPEED;
          break;
        default:
          return;
      }

      await this.create(
        device._id,
        alarmData.imei,
        alertType,
        `Device alarm: ${alarmData.alarmDescription}`,
        alarmData.lat,
        alarmData.lng,
        alarmData.speed,
        {
          alarmType: alarmData.alarmType,
          alarmDescription: alarmData.alarmDescription,
          deviceTime: alarmData.deviceTime,
        },
      );

      this.logger.log(
        `Device alarm: ${alarmData.imei} - ${alarmData.alarmDescription}`,
      );
    } catch (error) {
      this.logger.error(`Error handling device alarm: ${error}`);
    }
  }
}
