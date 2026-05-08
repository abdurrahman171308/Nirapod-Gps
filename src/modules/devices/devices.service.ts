import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Device, DeviceDocument } from '../../database/schemas/device.schema';
import {
  LocationPoint,
  LocationPointDocument,
} from '../../database/schemas/location-point.schema';
import { CreateDeviceDto, UpdateDeviceDto } from './dto';
import { TcpServerService } from '../gps-ingest/tcp-server.service';
import { NormalizedTelemetry } from '../../common/types/gps.type';
import {
  GPS_LOCATION_EVENT,
  GPS_DEVICE_CONNECTED,
  GPS_DEVICE_DISCONNECTED,
  GPS_DEVICE_HEARTBEAT,
} from '../gps-ingest/tcp-server.service';
import { Role } from '../../common/enums/roles.enum';
import { UsersService } from '../users/users.service';

// Must be longer than the device's heartbeat interval with headroom.
// Matches the TCP socket timeout (15 min) so a device is only marked offline
// after the TCP connection itself would have dropped.
export const ONLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
export const IGNITION_STATE_FRESH_MS = ONLINE_THRESHOLD_MS;

export interface UserContext {
  userId: string;
  role: Role;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
    @InjectModel(LocationPoint.name)
    private locationPointModel: Model<LocationPointDocument>,
    private tcpServerService: TcpServerService,
    private usersService: UsersService,
  ) {}

  async create(createDeviceDto: CreateDeviceDto): Promise<DeviceDocument> {
    const existingDevice = await this.deviceModel
      .findOne({ imei: createDeviceDto.imei })
      .exec();

    if (existingDevice) {
      throw new ConflictException(
        `Device with IMEI ${createDeviceDto.imei} already exists`,
      );
    }

    if (createDeviceDto.assignedUserId) {
      await this.ensureUserExists(createDeviceDto.assignedUserId);
    }

    const device = new this.deviceModel({
      ...createDeviceDto,
      assignedUserId: createDeviceDto.assignedUserId
        ? new Types.ObjectId(createDeviceDto.assignedUserId)
        : undefined,
      isActive: true,
      isOnline: false,
    });

    return device.save();
  }

  async findAll(user: UserContext): Promise<any[]> {
    const filter: any = {};

    // Regular users can only see devices assigned to them
    if (user.role !== Role.ADMIN) {
      filter.assignedUserId = new Types.ObjectId(user.userId);
    }

    const devices = await this.deviceModel
      .find(filter)
      .populate('assignedUserId', 'email firstName lastName')
      .lean()
      .exec();

    return devices.map((device) => ({
      ...device,
      isOnline: this.isCurrentlyOnline(device),
      latestLocation: device.lastLat
        ? {
            lat: device.lastLat,
            lng: device.lastLng,
            speed: device.lastSpeed,
            course: device.lastCourse,
            lastSeenAt: device.lastSeenAt,
          }
        : null,
    }));
  }

  async findByImei(imei: string, user: UserContext): Promise<any> {
    const device = await this.deviceModel
      .findOne({ imei })
      .populate('assignedUserId', 'email firstName lastName')
      .lean()
      .exec();

    if (!device) {
      throw new NotFoundException(`Device with IMEI ${imei} not found`);
    }

    // Check if user has access to this device
    this.validateDeviceAccess(device, user);

    const latestLocation = await this.locationPointModel
      .findOne({ imei })
      .sort({ deviceTime: -1 })
      .lean()
      .exec();

    return {
      ...device,
      isOnline: this.isCurrentlyOnline(device),
      latestLocation,
    };
  }

  /**
   * Validates if a user has access to a device
   * Admin can access all devices, users can only access assigned devices
   */
  validateDeviceAccess(device: any, user: UserContext): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    const assignedUserId =
      typeof device.assignedUserId === 'object' && device.assignedUserId?._id
        ? device.assignedUserId._id.toString()
        : device.assignedUserId?.toString();
    if (!assignedUserId || assignedUserId !== user.userId) {
      throw new ForbiddenException('You do not have access to this device');
    }
  }

  /**
   * Validates if a user has access to a device by IMEI
   */
  async validateDeviceAccessByImei(
    imei: string,
    user: UserContext,
  ): Promise<DeviceDocument> {
    const device = await this.deviceModel.findOne({ imei }).exec();

    if (!device) {
      throw new NotFoundException(`Device with IMEI ${imei} not found`);
    }

    this.validateDeviceAccess(device, user);
    return device;
  }

  async findById(id: string | Types.ObjectId): Promise<DeviceDocument | null> {
    return this.deviceModel.findById(id).exec();
  }

  async update(
    imei: string,
    updateDeviceDto: UpdateDeviceDto,
  ): Promise<DeviceDocument> {
    const device = await this.deviceModel
      .findOneAndUpdate({ imei }, updateDeviceDto, { new: true })
      .exec();

    if (!device) {
      throw new NotFoundException(`Device with IMEI ${imei} not found`);
    }

    return device;
  }

  async delete(imei: string): Promise<void> {
    const result = await this.deviceModel.deleteOne({ imei }).exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Device with IMEI ${imei} not found`);
    }

    await this.locationPointModel.deleteMany({ imei }).exec();
  }

  async getLatestLocation(
    imei: string,
    user: UserContext,
  ): Promise<LocationPointDocument | null> {
    await this.validateDeviceAccessByImei(imei, user);

    return this.locationPointModel
      .findOne({ imei })
      .sort({ deviceTime: -1 })
      .exec();
  }

  /**
   * Assign a device to a user (Admin only)
   */
  async assignToUser(
    imei: string,
    userId: string | null,
  ): Promise<DeviceDocument> {
    if (userId) {
      await this.ensureUserExists(userId);
    }

    const device = await this.deviceModel
      .findOneAndUpdate(
        { imei },
        { assignedUserId: userId ? new Types.ObjectId(userId) : null },
        { new: true },
      )
      .exec();

    if (!device) {
      throw new NotFoundException(`Device with IMEI ${imei} not found`);
    }

    return device;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  /**
   * Get all IMEIs assigned to a user
   */
  async getAssignedImeis(userId: string): Promise<string[]> {
    const devices = await this.deviceModel
      .find({ assignedUserId: new Types.ObjectId(userId) })
      .select('imei')
      .lean()
      .exec();

    return devices.map((d) => d.imei);
  }

  async setEngineCut(imei: string, isEngineCut: boolean): Promise<void> {
    await this.deviceModel.updateOne({ imei }, { isEngineCut });
  }

  async getOrCreateDevice(imei: string): Promise<DeviceDocument> {
    let device = await this.deviceModel.findOne({ imei }).exec();

    if (!device) {
      device = new this.deviceModel({
        imei,
        name: `Device ${imei}`,
        isActive: true,
        isOnline: true,
      });
      await device.save();
      this.logger.log(`Auto-created device: ${imei}`);
    }

    return device;
  }

  @OnEvent(GPS_LOCATION_EVENT)
  async handleLocationEvent(telemetry: NormalizedTelemetry): Promise<void> {
    try {
      const device = await this.getOrCreateDevice(telemetry.imei);

      const locationUpdate: Record<string, unknown> = {
        lastLat: telemetry.lat,
        lastLng: telemetry.lng,
        lastSpeed: telemetry.speed,
        lastCourse: telemetry.course,
        lastSeenAt: telemetry.serverTime,
        isOnline: true,
      };
      if (telemetry.ignition !== undefined) {
        locationUpdate.lastIgnition = telemetry.ignition;
        locationUpdate.lastIgnitionAt = telemetry.serverTime;
      }

      await this.deviceModel.updateOne({ imei: telemetry.imei }, locationUpdate);

      const deviceTime =
        telemetry.deviceTime instanceof Date &&
        !isNaN(telemetry.deviceTime.getTime())
          ? telemetry.deviceTime
          : telemetry.serverTime;

      const locationPoint = new this.locationPointModel({
        deviceId: device._id,
        imei: telemetry.imei,
        lat: telemetry.lat,
        lng: telemetry.lng,
        speed: telemetry.speed,
        course: telemetry.course,
        deviceTime,
        serverTime: telemetry.serverTime,
        satellites: telemetry.satellites,
        ignition: telemetry.ignition,
        battery: telemetry.battery,
        gsmSignal: telemetry.gsmSignal,
        raw: telemetry.raw,
      });

      await locationPoint.save();
    } catch (error) {
      this.logger.error(`Error handling location event: ${error}`);
    }
  }

  @OnEvent(GPS_DEVICE_CONNECTED)
  async handleDeviceConnected(data: { imei: string }): Promise<void> {
    await this.deviceModel.updateOne(
      { imei: data.imei },
      { isOnline: true, lastSeenAt: new Date() },
    );

    // Re-enforce engine cut if it was active before the device disconnected
    const device = await this.deviceModel.findOne({ imei: data.imei }).select('isEngineCut').lean().exec();
    if (device?.isEngineCut) {
      const sent = this.tcpServerService.sendCommand(
        data.imei,
        Buffer.from(`*HQ,${data.imei},S20#`, 'utf8'),
      );
      this.logger.log(
        `Re-enforced engine cut on reconnect for ${data.imei}: ${sent ? 'sent' : 'failed'}`,
      );
    }
  }

  @OnEvent(GPS_DEVICE_DISCONNECTED)
  async handleDeviceDisconnected(data: { imei: string }): Promise<void> {
    await this.deviceModel.updateOne({ imei: data.imei }, { isOnline: false });
  }

  @OnEvent(GPS_DEVICE_HEARTBEAT)
  async handleDeviceHeartbeat(data: { imei: string; at: Date }): Promise<void> {
    await this.deviceModel.updateOne(
      { imei: data.imei },
      { isOnline: true, lastSeenAt: data.at },
    );
  }

  // Mark devices offline if no heartbeat received within the online threshold.
  // Runs every minute so the DB stays in sync with the lastSeenAt-based check.
  @Cron(CronExpression.EVERY_MINUTE)
  async markStaleDevicesOffline(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS);
      const result = await this.deviceModel.updateMany(
        { isOnline: true, lastSeenAt: { $lt: cutoff } },
        { isOnline: false },
      );
      if (result.modifiedCount > 0) {
        this.logger.log(
          `Marked ${result.modifiedCount} stale device(s) as offline`,
        );
      }
    } catch (error) {
      this.logger.error(`Error marking stale devices offline: ${error}`);
    }
  }

  private isRecentlyActive(lastSeenAt?: Date | null): boolean {
    if (!lastSeenAt) return false;
    return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
  }

  private isCurrentlyOnline(device: {
    isOnline?: boolean;
    lastSeenAt?: Date | null;
  }): boolean {
    return Boolean(device.isOnline && this.isRecentlyActive(device.lastSeenAt));
  }
}
