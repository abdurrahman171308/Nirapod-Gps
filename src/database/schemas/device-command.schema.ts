import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeviceCommandDocument = DeviceCommand & Document;

export enum DeviceCommandStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class DeviceCommand {
  @Prop({ type: Types.ObjectId, ref: 'Device', required: true })
  deviceId: Types.ObjectId;

  @Prop({ required: true, index: true })
  imei: string;

  @Prop({ required: true })
  command: string;

  @Prop()
  payload?: string;

  @Prop({
    type: String,
    enum: DeviceCommandStatus,
    default: DeviceCommandStatus.QUEUED,
  })
  status: DeviceCommandStatus;

  @Prop()
  sentAt?: Date;

  @Prop()
  failureReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const DeviceCommandSchema = SchemaFactory.createForClass(DeviceCommand);

DeviceCommandSchema.index({ imei: 1, createdAt: -1 });
DeviceCommandSchema.index({ status: 1, createdAt: -1 });
