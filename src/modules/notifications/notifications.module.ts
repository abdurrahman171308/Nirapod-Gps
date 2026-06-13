import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from '../../database/schemas/notification.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Alert, AlertSchema } from '../../database/schemas/alert.schema';
import { FcmModule } from '../fcm/fcm.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
    FcmModule,
  ],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
