import {
  Controller,
  Get,
  Post,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { TripQueryDto } from './dto';
import { Roles, CurrentUser, RequireSubscription } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { Role } from '../../common/enums/roles.enum';
import { UserContext } from '../devices/devices.service';

@ApiTags('Trips')
@ApiCookieAuth()
@RequireSubscription()
@Controller('devices/:imei/trips')
@UseGuards(RolesGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all trips for a device' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiResponse({
    status: 200,
    description: 'List of trips',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            trips: { type: 'array' },
            total: { type: 'number' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async findAll(
    @Param('imei') imei: string,
    @Query() query: TripQueryDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.tripsService.findAll(imei, query, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get trip summary for a date range' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Trip summary statistics',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            totalTrips: { type: 'number' },
            totalDistance: { type: 'number' },
            totalDuration: { type: 'number' },
            avgTripDistance: { type: 'number' },
            avgTripDuration: { type: 'number' },
            maxSpeed: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getSummary(
    @Param('imei') imei: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.tripsService.getSummary(
      imei,
      new Date(from),
      new Date(to),
      user,
    );
  }

  @Post('detect')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detect and save trips for a date range (Admin only)',
  })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Number of trips detected',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            tripsDetected: { type: 'number' },
          },
        },
      },
    },
  })
  async detectTrips(
    @Param('imei') imei: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const count = await this.tripsService.detectAndSaveTrips(
      imei,
      new Date(from),
      new Date(to),
    );
    return { tripsDetected: count };
  }

  @Get(':tripId')
  @ApiOperation({ summary: 'Get a specific trip' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiParam({ name: 'tripId', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'Trip details' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async findOne(
    @Param('imei') imei: string,
    @Param('tripId') tripId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.tripsService.findOne(imei, tripId, user);
  }

  @Get(':tripId/route')
  @ApiOperation({ summary: 'Get trip route with all location points' })
  @ApiParam({ name: 'imei', description: 'Device IMEI' })
  @ApiParam({ name: 'tripId', description: 'Trip ID' })
  @ApiResponse({
    status: 200,
    description: 'Trip with route points',
    schema: {
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            trip: { type: 'object' },
            route: { type: 'array' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getTripRoute(
    @Param('imei') imei: string,
    @Param('tripId') tripId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.tripsService.getTripRoute(imei, tripId, user);
  }
}
