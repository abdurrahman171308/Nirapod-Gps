import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { DevicesService, UserContext } from './devices.service';
import { CreateDeviceDto, UpdateDeviceDto } from './dto';
import { Roles, CurrentUser, RequireSubscription } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Devices')
@ApiCookieAuth()
@RequireSubscription()
@Controller('devices')
@UseGuards(RolesGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new device (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Device created successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Device with this IMEI already exists',
  })
  async create(@Body() createDeviceDto: CreateDeviceDto) {
    return this.devicesService.create(createDeviceDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all devices (Admin: all, User: assigned only)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of devices',
  })
  async findAll(@CurrentUser() user: UserContext) {
    return this.devicesService.findAll(user);
  }

  @Get(':imei')
  @ApiOperation({ summary: 'Get device by IMEI' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiResponse({ status: 200, description: 'Device details' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async findOne(@Param('imei') imei: string, @CurrentUser() user: UserContext) {
    return this.devicesService.findByImei(imei, user);
  }

  @Get(':imei/latest')
  @ApiOperation({ summary: 'Get latest location for device' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiResponse({ status: 200, description: 'Latest location point' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getLatestLocation(
    @Param('imei') imei: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.devicesService.getLatestLocation(imei, user);
  }

  @Put(':imei')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update device (Admin only)' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiResponse({ status: 200, description: 'Device updated successfully' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async update(
    @Param('imei') imei: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
  ) {
    return this.devicesService.update(imei, updateDeviceDto);
  }

  @Delete(':imei')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete device (Admin only)' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiResponse({ status: 204, description: 'Device deleted successfully' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async delete(@Param('imei') imei: string) {
    await this.devicesService.delete(imei);
  }

  @Post(':imei/assign')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign device to a user (Admin only)' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          nullable: true,
          description: 'User ID to assign, or null to unassign',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Device assigned successfully' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async assignToUser(
    @Param('imei') imei: string,
    @Body() body: { userId: string | null },
  ) {
    return this.devicesService.assignToUser(imei, body.userId);
  }
}
