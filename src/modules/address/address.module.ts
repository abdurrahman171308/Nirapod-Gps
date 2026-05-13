import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { Division, DivisionSchema } from '../../database/schemas/division.schema';
import { District, DistrictSchema } from '../../database/schemas/district.schema';
import { Upazila, UpazilaSchema } from '../../database/schemas/upazila.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Division.name, schema: DivisionSchema },
      { name: District.name, schema: DistrictSchema },
      { name: Upazila.name, schema: UpazilaSchema },
    ]),
  ],
  controllers: [AddressController],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressModule {}
