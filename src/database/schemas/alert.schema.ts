import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AlertType } from '../../common/enums/alert-type.enum';

export type AlertDocument = Alert & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Alert {
  declare _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Device' })
  declare deviceId?: Types.ObjectId;

  @Prop({ index: true })
  declare imei?: string;

  @Prop({ type: String, enum: AlertType, required: true })
  declare type: AlertType;

  @Prop({ required: true })
  declare message: string;

  @Prop()
  declare lat?: number;

  @Prop()
  declare lng?: number;

  @Prop()
  declare speed?: number;

  @Prop({ type: Object })
  declare meta?: Record<string, any>;

  @Prop({ default: false })
  declare isAcknowledged: boolean;

  @Prop()
  declare acknowledgedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  declare acknowledgedBy?: Types.ObjectId;

  @Prop({ default: false })
  declare isRead: boolean;

  @Prop()
  declare readAt?: Date;

  declare createdAt: Date;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);

AlertSchema.index({ deviceId: 1, createdAt: -1 });
AlertSchema.index({ imei: 1, createdAt: -1 });
AlertSchema.index({ type: 1 });
AlertSchema.index({ isAcknowledged: 1 });
AlertSchema.index({ isRead: 1 });
AlertSchema.index({ createdAt: -1 });
