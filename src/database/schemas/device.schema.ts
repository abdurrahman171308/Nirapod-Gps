import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeviceDocument = Device & Document;

@Schema({ timestamps: true })
export class Device {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  imei: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  plateNumber?: string;

  @Prop({ trim: true })
  simNumber?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedUserId?: Types.ObjectId;

  @Prop({ default: 120 })
  speedLimitKph: number;

  @Prop()
  lastSeenAt?: Date;

  @Prop()
  lastLat?: number;

  @Prop()
  lastLng?: number;

  @Prop()
  lastSpeed?: number;

  @Prop()
  lastCourse?: number;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop({ default: false })
  isEngineCut: boolean;

  @Prop()
  lastIgnition?: boolean;

  @Prop()
  lastIgnitionAt?: Date;

  @Prop()
  lastIgnitionChangedAt?: Date;

  @Prop()
  lastEngineOnAt?: Date;

  @Prop()
  lastEngineOffAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);

DeviceSchema.index({ assignedUserId: 1 });
DeviceSchema.index({ isActive: 1 });
DeviceSchema.index({ isOnline: 1 });
DeviceSchema.index({ lastSeenAt: -1 });
DeviceSchema.index({ lastIgnitionAt: -1 });
