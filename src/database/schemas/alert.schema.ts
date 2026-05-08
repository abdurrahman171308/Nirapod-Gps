import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AlertType } from '../../common/enums/alert-type.enum';

export type AlertDocument = Alert & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Alert {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Device', required: true })
  deviceId: Types.ObjectId;

  @Prop({ required: true, index: true })
  imei: string;

  @Prop({ type: String, enum: AlertType, required: true })
  type: AlertType;

  @Prop({ required: true })
  message: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop()
  speed?: number;

  @Prop({ type: Object })
  meta?: Record<string, any>;

  @Prop({ default: false })
  isAcknowledged: boolean;

  @Prop()
  acknowledgedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acknowledgedBy?: Types.ObjectId;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  createdAt: Date;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);

AlertSchema.index({ deviceId: 1, createdAt: -1 });
AlertSchema.index({ imei: 1, createdAt: -1 });
AlertSchema.index({ type: 1 });
AlertSchema.index({ isAcknowledged: 1 });
AlertSchema.index({ isRead: 1 });
AlertSchema.index({ createdAt: -1 });
