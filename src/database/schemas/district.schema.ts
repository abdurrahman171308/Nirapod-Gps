import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DistrictDocument = District & Document;

@Schema({ timestamps: true })
export class District {
  @Prop({ required: true, type: Number })
  _id: number;

  @Prop({ required: true, type: Number, index: true })
  division_id: number;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: null })
  name_bn: string;
}

export const DistrictSchema = SchemaFactory.createForClass(District);
