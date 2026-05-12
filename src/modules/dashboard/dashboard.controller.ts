import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { UserContext } from './dashboard.service';

@ApiTags('Dashboard')
@ApiCookieAuth()
@Controller('dashboard')
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Get dashboard summary',
    description:
      'Admin: all devices, users, alerts, and subscription coverage. User: assigned devices, alerts, and subscription coverage even when their subscription has expired.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard summary data' })
  async getSummary(@CurrentUser() user: UserContext) {
    return this.dashboardService.getSummary(user);
  }
}
