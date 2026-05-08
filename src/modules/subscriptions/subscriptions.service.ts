import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Plan, PlanDocument, BillingCycle, PlanName } from '../../database/schemas/plan.schema';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../../database/schemas/subscription.schema';
import { Coupon, CouponDocument, DiscountType } from '../../database/schemas/coupon.schema';
import { PaymentRecord, PaymentRecordDocument, PaymentStatus } from '../../database/schemas/payment-record.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Device, DeviceDocument } from '../../database/schemas/device.schema';
import { CreateSubscriptionDto } from './dto';

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly pricePerDevice = 300;

  constructor(
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    @InjectModel(PaymentRecord.name) private paymentRecordModel: Model<PaymentRecordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
  ) {}

  async onModuleInit() {
    await this.seedPlans();
  }

  private async seedPlans() {
    const plans = [
      {
        name: PlanName.MONTHLY,
        displayName: 'Monthly',
        description: 'Monthly subscription billed at 300 per assigned device.',
        priceMonthly: this.pricePerDevice,
        priceYearly: this.pricePerDevice * 12,
        pricePerDevice: this.pricePerDevice,
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
      {
        name: PlanName.YEARLY,
        displayName: 'Yearly',
        description: 'Yearly subscription billed at 3600 per assigned device.',
        priceMonthly: this.pricePerDevice,
        priceYearly: this.pricePerDevice * 12,
        pricePerDevice: this.pricePerDevice,
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
      },
    ];

    for (const plan of plans) {
      await this.planModel.findOneAndUpdate(
        { name: plan.name },
        { $set: plan },
        { upsert: true, new: true },
      );
    }

    this.logger.log('Plans seeded successfully');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireSubscriptions() {
    try {
      const result = await this.subscriptionModel.updateMany(
        { status: SubscriptionStatus.ACTIVE, endDate: { $lt: new Date() } },
        { status: SubscriptionStatus.EXPIRED },
      );

      if (result.modifiedCount > 0) {
        this.logger.log(`Expired ${result.modifiedCount} subscription(s)`);
      }
    } catch (error) {
      this.logger.error(`Error expiring subscriptions: ${error}`);
    }
  }

  async getPlans() {
    return this.planModel.find({ isActive: true }).select('-__v').lean();
  }

  async getMySubscription(userId: string) {
    const subscription = await this.subscriptionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .populate('planId', '-__v')
      .lean();

    if (!subscription) {
      return null;
    }

    return subscription;
  }

  async getCheckoutSummary(
    userId: string,
    planName: PlanName,
    couponCode?: string,
  ) {
    const activeSubscription = await this.subscriptionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
      })
      .select('_id planName billingCycle startDate endDate amountPaid')
      .lean();

    const plan = await this.planModel.findOne({ name: planName, isActive: true });
    if (!plan) {
      throw new NotFoundException(`Plan '${planName}' not found.`);
    }

    const billingCycle = this.getBillingCycleFromPlanName(planName);
    const deviceCount = await this.getAssignedDeviceCount(userId);
    const cycleAmount =
      billingCycle === BillingCycle.YEARLY
        ? deviceCount * plan.priceYearly
        : deviceCount * plan.priceMonthly;

    let discountAmount = 0;
    let coupon: Record<string, unknown> | null = null;

    if (couponCode) {
      const validatedCoupon = await this.validateCoupon(
        couponCode,
        planName,
        cycleAmount,
      );
      discountAmount = validatedCoupon.discountAmount ?? 0;
      coupon = validatedCoupon;
    }

    return {
      planName,
      billingCycle,
      deviceCount,
      pricePerDevice: this.pricePerDevice,
      baseAmount: cycleAmount,
      discountAmount,
      totalAmount: Math.max(0, cycleAmount - discountAmount),
      coupon,
      hasActiveSubscription: Boolean(activeSubscription),
      subscriptionRequired: !activeSubscription && deviceCount > 0,
      canSubscribe: deviceCount > 0,
      message:
        deviceCount > 0
          ? `Subscription total is based on ${deviceCount} assigned device(s).`
          : 'No devices are assigned to this account yet. An admin must assign at least one device before checkout.',
      activeSubscription,
    };
  }

  async subscribe(userId: string, dto: CreateSubscriptionDto) {
    const existing = await this.subscriptionModel.findOne({
      userId: new Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
    });

    if (existing && existing.endDate > new Date()) {
      throw new ConflictException('You already have an active subscription.');
    }

    const plan = await this.planModel.findOne({ name: dto.planName, isActive: true });
    if (!plan) {
      throw new NotFoundException(`Plan '${dto.planName}' not found.`);
    }

    const billingCycle = this.getBillingCycleFromPlanName(dto.planName);
    const deviceCount = await this.getAssignedDeviceCount(userId);
    if (deviceCount < 1) {
      throw new BadRequestException(
        'No devices are assigned to this account. An admin must assign at least one device before subscribing.',
      );
    }

    const baseAmount =
      billingCycle === BillingCycle.YEARLY
        ? deviceCount * plan.priceYearly
        : deviceCount * plan.priceMonthly;

    let discountAmount = 0;
    let appliedCouponCode: string | undefined;

    if (dto.couponCode) {
      const coupon = await this.validateAndApplyCoupon(
        dto.couponCode,
        dto.planName,
        baseAmount,
      );
      discountAmount = coupon.discount;
      appliedCouponCode = coupon.code;
    }

    const amountPaid = Math.max(0, baseAmount - discountAmount);

    const startDate = new Date();
    const endDate = new Date(startDate);
    if (billingCycle === BillingCycle.YEARLY) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Cancel any old non-active subscription for this user
    await this.subscriptionModel.updateMany(
      { userId: new Types.ObjectId(userId), status: { $ne: SubscriptionStatus.ACTIVE } },
      { status: SubscriptionStatus.CANCELLED },
    );

    const subscription = await this.subscriptionModel.create({
      userId: new Types.ObjectId(userId),
      planId: plan._id,
      planName: plan.name,
      status: SubscriptionStatus.ACTIVE,
      billingCycle,
      startDate,
      endDate,
      amountPaid,
      deviceCount,
      pricePerDevice: this.pricePerDevice,
      baseAmount,
      couponCode: appliedCouponCode,
      discountAmount,
    });

    // Link subscription to user
    await this.userModel.findByIdAndUpdate(userId, { subscriptionId: subscription._id });

    // Record payment
    await this.paymentRecordModel.create({
      userId: new Types.ObjectId(userId),
      subscriptionId: subscription._id,
      planName: plan.name,
      billingCycle,
      amount: amountPaid,
      deviceCount,
      pricePerDevice: this.pricePerDevice,
      baseAmount,
      discountAmount,
      couponCode: appliedCouponCode,
      status: PaymentStatus.SUCCESS,
    });

    return subscription;
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.subscriptionModel.findOne({
      userId: new Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found.');
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    await subscription.save();

    await this.userModel.findByIdAndUpdate(userId, { $unset: { subscriptionId: 1 } });

    return { message: 'Subscription cancelled successfully.' };
  }

  async getPaymentHistory(userId: string) {
    return this.paymentRecordModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();
  }

  async validateCoupon(code: string, planName: PlanName, baseAmount?: number) {
    const plan = await this.planModel.findOne({ name: planName, isActive: true });
    if (!plan) {
      throw new NotFoundException(`Plan '${planName}' not found.`);
    }

    const coupon = await this.couponModel.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) {
      throw new BadRequestException('Invalid or inactive coupon code.');
    }
    if (coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired.');
    }
    if (coupon.usedCount >= coupon.maxUsage) {
      throw new BadRequestException('Coupon usage limit has been reached.');
    }
    if (coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(planName)) {
      throw new BadRequestException(`Coupon is not applicable to the '${planName}' plan.`);
    }

    return {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      applicablePlans: coupon.applicablePlans,
      discountAmount:
        baseAmount !== undefined
          ? this.calculateDiscountAmount(coupon.discountType, coupon.discountValue, baseAmount)
          : undefined,
    };
  }

  // Admin: list all subscriptions
  async getAllSubscriptions(status?: SubscriptionStatus) {
    const filter = status ? { status } : {};
    return this.subscriptionModel
      .find(filter)
      .populate('userId', 'email firstName lastName')
      .populate('planId', 'name displayName')
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();
  }

  private async validateAndApplyCoupon(
    code: string,
    planName: PlanName,
    basePrice: number,
  ): Promise<{ discount: number; code: string }> {
    // First validate without incrementing
    const coupon = await this.couponModel.findOne({ code: code.toUpperCase(), isActive: true });

    if (!coupon) {
      throw new BadRequestException('Invalid or inactive coupon code.');
    }
    if (coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired.');
    }
    if (coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(planName)) {
      throw new BadRequestException(`Coupon is not applicable to the '${planName}' plan.`);
    }

    // Atomic increment — only succeeds if usedCount is still below maxUsage
    const updated = await this.couponModel.findOneAndUpdate(
      {
        _id: coupon._id,
        isActive: true,
        $expr: { $lt: ['$usedCount', '$maxUsage'] },
      },
      { $inc: { usedCount: 1 } },
      { new: true },
    );

    if (!updated) {
      throw new BadRequestException('Coupon usage limit has been reached.');
    }

    const discount = this.calculateDiscountAmount(
      coupon.discountType,
      coupon.discountValue,
      basePrice,
    );

    return { discount, code: coupon.code };
  }

  async getSubscriptionAccessState(userId: string) {
    const deviceCount = await this.getAssignedDeviceCount(userId);
    const activeSubscription = await this.subscriptionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
      })
      .select('_id planName billingCycle startDate endDate amountPaid')
      .lean();

    return {
      assignedDeviceCount: deviceCount,
      pricePerDevice: this.pricePerDevice,
      expectedMonthlyAmount: deviceCount * this.pricePerDevice,
      expectedYearlyAmount: deviceCount * this.pricePerDevice * 12,
      hasActiveSubscription: Boolean(activeSubscription),
      subscriptionRequired: !activeSubscription && deviceCount > 0,
      shouldPromptSubscription: !activeSubscription && deviceCount > 0,
      activeSubscription,
    };
  }

  private async getAssignedDeviceCount(userId: string): Promise<number> {
    return this.deviceModel.countDocuments({
      assignedUserId: new Types.ObjectId(userId),
      isActive: true,
    });
  }

  private calculateDiscountAmount(
    discountType: DiscountType,
    discountValue: number,
    baseAmount: number,
  ): number {
    const discount =
      discountType === DiscountType.PERCENT
        ? (baseAmount * discountValue) / 100
        : discountValue;

    return Math.min(baseAmount, discount);
  }

  private getBillingCycleFromPlanName(planName: PlanName): BillingCycle {
    return planName === PlanName.YEARLY
      ? BillingCycle.YEARLY
      : BillingCycle.MONTHLY;
  }
}
