import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  URGENT_NEWS = 'URGENT_NEWS',
  PAYMENT_REMINDER = 'PAYMENT_REMINDER',
}

export enum NotificationStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export enum NotificationTarget {
  ALL = 'ALL',
  SPECIFIC = 'SPECIFIC',
}

@Schema({ timestamps: true })
export class Notification {
  declare _id: Types.ObjectId;

  @Prop({ required: true })
  declare title: string;

  @Prop({ required: true })
  declare body: string;

  @Prop({ type: String, enum: NotificationType, required: true })
  declare type: NotificationType;

  @Prop({ type: String, enum: NotificationTarget, default: NotificationTarget.ALL })
  declare target: NotificationTarget;

  /** Populated when target === SPECIFIC */
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  declare targetUserIds: Types.ObjectId[];

  @Prop({ type: String, enum: NotificationStatus, default: NotificationStatus.SENT })
  declare status: NotificationStatus;

  /** How many devices were successfully reached */
  @Prop({ default: 0 })
  declare sentCount: number;

  /** How many devices had no FCM token or failed */
  @Prop({ default: 0 })
  declare failedCount: number;

  /** Admin who triggered the notification */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ type: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: -1 });
