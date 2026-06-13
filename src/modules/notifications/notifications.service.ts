import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationStatus,
  NotificationTarget,
  NotificationType,
} from '../../database/schemas/notification.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Alert, AlertDocument } from '../../database/schemas/alert.schema';
import { FcmService } from '../fcm/fcm.service';
import { SendNotificationDto } from './dto';
import { AlertType } from '../../common/enums/alert-type.enum';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    private readonly fcmService: FcmService,
  ) {}

  async send(dto: SendNotificationDto, adminId: string): Promise<NotificationDocument> {
    const target = dto.target ?? NotificationTarget.ALL;

    const users = await this.resolveTargetUsers(target, dto.targetUserIds);
    const tokened = users.filter((u) => u.fcmToken);

    let sentCount = 0;
    let failedCount = 0;

    await Promise.allSettled(
      tokened.map(async (user) => {
        try {
          await this.fcmService.sendToToken(user.fcmToken!, dto.title, dto.body, {
            type: dto.type,
            notificationId: 'pending',
          });
          sentCount++;
        } catch {
          failedCount++;
        }
      }),
    );

    failedCount += users.length - tokened.length;

    const status =
      sentCount === 0
        ? NotificationStatus.FAILED
        : failedCount > 0
          ? NotificationStatus.PARTIAL
          : NotificationStatus.SENT;

    const record = await this.notificationModel.create({
      title: dto.title,
      body: dto.body,
      type: dto.type,
      target,
      targetUserIds:
        target === NotificationTarget.SPECIFIC
          ? (dto.targetUserIds ?? []).map((id) => new Types.ObjectId(id))
          : [],
      status,
      sentCount,
      failedCount,
      createdBy: new Types.ObjectId(adminId),
    });

    this.logger.log(
      `Notification "${dto.title}" sent — ${sentCount} delivered, ${failedCount} failed`,
    );

    // Save a copy in the alerts table so it appears in the notification inbox
    try {
      const alertDoc = await this.alertModel.create({
        type: AlertType.SYSTEM_NOTIFICATION,
        message: `${dto.title}: ${dto.body}`,
        meta: { notificationId: record._id.toString(), type: dto.type, target },
      });
      this.logger.log(`System notification alert saved: ${alertDoc._id}`);
    } catch (err) {
      this.logger.error(`Failed to save system notification alert: ${err}`);
    }

    return record;
  }

  async findAll(limit = 50, skip = 0) {
    const [items, total] = await Promise.all([
      this.notificationModel
        .find()
        .populate('createdBy', 'email firstName lastName')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('-__v')
        .lean(),
      this.notificationModel.countDocuments(),
    ]);
    return { items, total };
  }

  /** Called by the payment-reminder cron in SubscriptionsService */
  async sendPaymentReminderToUser(
    userId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).select('fcmToken').lean();
    if (!user?.fcmToken) return;

    try {
      await this.fcmService.sendToToken(user.fcmToken, title, body, {
        type: NotificationType.PAYMENT_REMINDER,
      });
    } catch (err) {
      this.logger.warn(`Payment reminder FCM failed for user ${userId}: ${err}`);
    }

    // Save in alerts table regardless of FCM success so it appears in the inbox
    await this.alertModel.create({
      type: AlertType.SYSTEM_NOTIFICATION,
      message: `${title}: ${body}`,
      meta: { type: NotificationType.PAYMENT_REMINDER, userId },
    });
  }

  private async resolveTargetUsers(
    target: NotificationTarget,
    targetUserIds?: string[],
  ): Promise<UserDocument[]> {
    if (target === NotificationTarget.SPECIFIC && targetUserIds?.length) {
      return this.userModel
        .find({ _id: { $in: targetUserIds.map((id) => new Types.ObjectId(id)) }, isActive: true })
        .select('fcmToken')
        .lean() as unknown as UserDocument[];
    }

    return this.userModel
      .find({ isActive: true, fcmToken: { $exists: true, $ne: null } })
      .select('fcmToken')
      .lean() as unknown as UserDocument[];
  }
}
