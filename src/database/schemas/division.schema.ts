import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DivisionDocument = Division & Document;

@Schema({ timestamps: true })
export class Division {
  @Prop({ required: true, type: Number })
  _id: number;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: null })
  name_bn: string;
}

export const DivisionSchema = SchemaFactory.createForClass(Division);
