import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
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
} from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { AlertQueryDto } from './dto';
import { Roles, CurrentUser, RequireSubscription } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { Role } from '../../common/enums/roles.enum';
import { UserContext } from '../devices/devices.service';

@ApiTags('Alerts')
@ApiCookieAuth()
@RequireSubscription()
@Controller('alerts')
@UseGuards(RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all alerts (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of alerts' })
  async findAll(@Query() query: AlertQueryDto) {
    return this.alertsService.findAll(query);
  }

  @Get('unacknowledged/count')
  @ApiOperation({ summary: 'Get count of unacknowledged alerts' })
  @ApiResponse({ status: 200, description: 'Unacknowledged alert count' })
  async getUnacknowledgedCount(@CurrentUser() user: UserContext) {
    const count = await this.alertsService.getUnacknowledgedCount(user);
    return { count };
  }

  @Get('my-devices')
  @ApiOperation({
    summary: 'Get alerts for all devices assigned to current user',
  })
  @ApiResponse({ status: 200, description: 'List of alerts for my devices' })
  async findForMyDevices(
    @Query() query: AlertQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.alertsService.findForMyDevices(query, user);
  }

  @Get('device/:imei')
  @ApiOperation({ summary: 'Get alerts for a specific device' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiResponse({ status: 200, description: 'List of alerts for device' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async findByDevice(
    @Param('imei') imei: string,
    @Query() query: AlertQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.alertsService.findByDevice(imei, query, user);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiResponse({ status: 200, description: 'Alert acknowledged' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async acknowledge(@Param('id') id: string, @CurrentUser() user: UserContext) {
    return this.alertsService.acknowledge(id, user);
  }

  @Post('acknowledge-multiple')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Acknowledge multiple alerts (Admin only)' })
  @ApiResponse({ status: 200, description: 'Alerts acknowledged' })
  async acknowledgeMultiple(
    @Body() body: { alertIds: string[] },
    @CurrentUser('userId') userId: string,
  ) {
    const count = await this.alertsService.acknowledgeMultiple(
      body.alertIds,
      userId,
    );
    return { acknowledged: count };
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Get notification inbox for current user (alerts for assigned devices)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated alerts with total and unread count',
    schema: {
      example: {
        alerts: [],
        total: 10,
        unreadCount: 3,
      },
    },
  })
  async getNotifications(
    @Query() query: AlertQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.alertsService.getNotifications(user, query);
  }

  @Get('notifications/latest-unacknowledged')
  @ApiOperation({
    summary: 'Get latest 5 unacknowledged alerts for current user (notification preview)',
  })
  @ApiResponse({
    status: 200,
    description: 'Up to 5 latest unacknowledged alerts',
  })
  async getLatestUnacknowledged(@CurrentUser() user: UserContext) {
    return this.alertsService.getLatestUnacknowledged(user);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single alert as read' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiResponse({ status: 200, description: 'Alert marked as read' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: UserContext) {
    return this.alertsService.markAsRead(id, user);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all unread alerts as read for current user' })
  @ApiResponse({ status: 200, description: 'Count of alerts marked as read' })
  async markAllAsRead(@CurrentUser() user: UserContext) {
    const count = await this.alertsService.markAllAsRead(user);
    return { markedAsRead: count };
  }
}
