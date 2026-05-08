import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards';
import { CurrentUser, RequireSubscription } from '../../common/decorators';
import { UserContext } from '../devices/devices.service';
import { TrackingService } from './tracking.service';
import { StopsQueryDto, TrackingQueryDto } from './dto';

@ApiTags('Tracking')
@ApiCookieAuth()
@RequireSubscription()
@Controller('tracking')
@UseGuards(RolesGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('live')
  @ApiOperation({ summary: 'Get current live state for one device' })
  @ApiResponse({ status: 200, description: 'Live tracking state' })
  async getLive(
    @Query() query: TrackingQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.trackingService.getLive(query.imei, user);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get historical location points by device and date range',
  })
  @ApiResponse({ status: 200, description: 'Location history data' })
  async getHistory(
    @Query() query: TrackingQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.trackingService.getHistory(query, user);
  }

  @Get('trips')
  @ApiOperation({ summary: 'Get trips by device and date range' })
  @ApiResponse({ status: 200, description: 'Trip list' })
  async getTrips(
    @Query() query: TrackingQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.trackingService.getTrips(query, user);
  }

  @Get('stops')
  @ApiOperation({
    summary: 'Get detected stop intervals by device and date range',
  })
  @ApiResponse({ status: 200, description: 'Detected stops' })
  async getStops(
    @Query() query: StopsQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.trackingService.getStops(query, user);
  }
}
