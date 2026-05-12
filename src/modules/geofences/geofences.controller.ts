import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, RequireSubscription } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { UserContext } from '../devices/devices.service';
import {
  AssignGeofenceDeviceDto,
  CreateGeofenceDto,
  UpdateGeofenceDto,
} from './dto';
import { GeofencesService } from './geofences.service';

@ApiTags('Geofences')
@ApiCookieAuth()
@RequireSubscription()
@Controller('geofences')
@UseGuards(RolesGuard)
export class GeofencesController {
  constructor(private readonly geofencesService: GeofencesService) {}

  @Post()
  @ApiOperation({ summary: 'Create geofence (Admin or User)' })
  @ApiResponse({ status: 201, description: 'Geofence created' })
  async create(@Body() dto: CreateGeofenceDto, @CurrentUser() user: UserContext) {
    return this.geofencesService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Get geofences (all authenticated users)' })
  @ApiResponse({ status: 200, description: 'Geofence list' })
  async findAll(@CurrentUser() user: UserContext) {
    return this.geofencesService.findAll(user);
  }

  @Patch(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update geofence (Admin or device owner)' })
  @ApiResponse({ status: 200, description: 'Geofence updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGeofenceDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.geofencesService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete geofence (Admin or User)' })
  @ApiResponse({ status: 200, description: 'Geofence deleted' })
  async remove(@Param('id') id: string, @CurrentUser() user: UserContext) {
    return this.geofencesService.remove(id, user);
  }

  @Post(':id/assign-device')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Assign device to geofence (Admin or device owner)' })
  @ApiResponse({ status: 200, description: 'Device assigned' })
  async assignDevice(
    @Param('id') id: string,
    @Body() dto: AssignGeofenceDeviceDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.geofencesService.assignDevice(id, dto.imei, user);
  }

  @Delete(':id/assign-device/:imei')
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'imei' })
  @ApiOperation({ summary: 'Unassign device from geofence (Admin or device owner)' })
  @ApiResponse({ status: 200, description: 'Device unassigned' })
  async unassignDevice(
    @Param('id') id: string,
    @Param('imei') imei: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.geofencesService.unassignDevice(id, imei, user);
  }
}
