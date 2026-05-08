import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { CreateDeviceCommandDto, DeviceCommandQueryDto } from './dto';
import { CommandsService } from './commands.service';

@ApiTags('Commands')
@ApiCookieAuth()
@RequireSubscription()
@Controller('devices/:imei/commands')
@UseGuards(RolesGuard)
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'imei' })
  @ApiOperation({ summary: 'Send command to device (Admin only)' })
  @ApiResponse({ status: 201, description: 'Command queued/sent' })
  async create(
    @Param('imei') imei: string,
    @Body() dto: CreateDeviceCommandDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.commandsService.create(imei, dto, user);
  }

  @Get()
  @ApiParam({ name: 'imei' })
  @ApiOperation({ summary: 'Get command history for device' })
  @ApiResponse({ status: 200, description: 'Command history' })
  async findByDevice(
    @Param('imei') imei: string,
    @Query() query: DeviceCommandQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.commandsService.findByDevice(imei, query, user);
  }
}
