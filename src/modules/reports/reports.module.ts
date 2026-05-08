import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Alert, AlertSchema } from '../../database/schemas/alert.schema';
import {
  LocationPoint,
  LocationPointSchema,
} from '../../database/schemas/location-point.schema';
import { DevicesModule } from '../devices/devices.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationPoint.name, schema: LocationPointSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
    forwardRef(() => DevicesModule),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
