import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { Trip, TripSchema } from '../../database/schemas/trip.schema';
import {
  LocationPoint,
  LocationPointSchema,
} from '../../database/schemas/location-point.schema';
import { Device, DeviceSchema } from '../../database/schemas/device.schema';
import { DevicesModule } from '../devices/devices.module';
import { ReverseGeocodingService } from './reverse-geocoding.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Trip.name, schema: TripSchema },
      { name: LocationPoint.name, schema: LocationPointSchema },
      { name: Device.name, schema: DeviceSchema },
    ]),
    forwardRef(() => DevicesModule),
  ],
  controllers: [TripsController],
  providers: [TripsService, ReverseGeocodingService],
  exports: [TripsService],
})
export class TripsModule {}
