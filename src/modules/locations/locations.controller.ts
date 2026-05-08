import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { LocationHistoryQueryDto } from './dto';
import { CurrentUser, RequireSubscription } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { UserContext } from '../devices/devices.service';

@ApiTags('Locations')
@ApiCookieAuth()
@RequireSubscription()
@Controller('devices/:imei')
@UseGuards(RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('history')
  @ApiOperation({ summary: 'Get location history for a device' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Location history for playback',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            locations: { type: 'array' },
            total: { type: 'number' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getHistory(
    @Param('imei') imei: string,
    @Query() query: LocationHistoryQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.locationsService.getHistory(imei, query, user);
  }

  @Get('polyline')
  @ApiOperation({ summary: 'Get simplified polyline data for map rendering' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiResponse({ status: 200, description: 'Polyline points' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getPolyline(
    @Param('imei') imei: string,
    @Query() query: LocationHistoryQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.locationsService.getHistoryAsPolyline(imei, query, user);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get trip statistics for a date range' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Statistics including distance, max speed, avg speed',
  })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getStatistics(
    @Param('imei') imei: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.locationsService.getStatistics(
      imei,
      new Date(from),
      new Date(to),
      user,
    );
  }
}
