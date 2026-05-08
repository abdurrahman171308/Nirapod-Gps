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
import { DeviceReportQueryDto, IdleTimeReportQueryDto } from './dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiCookieAuth()
@RequireSubscription()
@Controller('reports')
@UseGuards(RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('daily-distance')
  @ApiOperation({ summary: 'Get daily distance report for device' })
  @ApiResponse({ status: 200, description: 'Daily distance report' })
  async dailyDistance(
    @Query() query: DeviceReportQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.reportsService.getDailyDistance(query, user);
  }

  @Get('idle-time')
  @ApiOperation({ summary: 'Get idle time report for device' })
  @ApiResponse({ status: 200, description: 'Idle time report' })
  async idleTime(
    @Query() query: IdleTimeReportQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.reportsService.getIdleTime(query, user);
  }

  @Get('overspeed')
  @ApiOperation({ summary: 'Get overspeed alerts report for device' })
  @ApiResponse({ status: 200, description: 'Overspeed report' })
  async overspeed(
    @Query() query: DeviceReportQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.reportsService.getOverspeedReport(query, user);
  }

  @Get('engine-hours')
  @ApiOperation({ summary: 'Get engine hours report for device' })
  @ApiResponse({ status: 200, description: 'Engine hours report' })
  async engineHours(
    @Query() query: DeviceReportQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.reportsService.getEngineHours(query, user);
  }
}
