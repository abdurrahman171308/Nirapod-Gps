import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Device, DeviceSchema } from '../../database/schemas/device.schema';
import { Alert, AlertSchema } from '../../database/schemas/alert.schema';
import {
  LocationPoint,
  LocationPointSchema,
} from '../../database/schemas/location-point.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../../database/schemas/subscription.schema';
import { GpsIngestModule } from '../gps-ingest/gps-ingest.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: LocationPoint.name, schema: LocationPointSchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    GpsIngestModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
