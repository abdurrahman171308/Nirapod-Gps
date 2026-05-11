import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { REQUIRE_SUBSCRIPTION_KEY } from '../decorators/require-subscription.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '../enums/roles.enum';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from '../../database/schemas/subscription.schema';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiresSubscription = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresSubscription) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user) {
      throw new UnauthorizedException('Unauthorized: Please log in to continue.');
    }

    // Admins bypass subscription check and have access to all devices
    if (user.role === Role.ADMIN) {
      return true;
    }

    const subscription = await this.subscriptionModel
      .findOne({
        userId: new Types.ObjectId(user.userId),
        status: SubscriptionStatus.ACTIVE,
      })
      .select('endDate subscribedDeviceIds')
      .lean();

    if (!subscription || subscription.endDate < new Date()) {
      throw new ForbiddenException(
        'An active subscription is required to access this resource.',
      );
    }

    // Merge subscribed device IDs into request.user so @CurrentUser() carries them to services
    request.user.subscribedDeviceIds = (subscription.subscribedDeviceIds ?? []).map(
      (id: Types.ObjectId) => id.toString(),
    );

    return true;
  }
}
