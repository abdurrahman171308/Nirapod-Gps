import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { Device, DeviceSchema } from '../../database/schemas/device.schema';
import {
  LocationPoint,
  LocationPointSchema,
} from '../../database/schemas/location-point.schema';
import { GpsIngestModule } from '../gps-ingest/gps-ingest.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: LocationPoint.name, schema: LocationPointSchema },
    ]),
    GpsIngestModule,
    UsersModule,
  ],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
