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
import { CurrentUser, Roles, RequireSubscription } from '../../common/decorators';
import { Role } from '../../common/enums/roles.enum';
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create geofence (Admin only)' })
  @ApiResponse({ status: 201, description: 'Geofence created' })
  async create(@Body() dto: CreateGeofenceDto) {
    return this.geofencesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get geofences (Admin: all, User: assigned)' })
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
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete geofence (Admin only)' })
  @ApiResponse({ status: 200, description: 'Geofence deleted' })
  async remove(@Param('id') id: string) {
    return this.geofencesService.remove(id);
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
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'imei' })
  @ApiOperation({ summary: 'Unassign device from geofence (Admin only)' })
  @ApiResponse({ status: 200, description: 'Device unassigned' })
  async unassignDevice(@Param('id') id: string, @Param('imei') imei: string) {
    return this.geofencesService.unassignDevice(id, imei);
  }
}
