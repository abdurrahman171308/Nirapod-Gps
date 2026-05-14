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
import { CreateSubscriptionDto, AdminCreateSubscriptionDto, AdminRenewSubscriptionDto } from './dto';
import { FcmService } from '../fcm/fcm.service';

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
    private readonly fcmService: FcmService,
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

  // Runs once daily at 9:00 AM — sends push reminders 7 days and 3 days before expiry.
  @Cron('0 9 * * *')
  async sendExpiryReminders() {
    const REMINDER_DAYS = [7, 3];

    for (const daysLeft of REMINDER_DAYS) {
      try {
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() + daysLeft);
        windowStart.setHours(0, 0, 0, 0);

        const windowEnd = new Date(windowStart);
        windowEnd.setHours(23, 59, 59, 999);

        const expiringSubs = await this.subscriptionModel
          .find({
            status: SubscriptionStatus.ACTIVE,
            endDate: { $gte: windowStart, $lte: windowEnd },
          })
          .select('userId planName endDate')
          .lean();

        for (const sub of expiringSubs) {
          const user = await this.userModel
            .findById(sub.userId)
            .select('fcmToken firstName')
            .lean();

          if (!user?.fcmToken) continue;

          const displayName = user.firstName ?? 'there';
          const expiryDate = new Date(sub.endDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });

          await this.fcmService.sendToToken(
            user.fcmToken,
            `Subscription Expiring in ${daysLeft} Days`,
            `Hi ${displayName}, your ${sub.planName} plan expires on ${expiryDate}. Please renew to avoid service interruption.`,
            {
              type: 'SUBSCRIPTION_EXPIRY_REMINDER',
              daysLeft: String(daysLeft),
              expiryDate: new Date(sub.endDate).toISOString(),
            },
          );

          this.logger.log(
            `Sent ${daysLeft}-day expiry reminder to user ${String(sub.userId)}`,
          );
        }
      } catch (error) {
        this.logger.error(`Error sending ${daysLeft}-day expiry reminders: ${error}`);
      }
    }
  }

  async getPlans() {
    return this.planModel.find({ isActive: true }).select('-__v').lean();
  }

  async getMySubscription(userId: string) {
    const subscription = await this.subscriptionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .populate('planId', '-__v')
      .populate('subscribedDeviceIds', 'imei name plateNumber isOnline lastSeenAt')
      .lean();

    if (!subscription) {
      return null;
    }

    return subscription;
  }

  async getCheckoutSummary(
    userId: string,
    planName: PlanName,
    deviceIds?: string[],
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
    const resolvedDevices = await this.resolveUserDevices(userId, deviceIds);
    const deviceCount = resolvedDevices.length;

    const cycleAmount =
      billingCycle === BillingCycle.YEARLY
        ? deviceCount * plan.priceYearly
        : deviceCount * plan.priceMonthly;

    let discountAmount = 0;
    let coupon: Record<string, unknown> | null = null;

    if (couponCode) {
      const validatedCoupon = await this.validateCoupon(couponCode, planName, cycleAmount);
      discountAmount = validatedCoupon.discountAmount ?? 0;
      coupon = validatedCoupon;
    }

    return {
      planName,
      billingCycle,
      deviceCount,
      selectedDevices: resolvedDevices.map((d) => ({
        _id: d._id,
        imei: d.imei,
        name: d.name,
        plateNumber: d.plateNumber,
      })),
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
          ? `Subscription total is based on ${deviceCount} selected device(s).`
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
    const resolvedDevices = await this.resolveUserDevices(userId, dto.deviceIds);

    if (resolvedDevices.length < 1) {
      throw new BadRequestException(
        'No devices are assigned to this account. An admin must assign at least one device before subscribing.',
      );
    }

    const deviceCount = resolvedDevices.length;
    const subscribedDeviceIds = resolvedDevices.map((d) => d._id as Types.ObjectId);

    const defaultDuration = billingCycle === BillingCycle.YEARLY ? 12 : 1;
    const durationMonths = dto.durationMonths ?? defaultDuration;

    const pricePerUnit =
      billingCycle === BillingCycle.YEARLY ? plan.priceYearly : plan.priceMonthly;
    const baseAmount = deviceCount * pricePerUnit * durationMonths;

    let discountAmount = 0;
    let appliedCouponCode: string | undefined;

    if (dto.couponCode) {
      const coupon = await this.validateAndApplyCoupon(dto.couponCode, dto.planName, baseAmount);
      discountAmount = coupon.discount;
      appliedCouponCode = coupon.code;
    }

    const amountPaid = Math.max(0, baseAmount - discountAmount);
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

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
      subscribedDeviceIds,
      pricePerDevice: this.pricePerDevice,
      baseAmount,
      couponCode: appliedCouponCode,
      discountAmount,
    });

    await this.userModel.findByIdAndUpdate(userId, { subscriptionId: subscription._id });

    await this.paymentRecordModel.create({
      userId: new Types.ObjectId(userId),
      subscriptionId: subscription._id,
      planName: plan.name,
      billingCycle,
      amount: amountPaid,
      deviceCount,
      subscribedDeviceIds,
      pricePerDevice: this.pricePerDevice,
      baseAmount,
      discountAmount,
      couponCode: appliedCouponCode,
      status: PaymentStatus.SUCCESS,
      notes: dto.notes,
    });

    return subscription;
  }

  // ─── Admin: create subscription for any user ──────────────────────────────

  async adminCreateSubscription(dto: AdminCreateSubscriptionDto) {
    const user = await this.userModel.findById(dto.userId).lean();
    if (!user) throw new NotFoundException(`User '${dto.userId}' not found.`);

    const plan = await this.planModel.findOne({ name: dto.planName, isActive: true });
    if (!plan) throw new NotFoundException(`Plan '${dto.planName}' not found.`);

    const devices = await this.validateAdminDeviceIds(dto.userId, dto.deviceIds);
    const deviceCount = devices.length;
    const subscribedDeviceIds = devices.map((d) => d._id as Types.ObjectId);

    const billingCycle = this.getBillingCycleFromPlanName(dto.planName);
    const pricePerUnit =
      billingCycle === BillingCycle.YEARLY ? plan.priceYearly : plan.priceMonthly;
    const baseAmount = deviceCount * pricePerUnit * dto.durationMonths;

    let discountAmount = 0;
    let appliedCouponCode: string | undefined;
    if (dto.couponCode) {
      const coupon = await this.validateAndApplyCoupon(dto.couponCode, dto.planName, baseAmount);
      discountAmount = coupon.discount;
      appliedCouponCode = coupon.code;
    }

    const amountPaid = Math.max(0, baseAmount - discountAmount);
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + dto.durationMonths);

    // Cancel any existing subscriptions (active or otherwise) before creating a new one
    await this.subscriptionModel.updateMany(
      { userId: new Types.ObjectId(dto.userId) },
      { status: SubscriptionStatus.CANCELLED },
    );

    const subscription = await this.subscriptionModel.create({
      userId: new Types.ObjectId(dto.userId),
      planId: plan._id,
      planName: plan.name,
      status: SubscriptionStatus.ACTIVE,
      billingCycle,
      startDate,
      endDate,
      amountPaid,
      deviceCount,
      subscribedDeviceIds,
      pricePerDevice: this.pricePerDevice,
      baseAmount,
      couponCode: appliedCouponCode,
      discountAmount,
    });

    await this.userModel.findByIdAndUpdate(dto.userId, { subscriptionId: subscription._id });

    await this.paymentRecordModel.create({
      userId: new Types.ObjectId(dto.userId),
      subscriptionId: subscription._id,
      planName: plan.name,
      billingCycle,
      amount: amountPaid,
      deviceCount,
      subscribedDeviceIds,
      pricePerDevice: this.pricePerDevice,
      baseAmount,
      discountAmount,
      couponCode: appliedCouponCode,
      status: PaymentStatus.SUCCESS,
      notes: dto.notes,
    });

    return subscription;
  }

  // ─── Admin: renew / extend an existing subscription ───────────────────────

  async adminRenewSubscription(userId: string, dto: AdminRenewSubscriptionDto) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException(`User '${userId}' not found.`);

    const subscription = await this.subscriptionModel.findOne({
      userId: new Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
    });

    if (!subscription) {
      throw new NotFoundException(
        'No active subscription found for this user. Use the create endpoint instead.',
      );
    }

    let subscribedDeviceIds: Types.ObjectId[];
    let deviceCount: number;

    if (dto.deviceIds && dto.deviceIds.length > 0) {
      const devices = await this.validateAdminDeviceIds(userId, dto.deviceIds);
      subscribedDeviceIds = devices.map((d) => d._id as Types.ObjectId);
      deviceCount = devices.length;
    } else {
      subscribedDeviceIds = (subscription.subscribedDeviceIds ?? []) as Types.ObjectId[];
      deviceCount = subscription.deviceCount;
    }

    const plan = await this.planModel.findById(subscription.planId).lean();
    if (!plan) throw new NotFoundException('Subscription plan not found.');

    const pricePerUnit =
      subscription.billingCycle === BillingCycle.YEARLY ? plan.priceYearly : plan.priceMonthly;
    const baseAmount = deviceCount * pricePerUnit * dto.durationMonths;

    let discountAmount = 0;
    let appliedCouponCode: string | undefined;
    if (dto.couponCode) {
      const coupon = await this.validateAndApplyCoupon(
        dto.couponCode,
        subscription.planName,
        baseAmount,
      );
      discountAmount = coupon.discount;
      appliedCouponCode = coupon.code;
    }

    const amountPaid = Math.max(0, baseAmount - discountAmount);

    // Extend from current endDate if still in the future, otherwise from now
    const extendFrom = subscription.endDate > new Date() ? subscription.endDate : new Date();
    const newEndDate = new Date(extendFrom);
    newEndDate.setMonth(newEndDate.getMonth() + dto.durationMonths);

    subscription.endDate = newEndDate;
    subscription.deviceCount = deviceCount;
    subscription.subscribedDeviceIds = subscribedDeviceIds;
    subscription.amountPaid = subscription.amountPaid + amountPaid;
    subscription.baseAmount = subscription.baseAmount + baseAmount;
    subscription.discountAmount = (subscription.discountAmount ?? 0) + discountAmount;
    if (appliedCouponCode) subscription.couponCode = appliedCouponCode;
    await subscription.save();

    await this.paymentRecordModel.create({
      userId: new Types.ObjectId(userId),
      subscriptionId: subscription._id,
      planName: subscription.planName,
      billingCycle: subscription.billingCycle,
      amount: amountPaid,
      deviceCount,
      subscribedDeviceIds,
      pricePerDevice: this.pricePerDevice,
      baseAmount,
      discountAmount,
      couponCode: appliedCouponCode,
      status: PaymentStatus.SUCCESS,
      notes: dto.notes,
    });

    return subscription;
  }

  // ─── Admin: device-wise subscription report ───────────────────────────────

  async getSubscriptionReport() {
    const [totalActive, totalExpired, allSubs] = await Promise.all([
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.ACTIVE }),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.EXPIRED }),
      this.subscriptionModel
        .find({ status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED] } })
        .populate('userId', 'email firstName lastName')
        .populate('subscribedDeviceIds', 'imei name plateNumber isOnline lastSeenAt')
        .sort({ createdAt: -1 })
        .select('-__v')
        .lean(),
    ]);

    const deviceWise: Record<string, unknown>[] = [];
    for (const sub of allSubs) {
      const devices = (sub.subscribedDeviceIds ?? []) as any[];
      for (const device of devices) {
        deviceWise.push({
          device: typeof device === 'object' ? device : { _id: device },
          user: sub.userId,
          subscriptionId: sub._id,
          planName: sub.planName,
          billingCycle: sub.billingCycle,
          status: sub.status,
          startDate: sub.startDate,
          endDate: sub.endDate,
        });
      }
    }

    return {
      summary: { totalActive, totalExpired },
      subscriptions: allSubs,
      deviceWise,
    };
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
      .populate('subscribedDeviceIds', 'imei name plateNumber')
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

  async getAllSubscriptions(status?: SubscriptionStatus) {
    const filter = status ? { status } : {};
    return this.subscriptionModel
      .find(filter)
      .populate('userId', 'email firstName lastName')
      .populate('planId', 'name displayName')
      .populate('subscribedDeviceIds', 'imei name plateNumber isOnline')
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();
  }

  async getSubscriptionAccessState(userId: string) {
    const deviceCount = await this.getAssignedDeviceCount(userId);
    const activeSubscription = await this.subscriptionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
      })
      .select('_id planName billingCycle startDate endDate amountPaid subscribedDeviceIds')
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

  /**
   * Returns the subscribed device IDs for a user's active subscription.
   * Used by SubscriptionGuard and DevicesService for per-device access control.
   */
  async getSubscribedDeviceIds(userId: string): Promise<Types.ObjectId[] | null> {
    const subscription = await this.subscriptionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
      })
      .select('subscribedDeviceIds')
      .lean();

    if (!subscription) return null;
    return (subscription.subscribedDeviceIds ?? []) as Types.ObjectId[];
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Resolves which devices to use for a subscription:
   * - If deviceIds provided: validates they belong to the user and are active.
   * - If omitted: returns all active devices assigned to the user.
   */
  private async resolveUserDevices(
    userId: string,
    deviceIds?: string[],
  ): Promise<DeviceDocument[]> {
    if (deviceIds && deviceIds.length > 0) {
      const objectIds = deviceIds.map((id) => new Types.ObjectId(id));
      const devices = await this.deviceModel
        .find({
          _id: { $in: objectIds },
          assignedUserId: new Types.ObjectId(userId),
          isActive: true,
        })
        .exec();

      if (devices.length !== deviceIds.length) {
        throw new BadRequestException(
          'One or more device IDs are invalid or not assigned to this user.',
        );
      }
      return devices;
    }

    return this.deviceModel
      .find({ assignedUserId: new Types.ObjectId(userId), isActive: true })
      .exec();
  }

  private async validateAdminDeviceIds(
    userId: string,
    deviceIds: string[],
  ): Promise<DeviceDocument[]> {
    if (!deviceIds || deviceIds.length === 0) {
      throw new BadRequestException('At least one device ID must be provided.');
    }

    const objectIds = deviceIds.map((id) => new Types.ObjectId(id));
    const devices = await this.deviceModel
      .find({
        _id: { $in: objectIds },
        assignedUserId: new Types.ObjectId(userId),
        isActive: true,
      })
      .exec();

    if (devices.length !== deviceIds.length) {
      throw new BadRequestException(
        'One or more device IDs are invalid or not assigned to the specified user.',
      );
    }

    return devices;
  }

  private async validateAndApplyCoupon(
    code: string,
    planName: PlanName,
    basePrice: number,
  ): Promise<{ discount: number; code: string }> {
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
    return planName === PlanName.YEARLY ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
  }
}
