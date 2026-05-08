import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DeviceCommand,
  DeviceCommandSchema,
} from '../../database/schemas/device-command.schema';
import { DevicesModule } from '../devices/devices.module';
import { GpsIngestModule } from '../gps-ingest/gps-ingest.module';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeviceCommand.name, schema: DeviceCommandSchema },
    ]),
    forwardRef(() => DevicesModule),
    forwardRef(() => GpsIngestModule),
  ],
  controllers: [CommandsController],
  providers: [CommandsService],
  exports: [CommandsService],
})
export class CommandsModule {}
