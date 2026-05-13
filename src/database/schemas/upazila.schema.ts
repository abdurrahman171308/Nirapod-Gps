import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UpazilaDocument = Upazila & Document;

@Schema({ timestamps: true })
export class Upazila {
  @Prop({ required: true, type: Number })
  _id: number;

  @Prop({ required: true, type: Number, index: true })
  district_id: number;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: null })
  name_bn: string;
}

export const UpazilaSchema = SchemaFactory.createForClass(Upazila);
