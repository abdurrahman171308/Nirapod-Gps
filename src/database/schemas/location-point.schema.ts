import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LocationPointDocument = LocationPoint & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class LocationPoint {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Device', required: true })
  deviceId: Types.ObjectId;

  @Prop({ required: true, index: true })
  imei: string;

  @Prop({ required: true })
  lat: number;

  @Prop({ required: true })
  lng: number;

  @Prop({ default: 0 })
  speed: number;

  @Prop({ default: 0 })
  course: number;

  @Prop({ required: true })
  deviceTime: Date;

  @Prop({ required: true })
  serverTime: Date;

  @Prop()
  ignition?: boolean;

  @Prop()
  satellites?: number;

  @Prop()
  battery?: number;

  @Prop()
  gsmSignal?: number;

  @Prop()
  raw?: string;

  createdAt: Date;
}

export const LocationPointSchema = SchemaFactory.createForClass(LocationPoint);

LocationPointSchema.index({ deviceId: 1, deviceTime: -1 });
LocationPointSchema.index({ imei: 1, deviceTime: -1 });
LocationPointSchema.index({ deviceTime: 1 });

LocationPointSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { createdAt: { $exists: true } },
  },
);
