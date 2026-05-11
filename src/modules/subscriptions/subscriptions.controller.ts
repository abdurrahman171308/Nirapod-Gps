import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiQuery,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto, AdminCreateSubscriptionDto, AdminRenewSubscriptionDto } from './dto';
import { CurrentUser, Roles, Public } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { Role } from '../../common/enums/roles.enum';
import { SubscriptionStatus } from '../../database/schemas/subscription.schema';
import { PlanName } from '../../database/schemas/plan.schema';

@ApiTags('Subscriptions')
@ApiCookieAuth()
@Controller('subscriptions')
@UseGuards(RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'List all available plans (public)' })
  @ApiResponse({ status: 200, description: 'List of plans' })
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user subscription with subscribed devices' })
  @ApiResponse({ status: 200, description: 'Current subscription or null' })
  async getMySubscription(@CurrentUser('userId') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Get('checkout-summary')
  @ApiOperation({ summary: 'Get per-device checkout summary for current user' })
  @ApiQuery({ name: 'planName', required: true, enum: PlanName })
  @ApiQuery({
    name: 'deviceIds',
    required: false,
    type: [String],
    description: 'Optional device IDs to include. Defaults to all assigned devices.',
  })
  @ApiQuery({ name: 'couponCode', required: false, example: 'SAVE20' })
  @ApiResponse({ status: 200, description: 'Calculated subscription total based on selected devices' })
  async getCheckoutSummary(
    @CurrentUser('userId') userId: string,
    @Query('planName') planName: PlanName,
    @Query('deviceIds') deviceIds?: string | string[],
    @Query('couponCode') couponCode?: string,
  ) {
    const ids = deviceIds
      ? Array.isArray(deviceIds) ? deviceIds : [deviceIds]
      : undefined;
    return this.subscriptionsService.getCheckoutSummary(userId, planName, ids, couponCode);
  }

  @Post()
  @ApiOperation({ summary: 'Subscribe to a plan (with optional device selection)' })
  @ApiBody({ type: CreateSubscriptionDto })
  @ApiResponse({ status: 201, description: 'Subscription created' })
  @ApiResponse({ status: 409, description: 'Already has an active subscription' })
  async subscribe(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.subscribe(userId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel current subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  @ApiResponse({ status: 404, description: 'No active subscription found' })
  async cancel(@CurrentUser('userId') userId: string) {
    return this.subscriptionsService.cancelSubscription(userId);
  }

  @Get('validate-coupon')
  @ApiOperation({ summary: 'Validate a coupon code for a plan' })
  @ApiQuery({ name: 'code', required: true, example: 'SAVE20' })
  @ApiQuery({ name: 'planName', required: true, enum: PlanName })
  @ApiResponse({ status: 200, description: 'Coupon details' })
  async validateCoupon(
    @Query('code') code: string,
    @Query('planName') planName: PlanName,
  ) {
    return this.subscriptionsService.validateCoupon(code, planName);
  }

  @Get('payment-history')
  @ApiOperation({ summary: 'Get payment history for current user' })
  @ApiResponse({ status: 200, description: 'Payment history list with subscribed devices' })
  async getPaymentHistory(@CurrentUser('userId') userId: string) {
    return this.subscriptionsService.getPaymentHistory(userId);
  }

  // ─── Admin endpoints ─────────────────────────────────────────────────────

  @Get('admin/all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all subscriptions with subscribed devices (Admin only)' })
  @ApiQuery({ name: 'status', required: false, enum: SubscriptionStatus })
  @ApiResponse({ status: 200, description: 'All subscriptions' })
  async getAllSubscriptions(@Query('status') status?: SubscriptionStatus) {
    return this.subscriptionsService.getAllSubscriptions(status);
  }

  @Post('admin/create')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Admin: create a subscription for a user with specific devices and duration',
  })
  @ApiBody({ type: AdminCreateSubscriptionDto })
  @ApiResponse({ status: 201, description: 'Subscription created for user' })
  @ApiResponse({ status: 404, description: 'User or plan not found' })
  @ApiResponse({ status: 409, description: 'User already has an active subscription' })
  async adminCreateSubscription(@Body() dto: AdminCreateSubscriptionDto) {
    return this.subscriptionsService.adminCreateSubscription(dto);
  }

  @Patch('admin/renew/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Admin: renew / extend a subscription by adding months and optionally updating devices',
  })
  @ApiParam({ name: 'userId', description: 'Target user ID' })
  @ApiBody({ type: AdminRenewSubscriptionDto })
  @ApiResponse({ status: 200, description: 'Subscription extended' })
  @ApiResponse({ status: 404, description: 'User or active subscription not found' })
  async adminRenewSubscription(
    @Param('userId') userId: string,
    @Body() dto: AdminRenewSubscriptionDto,
  ) {
    return this.subscriptionsService.adminRenewSubscription(userId, dto);
  }

  @Get('admin/reports')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Admin: subscription report — summary counts + per-device subscription status',
  })
  @ApiResponse({
    status: 200,
    description: 'Report with summary, full subscription list, and device-wise breakdown',
  })
  async getSubscriptionReport() {
    return this.subscriptionsService.getSubscriptionReport();
  }
}
