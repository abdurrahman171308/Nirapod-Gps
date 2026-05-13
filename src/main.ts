import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigins = configService.get<string>('CORS_ORIGINS') || '';
  const allowedOrigins = corsOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Derive the public URL from RAILWAY_PUBLIC_DOMAIN (set automatically by Railway)
  // or fall back to APP_URL if set manually.
  const railwayDomain = configService.get<string>('RAILWAY_PUBLIC_DOMAIN');
  const appUrl = configService.get<string>('APP_URL');
  const selfOrigin = railwayDomain
    ? `https://${railwayDomain}`
    : appUrl?.replace(/\/$/, '') ?? null;

  if (selfOrigin) allowedOrigins.push(selfOrigin);

  logger.log(`CORS allowed origins: ${allowedOrigins.join(', ') || '(none — only no-origin requests)'}`);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GPS Tracker API')
    .setVersion('1.0')
    .addCookieAuth('accessToken')
    .addTag('Authentication', 'Login, admin user creation, logout')
    .addTag('Devices', 'Device management')
    .addTag('Locations', 'Location history and playback')
    .addTag('Alerts', 'Alert management')
    .addTag('Trips', 'Trip history and reports')
    .addTag('Tracking', 'Unified live/history/trips/stops tracking APIs')
    .addTag('Geofences', 'Geofence management and geofence alerts')
    .addTag('Commands', 'Remote command dispatch to trackers')
    .addTag('Reports', 'Fleet and device operational reports')
    .addTag('Address', 'Bangladesh divisions, districts and upazilas')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = configService.get<number>('PORT') || 3000;
  const tcpPort = configService.get<number>('TCP_PORT') || 5023;

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Application running on: http://localhost:${port}`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`🔌 TCP Server for GPS devices: port ${tcpPort}`);
}

bootstrap();
