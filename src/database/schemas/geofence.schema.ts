import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GeofenceDocument = Geofence & Document;

@Schema({ timestamps: true })
export class Geofence {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  deviceImeis: string[];

  @Prop({ type: String, enum: ['polygon', 'circle'], default: 'polygon' })
  type: 'polygon' | 'circle';

  @Prop({ type: [{ lat: Number, lng: Number }], default: [] })
  points: Array<{ lat: number; lng: number }>;

  @Prop()
  centerLat?: number;

  @Prop()
  centerLng?: number;

  @Prop()
  radiusMeters?: number;

  createdAt: Date;
  updatedAt: Date;
}

export const GeofenceSchema = SchemaFactory.createForClass(Geofence);

GeofenceSchema.index({ name: 1 });
GeofenceSchema.index({ isActive: 1 });
GeofenceSchema.index({ deviceImeis: 1 });
