import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlanDocument = Plan & Document;

export enum PlanName {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true, enum: PlanName, unique: true })
  name!: PlanName;

  @Prop({ required: true })
  displayName!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, min: 0 })
  priceMonthly!: number;

  @Prop({ required: true, min: 0 })
  priceYearly!: number;

  @Prop({ required: true, min: 0, default: 300 })
  pricePerDevice!: number;

  @Prop({ required: true, min: 1 })
  dataRetentionDays!: number;

  @Prop({ type: [String], default: [] })
  features!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
