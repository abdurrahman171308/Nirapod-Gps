import { ConfigService } from '@nestjs/config';
import { CookieOptions } from 'express';

type CookieSameSite = 'lax' | 'strict' | 'none';

const DEFAULT_ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;
const DEFAULT_REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function parseExpirationToMs(
  expiration: string | undefined,
  fallbackMs: number,
): number {
  if (!expiration) {
    return fallbackMs;
  }

  const match = expiration.match(/^(\d+)([smhd])$/);
  if (!match) {
    return fallbackMs;
  }

  const value = parseInt(match[1], 10);

  switch (match[2]) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
}

function resolveCookieSecure(configService: ConfigService): boolean {
  const configuredValue = configService.get<string>('COOKIE_SECURE');

  if (configuredValue === 'true') {
    return true;
  }

  if (configuredValue === 'false') {
    return false;
  }

  return configService.get<string>('NODE_ENV') === 'production';
}

function resolveCookieSameSite(
  configService: ConfigService,
  secure: boolean,
): CookieSameSite {
  const configuredValue = configService
    .get<string>('COOKIE_SAME_SITE')
    ?.trim()
    .toLowerCase();

  if (
    configuredValue === 'lax' ||
    configuredValue === 'strict' ||
    configuredValue === 'none'
  ) {
    return configuredValue;
  }

  return secure ? 'none' : 'lax';
}

export function getAuthCookieBaseOptions(
  configService: ConfigService,
): CookieOptions {
  const secure = resolveCookieSecure(configService);
  const sameSite = resolveCookieSameSite(configService, secure);
  const domain = configService.get<string>('COOKIE_DOMAIN')?.trim() || undefined;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

export function getAccessCookieMaxAge(configService: ConfigService): number {
  return parseExpirationToMs(
    configService.get<string>('JWT_ACCESS_EXPIRES'),
    DEFAULT_ACCESS_COOKIE_MAX_AGE,
  );
}

export function getRefreshCookieMaxAge(configService: ConfigService): number {
  return parseExpirationToMs(
    configService.get<string>('JWT_REFRESH_EXPIRES'),
    DEFAULT_REFRESH_COOKIE_MAX_AGE,
  );
}
