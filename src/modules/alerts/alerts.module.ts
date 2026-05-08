import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { Alert, AlertSchema } from '../../database/schemas/alert.schema';
import { Device, DeviceSchema } from '../../database/schemas/device.schema';
import { DevicesModule } from '../devices/devices.module';
import { FcmModule } from '../fcm/fcm.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Alert.name, schema: AlertSchema },
      { name: Device.name, schema: DeviceSchema },
    ]),
    forwardRef(() => DevicesModule),
    FcmModule,
    UsersModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
