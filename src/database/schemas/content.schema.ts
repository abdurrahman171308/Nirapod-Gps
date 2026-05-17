import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContentDocument = Content & Document;

export enum ContentType {
  OFFER = 'OFFER',
  FEATURE_NEWS = 'FEATURE_NEWS',
  BANNER = 'BANNER',
}

@Schema({ timestamps: true })
export class Content {
  @Prop({ required: true, enum: ContentType })
  type: ContentType;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  imageUrl?: string;

  /** Optional: valid for OFFER type */
  @Prop()
  startsAt?: Date;

  /** Optional: valid for OFFER type */
  @Prop()
  expiresAt?: Date;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const ContentSchema = SchemaFactory.createForClass(Content);

ContentSchema.index({ type: 1, isActive: 1 });
ContentSchema.index({ createdAt: -1 });
