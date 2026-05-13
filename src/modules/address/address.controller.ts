import {
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AddressService } from './address.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Address')
@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post('seed')
  @Roles(Role.ADMIN)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'divisions', maxCount: 1 },
      { name: 'districts', maxCount: 1 },
      { name: 'upazilas', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Seed address data (Admin only)',
    description:
      'Upload divisions.json, districts.json and upazilas.json files to populate the address collections. Can only be run once — throws 409 if data already exists.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['divisions', 'districts', 'upazilas'],
      properties: {
        divisions: {
          type: 'string',
          format: 'binary',
          description: 'divisions.json file',
        },
        districts: {
          type: 'string',
          format: 'binary',
          description: 'districts.json file',
        },
        upazilas: {
          type: 'string',
          format: 'binary',
          description: 'upazilas.json file',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Address data seeded successfully',
    schema: {
      example: { divisions: 8, districts: 64, upazilas: 495 },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid JSON files' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Address data already exists' })
  async seed(
    @UploadedFiles()
    files: {
      divisions?: Express.Multer.File[];
      districts?: Express.Multer.File[];
      upazilas?: Express.Multer.File[];
    },
  ) {
    if (!files?.divisions?.[0] || !files?.districts?.[0] || !files?.upazilas?.[0]) {
      throw new BadRequestException(
        'All three files are required: divisions, districts, upazilas',
      );
    }

    const parse = (file: Express.Multer.File, name: string) => {
      try {
        return JSON.parse(file.buffer.toString('utf-8'));
      } catch {
        throw new BadRequestException(`${name} is not valid JSON`);
      }
    };

    const divisions = parse(files.divisions[0], 'divisions');
    const districts = parse(files.districts[0], 'districts');
    const upazilas = parse(files.upazilas[0], 'upazilas');

    return this.addressService.seedAddress(divisions, districts, upazilas);
  }

  @Get('divisions')
  @Public()
  @ApiOperation({ summary: 'Get all divisions' })
  @ApiResponse({
    status: 200,
    description: 'List of all divisions sorted by name',
    schema: {
      example: [
        { _id: 1, name: 'Barisal' },
        { _id: 3, name: 'Dhaka' },
      ],
    },
  })
  getDivisions() {
    return this.addressService.getDivisions();
  }

  @Get('divisions/:divisionId/districts')
  @Public()
  @ApiOperation({ summary: 'Get districts by division ID' })
  @ApiParam({ name: 'divisionId', type: Number, example: 3 })
  @ApiResponse({
    status: 200,
    description: 'List of districts belonging to the division',
    schema: {
      example: [
        { _id: 14, division_id: 3, name: 'Dhaka' },
        { _id: 19, division_id: 3, name: 'Gazipur' },
      ],
    },
  })
  getDistricts(@Param('divisionId', ParseIntPipe) divisionId: number) {
    return this.addressService.getDistrictsByDivision(divisionId);
  }

  @Get('districts/:districtId/upazilas')
  @Public()
  @ApiOperation({ summary: 'Get upazilas by district ID' })
  @ApiParam({ name: 'districtId', type: Number, example: 14 })
  @ApiResponse({
    status: 200,
    description: 'List of upazilas belonging to the district',
    schema: {
      example: [
        { _id: 144, district_id: 14, name: 'Dhamrai' },
        { _id: 148, district_id: 14, name: 'Savar' },
      ],
    },
  })
  getUpazilas(@Param('districtId', ParseIntPipe) districtId: number) {
    return this.addressService.getUpazilasByDistrict(districtId);
  }

  @Get('tree')
  @Public()
  @ApiOperation({
    summary: 'Get full address tree',
    description: 'Returns all divisions with their nested districts and upazilas in one call.',
  })
  @ApiResponse({
    status: 200,
    description: 'Full nested Division → District → Upazila tree',
    schema: {
      example: [
        {
          _id: 1,
          name: 'Barisal',
          districts: [
            {
              _id: 4,
              name: 'Barisal',
              upazilas: [{ _id: 10, name: 'Barisal Sadar' }],
            },
          ],
        },
      ],
    },
  })
  getFullTree() {
    return this.addressService.getFullTree();
  }
}
