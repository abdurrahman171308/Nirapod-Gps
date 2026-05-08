import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: admin.app.App | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase credentials not set — push notifications disabled.');
      return;
    }

    try {
      // Reuse existing app if already initialised (e.g. hot-reload)
      this.app =
        admin.apps.find((a) => a?.name === 'gps-tracker') ??
        admin.initializeApp(
          {
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          },
          'gps-tracker',
        );

      this.logger.log('Firebase Admin SDK initialised.');
    } catch (err) {
      this.logger.error(`Firebase init failed: ${err}`);
    }
  }

  /**
   * Send a push notification to a single FCM token.
   * Silently swaps to a data-only message so it also reaches background/killed apps.
   */
  async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.app) {
      return;
    }

    try {
      await this.app.messaging().send({
        token,
        notification: { title, body },
        data,
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'gps_alerts' },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      });

      this.logger.debug(`Push sent to token ${token.slice(0, 20)}…`);
    } catch (err: any) {
      // Token is stale / unregistered — caller should handle cleanup if needed
      this.logger.warn(`FCM send failed: ${err?.message ?? err}`);
    }
  }
}
