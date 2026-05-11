import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PlanName, BillingCycle } from './plan.schema';

export type PaymentRecordDocument = PaymentRecord & Document;

export enum PaymentStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

@Schema({ timestamps: true })
export class PaymentRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Subscription', required: true })
  subscriptionId: Types.ObjectId;

  @Prop({ required: true, enum: PlanName })
  planName: PlanName;

  @Prop({ required: true, enum: BillingCycle })
  billingCycle: BillingCycle;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, min: 0 })
  deviceCount: number;

  @Prop({ type: [Types.ObjectId], ref: 'Device', default: [] })
  subscribedDeviceIds: Types.ObjectId[];

  @Prop({ required: true, min: 0 })
  pricePerDevice: number;

  @Prop({ required: true, min: 0 })
  baseAmount: number;

  @Prop({ default: 0, min: 0 })
  discountAmount: number;

  @Prop()
  couponCode?: string;

  @Prop({ required: true, enum: PaymentStatus, default: PaymentStatus.SUCCESS })
  status: PaymentStatus;

  @Prop()
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const PaymentRecordSchema = SchemaFactory.createForClass(PaymentRecord);

PaymentRecordSchema.index({ userId: 1 });
PaymentRecordSchema.index({ subscriptionId: 1 });
PaymentRecordSchema.index({ createdAt: -1 });
