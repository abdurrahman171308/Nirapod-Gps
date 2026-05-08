import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LocationPoint,
  LocationPointSchema,
} from '../../database/schemas/location-point.schema';
import { DevicesModule } from '../devices/devices.module';
import { LocationsModule } from '../locations/locations.module';
import { TripsModule } from '../trips/trips.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationPoint.name, schema: LocationPointSchema },
    ]),
    forwardRef(() => DevicesModule),
    forwardRef(() => LocationsModule),
    forwardRef(() => TripsModule),
  ],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
