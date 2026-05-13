import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post('seed')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async seed(
    @Body()
    body: {
      divisions: any[];
      districts: any[];
      upazilas: any[];
    },
  ) {
    return this.addressService.seedAddress(
      body.divisions,
      body.districts,
      body.upazilas,
    );
  }

  @Get('divisions')
  @Public()
  getDivisions() {
    return this.addressService.getDivisions();
  }

  @Get('divisions/:divisionId/districts')
  @Public()
  getDistricts(@Param('divisionId', ParseIntPipe) divisionId: number) {
    return this.addressService.getDistrictsByDivision(divisionId);
  }

  @Get('districts/:districtId/upazilas')
  @Public()
  getUpazilas(@Param('districtId', ParseIntPipe) districtId: number) {
    return this.addressService.getUpazilasByDistrict(districtId);
  }

  @Get('tree')
  @Public()
  getFullTree() {
    return this.addressService.getFullTree();
  }
}
