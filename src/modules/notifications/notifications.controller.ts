import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Notifications')
@ApiCookieAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('send')
  @ApiOperation({ summary: 'Send a push notification to users (Admin only)' })
  async send(
    @Body() dto: SendNotificationDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.notificationsService.send(dto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all sent notifications (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async findAll(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.notificationsService.findAll(
      limit ? parseInt(limit, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
    );
  }
}
