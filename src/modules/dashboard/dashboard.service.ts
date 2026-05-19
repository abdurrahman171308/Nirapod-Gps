import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Device, DeviceDocument } from '../../database/schemas/device.schema';
import { Alert, AlertDocument } from '../../database/schemas/alert.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from '../../database/schemas/subscription.schema';
import { Role } from '../../common/enums/roles.enum';
import {
  IGNITION_STATE_FRESH_MS,
  ONLINE_THRESHOLD_MS,
} from '../devices/devices.service';

export interface UserContext {
  userId: string;
  role: Role;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
  ) {}

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

  private hasFreshIgnitionReport(lastIgnitionAt?: Date | null): boolean {
    if (!lastIgnitionAt) return false;
    return (
      Date.now() - new Date(lastIgnitionAt).getTime() <
      IGNITION_STATE_FRESH_MS
    );
  }

  private getCurrentIgnition(device: {
    isOnline?: boolean;
    lastSeenAt?: Date | null;
    lastIgnition?: boolean;
    lastIgnitionAt?: Date | null;
  }): boolean | undefined {
    if (!this.isCurrentlyOnline(device)) return undefined;
    if (!this.hasFreshIgnitionReport(device.lastIgnitionAt)) return undefined;
    return typeof device.lastIgnition === 'boolean'
      ? device.lastIgnition
      : undefined;
  }

  private buildCoveredDeviceIdSet(
    subscriptions: Array<{ subscribedDeviceIds?: Types.ObjectId[] | string[] | null }>,
  ): Set<string> {
    return new Set(
      subscriptions.flatMap((subscription) =>
        (subscription.subscribedDeviceIds ?? []).map((deviceId) =>
          deviceId.toString(),
        ),
      ),
    );
  }

  private summarizeSubscriptionCoverage(
    devices: Array<{ _id: Types.ObjectId }>,
    coveredDeviceIds: Set<string>,
  ) {
    const active = devices.filter((device) =>
      coveredDeviceIds.has(device._id.toString()),
    ).length;

    return {
      active,
      expired: Math.max(0, devices.length - active),
    };
  }

  async getSummary(user: UserContext) {
    if (user.role === Role.ADMIN) {
      return this.getAdminSummary();
    }
    return this.getUserSummary(user.userId);
  }

  private async getAdminSummary() {
    const [totalDevices, activeAlerts, totalUsers, devices, usersWithActiveSubCount] =
      await Promise.all([
      this.deviceModel.countDocuments({}).exec(),
      this.alertModel.countDocuments({ isAcknowledged: false }).exec(),
      this.userModel.countDocuments({ isActive: true, role: Role.USER }).exec(),
      this.deviceModel
        .find({})
        .select(
          'imei name isOnline lastLat lastLng lastSpeed lastSeenAt lastIgnition lastIgnitionAt',
        )
        .lean()
        .exec(),
      this.subscriptionModel
        .distinct('userId', {
          status: SubscriptionStatus.ACTIVE,
          endDate: { $gt: new Date() },
        })
        .exec()
        .then((ids) => ids.length),
      ]);

    const onlineDevices = devices.filter((d) =>
      this.isCurrentlyOnline(d),
    ).length;
    const currentIgnitions = devices.map((d) => this.getCurrentIgnition(d));
    const engineOnCount = currentIgnitions.filter(
      (state) => state === true,
    ).length;
    const engineOffCount = Math.max(0, totalDevices - engineOnCount);

    const recentLocations = devices
      .filter((d) => d.lastLat != null)
      .map((d) => ({
        imei: d.imei,
        name: d.name,
        lat: d.lastLat,
        lng: d.lastLng,
        speed: d.lastSpeed,
        lastSeenAt: d.lastSeenAt,
        isOnline: this.isCurrentlyOnline(d),
        engineOn: this.getCurrentIgnition(d),
        lastIgnitionAt: d.lastIgnitionAt,
      }));

    return {
      devices: {
        total: totalDevices,
        online: onlineDevices,
        offline: totalDevices - onlineDevices,
        engineOn: engineOnCount,
        engineOff: engineOffCount,
      },
      alerts: {
        unacknowledged: activeAlerts,
      },
      users: {
        total: totalUsers,
      },
      userSubscriptions: {
        withActiveSubscription: usersWithActiveSubCount,
        withoutActiveSubscription: Math.max(0, totalUsers - usersWithActiveSubCount),
      },
      recentLocations,
    };
  }

  private async getUserSummary(userId: string) {
    const userObjectId = new Types.ObjectId(userId);

    const [assignedDevices, activeSubscription] = await Promise.all([
      this.deviceModel
        .find({ assignedUserId: userObjectId })
        .select(
          'imei name isOnline lastLat lastLng lastSpeed lastSeenAt lastIgnition lastIgnitionAt',
        )
        .lean()
        .exec(),
      this.subscriptionModel
        .find({
          userId: userObjectId,
          status: SubscriptionStatus.ACTIVE,
          endDate: { $gt: new Date() },
        })
        .select('subscribedDeviceIds')
        .lean()
        .exec(),
    ]);

    const imeis = assignedDevices.map((d) => d.imei);

    const onlineDevices = assignedDevices.filter((d) =>
      this.isCurrentlyOnline(d),
    ).length;

    const currentIgnitions = assignedDevices.map((d) =>
      this.getCurrentIgnition(d),
    );
    const engineOnCount = currentIgnitions.filter(
      (state) => state === true,
    ).length;
    const engineOffCount = Math.max(0, assignedDevices.length - engineOnCount);

    const [activeAlerts] = await Promise.all([
      imeis.length > 0
        ? this.alertModel
            .countDocuments({ isAcknowledged: false, imei: { $in: imeis } })
            .exec()
        : Promise.resolve(0),
    ]);

    const recentLocations = assignedDevices
      .filter((d) => d.lastLat != null)
      .map((d) => ({
        imei: d.imei,
        name: d.name,
        lat: d.lastLat,
        lng: d.lastLng,
        speed: d.lastSpeed,
        lastSeenAt: d.lastSeenAt,
        isOnline: this.isCurrentlyOnline(d),
        engineOn: this.getCurrentIgnition(d),
        lastIgnitionAt: d.lastIgnitionAt,
      }));

    const coveredDeviceIds = this.buildCoveredDeviceIdSet(activeSubscription);
    const subscriptionCounts = this.summarizeSubscriptionCoverage(
      assignedDevices,
      coveredDeviceIds,
    );

    return {
      devices: {
        total: assignedDevices.length,
        online: onlineDevices,
        offline: assignedDevices.length - onlineDevices,
        engineOn: engineOnCount,
        engineOff: engineOffCount,
      },
      subscriptions: subscriptionCounts,
      alerts: {
        unacknowledged: activeAlerts,
      },
      recentLocations,
    };
  }
}
