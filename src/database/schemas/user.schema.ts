import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../common/enums/roles.enum';

export type UserDocument = User & Document;

export class UserAddress {
  divisionId?: number;
  division?: string;
  districtId?: number;
  declare district: string;
  upazilaId?: number;
  declare thana: string;
  union?: string;
  declare addressLine: string;
}

@Schema({ timestamps: true })
export class User {
  declare _id: Types.ObjectId;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  declare email: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  declare username: string;

  @Prop({ required: true })
  declare passwordHash: string;

  @Prop({ type: String, enum: Role, default: Role.USER })
  declare role: Role;

  @Prop({ default: true })
  declare isActive: boolean;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop({ required: true })
  declare phone: string;

  @Prop({
    type: {
      divisionId: { type: Number },
      division: { type: String },
      districtId: { type: Number },
      district: { type: String, required: true },
      upazilaId: { type: Number },
      thana: { type: String, required: true },
      union: { type: String },
      addressLine: { type: String, required: true },
    },
  })
  address?: UserAddress;

  @Prop({ type: Types.ObjectId, ref: 'Subscription' })
  subscriptionId?: Types.ObjectId;

  @Prop()
  fcmToken?: string;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ username: 1 });
