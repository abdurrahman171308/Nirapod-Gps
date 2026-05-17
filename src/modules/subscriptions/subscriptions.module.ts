import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { Plan, PlanSchema } from '../../database/schemas/plan.schema';
import { Subscription, SubscriptionSchema } from '../../database/schemas/subscription.schema';
import { Coupon, CouponSchema } from '../../database/schemas/coupon.schema';
import { PaymentRecord, PaymentRecordSchema } from '../../database/schemas/payment-record.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Device, DeviceSchema } from '../../database/schemas/device.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: PaymentRecord.name, schema: PaymentRecordSchema },
      { name: User.name, schema: UserSchema },
      { name: Device.name, schema: DeviceSchema },
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionGuard],
  exports: [SubscriptionsService, SubscriptionGuard, MongooseModule],
})
export class SubscriptionsModule {}
