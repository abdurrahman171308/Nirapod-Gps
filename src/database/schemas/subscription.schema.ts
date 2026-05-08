import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BillingCycle, PlanName } from './plan.schema';

export type SubscriptionDocument = Subscription & Document;

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Plan', required: true })
  planId: Types.ObjectId;

  @Prop({ required: true, enum: PlanName })
  planName: PlanName;

  @Prop({ required: true, enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Prop({ required: true, enum: BillingCycle })
  billingCycle: BillingCycle;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, min: 0 })
  amountPaid: number;

  @Prop({ required: true, min: 0 })
  deviceCount: number;

  @Prop({ required: true, min: 0 })
  pricePerDevice: number;

  @Prop({ required: true, min: 0 })
  baseAmount: number;

  @Prop()
  couponCode?: string;

  @Prop({ default: 0, min: 0 })
  discountAmount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: SubscriptionStatus.ACTIVE },
  },
);
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ endDate: 1 });
