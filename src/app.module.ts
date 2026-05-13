import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DevicesModule } from './modules/devices/devices.module';
import { LocationsModule } from './modules/locations/locations.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { GpsIngestModule } from './modules/gps-ingest/gps-ingest.module';
import { TripsModule } from './modules/trips/trips.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { GeofencesModule } from './modules/geofences/geofences.module';
import { CommandsModule } from './modules/commands/commands.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { FcmModule } from './modules/fcm/fcm.module';
import { AddressModule } from './modules/address/address.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),

    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    AuthModule,
    DatabaseModule,
    UsersModule,
    DevicesModule,
    LocationsModule,
    AlertsModule,
    GpsIngestModule,
    TripsModule,
    TrackingModule,
    GeofencesModule,
    CommandsModule,
    ReportsModule,
    DashboardModule,
    SubscriptionsModule,
    CouponsModule,
    FcmModule,
    AddressModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
