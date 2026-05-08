import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
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
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto';
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
  @ApiResponse({
    status: 200,
    description: 'List of plans',
    schema: {
      example: [
        {
          _id: '664a1f2e8c1a2b3d4e5f6a7b',
          name: 'MONTHLY',
          displayName: 'Monthly',
          description:
            'Monthly subscription billed at 300 per assigned device.',
          priceMonthly: 300,
          priceYearly: 3600,
          dataRetentionDays: 30,
          features: [
            'Per-device billing at 300 per assigned device',
            'Monthly renewal',
            'Real-time GPS tracking',
            '30-day location history',
            'Overspeed alerts',
            'Geofence monitoring',
            'Trip history',
            'Email support',
          ],
          isActive: true,
          createdAt: '2024-05-20T08:00:00.000Z',
          updatedAt: '2024-05-20T08:00:00.000Z',
        },
        {
          _id: '664a1f2e8c1a2b3d4e5f6a7c',
          name: 'YEARLY',
          displayName: 'Yearly',
          description:
            'Yearly subscription billed at 3600 per assigned device.',
          priceMonthly: 300,
          priceYearly: 3600,
          dataRetentionDays: 90,
          features: [
            'Per-device billing at 300 per assigned device',
            'Yearly renewal',
            'Real-time GPS tracking',
            '90-day location history',
            'Overspeed & custom alerts',
            'Geofence monitoring',
            'Trip history & reports',
            'Fleet dashboard & analytics',
            'Remote device commands',
            'Priority support',
          ],
          isActive: true,
          createdAt: '2024-05-20T08:00:00.000Z',
          updatedAt: '2024-05-20T08:00:00.000Z',
        },
      ],
    },
  })
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user subscription' })
  @ApiResponse({
    status: 200,
    description: 'Current subscription or null',
    schema: {
      example: {
        _id: '664b2a3f9d2b3c4e5f6a7b8c',
        userId: '664a0e1d7b1a2b3c4d5e6f7a',
        planId: {
          _id: '664a1f2e8c1a2b3d4e5f6a7b',
          name: 'MONTHLY',
          displayName: 'Monthly',
          description:
            'Monthly subscription billed at 300 per assigned device.',
          priceMonthly: 300,
          priceYearly: 3600,
          dataRetentionDays: 30,
          features: [
            'Per-device billing at 300 per assigned device',
            'Monthly renewal',
            'Real-time GPS tracking',
            '30-day location history',
            'Overspeed alerts',
            'Geofence monitoring',
            'Trip history',
            'Email support',
          ],
        },
        planName: 'MONTHLY',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        startDate: '2024-05-20T08:00:00.000Z',
        endDate: '2024-06-20T08:00:00.000Z',
        amountPaid: 300,
        discountAmount: 0,
        couponCode: null,
        createdAt: '2024-05-20T08:00:00.000Z',
        updatedAt: '2024-05-20T08:00:00.000Z',
      },
    },
  })
  async getMySubscription(@CurrentUser('userId') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Get('checkout-summary')
  @ApiOperation({
    summary: 'Get per-device checkout summary for current user',
  })
  @ApiQuery({ name: 'planName', required: true, enum: PlanName })
  @ApiQuery({ name: 'couponCode', required: false, example: 'SAVE20' })
  @ApiResponse({
    status: 200,
    description: 'Calculated subscription total based on assigned devices',
    schema: {
      example: {
        planName: 'MONTHLY',
        billingCycle: 'MONTHLY',
        deviceCount: 2,
        pricePerDevice: 300,
        baseAmount: 600,
        discountAmount: 120,
        totalAmount: 480,
        coupon: {
          code: 'SAVE20',
          discountType: 'PERCENT',
          discountValue: 20,
          applicablePlans: ['MONTHLY', 'YEARLY'],
          discountAmount: 120,
        },
        hasActiveSubscription: false,
        subscriptionRequired: true,
        canSubscribe: true,
        message: 'Subscription total is based on 2 assigned device(s).',
        activeSubscription: null,
      },
    },
  })
  async getCheckoutSummary(
    @CurrentUser('userId') userId: string,
    @Query('planName') planName: PlanName,
    @Query('couponCode') couponCode?: string,
  ) {
    return this.subscriptionsService.getCheckoutSummary(userId, planName, couponCode);
  }

  @Post()
  @ApiOperation({ summary: 'Subscribe to a plan' })
  @ApiBody({
    type: CreateSubscriptionDto,
    schema: {
      example: {
        planName: 'MONTHLY',
        couponCode: 'SAVE20',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Subscription created',
    schema: {
      example: {
        _id: '664b2a3f9d2b3c4e5f6a7b8c',
        userId: '664a0e1d7b1a2b3c4d5e6f7a',
        planId: '664a1f2e8c1a2b3d4e5f6a7b',
        planName: 'MONTHLY',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        startDate: '2024-05-20T08:00:00.000Z',
        endDate: '2024-06-20T08:00:00.000Z',
        amountPaid: 300,
        discountAmount: 0,
        couponCode: null,
        createdAt: '2024-05-20T08:00:00.000Z',
        updatedAt: '2024-05-20T08:00:00.000Z',
      },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Coupon details',
    schema: {
      example: {
        code: 'SAVE20',
        discountType: 'PERCENT',
        discountValue: 20,
        applicablePlans: ['MONTHLY', 'YEARLY'],
      },
    },
  })
  async validateCoupon(
    @Query('code') code: string,
    @Query('planName') planName: PlanName,
  ) {
    return this.subscriptionsService.validateCoupon(code, planName);
  }

  @Get('payment-history')
  @ApiOperation({ summary: 'Get payment history for current user' })
  @ApiResponse({
    status: 200,
    description: 'Payment history list',
    schema: {
      example: [
        {
          _id: '664c3b4a0e3c4d5f6a7b8c9d',
          userId: '664a0e1d7b1a2b3c4d5e6f7a',
          subscriptionId: '664b2a3f9d2b3c4e5f6a7b8c',
          planName: 'MONTHLY',
          billingCycle: 'MONTHLY',
          amount: 240,
          discountAmount: 60,
          couponCode: 'SAVE20',
          status: 'SUCCESS',
          createdAt: '2024-05-20T08:00:00.000Z',
          updatedAt: '2024-05-20T08:00:00.000Z',
        },
      ],
    },
  })
  async getPaymentHistory(@CurrentUser('userId') userId: string) {
    return this.subscriptionsService.getPaymentHistory(userId);
  }

  // Admin endpoints
  @Get('admin/all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all subscriptions (Admin only)' })
  @ApiQuery({ name: 'status', required: false, enum: SubscriptionStatus })
  @ApiResponse({ status: 200, description: 'All subscriptions' })
  async getAllSubscriptions(@Query('status') status?: SubscriptionStatus) {
    return this.subscriptionsService.getAllSubscriptions(status);
  }
}
