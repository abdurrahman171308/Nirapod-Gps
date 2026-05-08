import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PlanName } from './plan.schema';

export type CouponDocument = Coupon & Document;

export enum DiscountType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

@Schema({ timestamps: true })
export class Coupon {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true, enum: DiscountType })
  discountType: DiscountType;

  @Prop({ required: true, min: 0 })
  discountValue: number;

  @Prop({ type: [String], enum: PlanName, default: [] })
  applicablePlans: PlanName[];

  @Prop({ required: true, min: 1 })
  maxUsage: number;

  @Prop({ default: 0, min: 0 })
  usedCount: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);

CouponSchema.index({ isActive: 1 });
CouponSchema.index({ expiresAt: 1 });
