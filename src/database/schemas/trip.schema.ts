import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TripDocument = Trip & Document;

@Schema({ timestamps: true })
export class Trip {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Device', required: true })
  deviceId: Types.ObjectId;

  @Prop({ required: true, index: true })
  imei: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ required: true })
  startLat: number;

  @Prop({ required: true })
  startLng: number;

  @Prop({ required: true })
  endLat: number;

  @Prop({ required: true })
  endLng: number;

  @Prop({ default: 0 })
  distance: number; // in kilometers

  @Prop({ default: 0 })
  maxSpeed: number; // km/h

  @Prop({ default: 0 })
  avgSpeed: number; // km/h

  @Prop({ default: 0 })
  duration: number; // in seconds

  @Prop({ default: 0 })
  pointCount: number;

  @Prop()
  startAddress?: string;

  @Prop()
  endAddress?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const TripSchema = SchemaFactory.createForClass(Trip);

TripSchema.index({ imei: 1, startTime: -1 });
TripSchema.index({ deviceId: 1, startTime: -1 });
TripSchema.index({ startTime: 1 });
