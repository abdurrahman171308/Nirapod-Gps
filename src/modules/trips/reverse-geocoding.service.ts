import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ReverseGeocodeAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  hamlet?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
}

interface ReverseGeocodeResponse {
  display_name?: string;
  name?: string;
  error?: string;
  address?: ReverseGeocodeAddress;
}

interface CachedAddress {
  value?: string;
  expiresAt: number;
}

@Injectable()
export class ReverseGeocodingService {
  private readonly logger = new Logger(ReverseGeocodingService.name);
  private readonly cache = new Map<string, CachedAddress>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();
  private requestQueue = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly configService: ConfigService) {}

  async reverse(lat?: number, lng?: number): Promise<string | undefined> {
    const coordinate = this.getValidCoordinate(lat, lng);
    if (!this.isEnabled() || !coordinate) {
      return undefined;
    }

    const cacheKey = this.getCacheKey(coordinate.lat, coordinate.lng);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    this.cache.delete(cacheKey);

    const currentLookup = this.inflight.get(cacheKey);
    if (currentLookup) {
      return currentLookup;
    }

    const lookup = this.enqueueRequest(async () => {
      const address = await this.fetchAddress(coordinate.lat, coordinate.lng);
      this.cache.set(cacheKey, {
        value: address,
        expiresAt:
          Date.now() +
          this.getNumberConfig('REVERSE_GEOCODING_CACHE_TTL_MS', 604800000),
      });
      return address;
    }).finally(() => {
      this.inflight.delete(cacheKey);
    });

    this.inflight.set(cacheKey, lookup);
    return lookup;
  }

  private async enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
    const run = this.requestQueue.then(task, task);
    this.requestQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async fetchAddress(
    lat: number,
    lng: number,
  ): Promise<string | undefined> {
    await this.waitForRateLimit();

    const url = new URL(
      this.configService.get<string>('REVERSE_GEOCODING_BASE_URL') ||
        'https://nominatim.openstreetmap.org/reverse',
    );

    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set(
      'zoom',
      String(this.getNumberConfig('REVERSE_GEOCODING_ZOOM', 16)),
    );

    const language = this.configService.get<string>(
      'REVERSE_GEOCODING_LANGUAGE',
    );
    if (language) {
      url.searchParams.set('accept-language', language);
    }

    const email = this.configService.get<string>('REVERSE_GEOCODING_EMAIL');
    if (email) {
      url.searchParams.set('email', email);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.getNumberConfig('REVERSE_GEOCODING_TIMEOUT_MS', 7000),
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getRequestHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Reverse geocoding failed (${response.status}) for ${lat}, ${lng}`,
        );
        return undefined;
      }

      const data = (await response.json()) as ReverseGeocodeResponse;
      if (data.error) {
        this.logger.warn(
          `Reverse geocoding returned no address for ${lat}, ${lng}: ${data.error}`,
        );
        return undefined;
      }

      return this.formatPlaceName(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Reverse geocoding request failed for ${lat}, ${lng}: ${message}`,
      );
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getRequestHeaders(): Record<string, string> {
    const email = this.configService.get<string>('REVERSE_GEOCODING_EMAIL');
    const userAgent =
      this.configService.get<string>('REVERSE_GEOCODING_USER_AGENT') ||
      `NerapodGPS/1.0 (${email || 'admin@gps-tracker.local'})`;
    const referer = this.configService.get<string>('REVERSE_GEOCODING_REFERER');

    return {
      Accept: 'application/json',
      'User-Agent': userAgent,
      ...(referer ? { Referer: referer } : {}),
    };
  }

  private formatPlaceName(data: ReverseGeocodeResponse): string | undefined {
    const address = data.address;
    if (!address) {
      return this.cleanAddress(data.display_name || data.name);
    }

    const road = [address.house_number, address.road].filter(Boolean).join(' ');
    const primary =
      road ||
      address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      address.hamlet ||
      address.village ||
      address.town ||
      address.city ||
      address.municipality ||
      address.county ||
      data.name;

    const locality = this.firstDifferent(primary, [
      address.neighbourhood,
      address.suburb,
      address.village,
      address.town,
      address.city,
      address.municipality,
      address.county,
    ]);
    const region = this.firstDifferent(primary, [
      address.state,
      address.region,
      address.country,
    ]);

    const compact = this.uniqueParts([primary, locality, region]).join(', ');
    return this.cleanAddress(compact || data.display_name || data.name);
  }

  private uniqueParts(parts: Array<string | undefined>): string[] {
    const seen = new Set<string>();
    return parts
      .map((part) => this.cleanAddress(part))
      .filter((part): part is string => {
        if (!part) {
          return false;
        }

        const key = part.toLowerCase();
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  private firstDifferent(
    primary: string | undefined,
    candidates: Array<string | undefined>,
  ): string | undefined {
    const normalizedPrimary = primary?.trim().toLowerCase();
    return candidates.find((candidate) => {
      const normalizedCandidate = candidate?.trim().toLowerCase();
      return (
        normalizedCandidate &&
        normalizedCandidate.length > 0 &&
        normalizedCandidate !== normalizedPrimary
      );
    });
  }

  private cleanAddress(value?: string): string | undefined {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    return cleaned || undefined;
  }

  private async waitForRateLimit(): Promise<void> {
    const minIntervalMs = this.getNumberConfig(
      'REVERSE_GEOCODING_MIN_INTERVAL_MS',
      1100,
    );
    const waitMs = Math.max(0, this.lastRequestAt + minIntervalMs - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }

  private isEnabled(): boolean {
    return (
      this.configService.get<string>('REVERSE_GEOCODING_ENABLED') !== 'false'
    );
  }

  private getValidCoordinate(
    lat?: number,
    lng?: number,
  ): { lat: number; lng: number } | undefined {
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng };
    }

    return undefined;
  }

  private getCacheKey(lat: number, lng: number): string {
    const decimals = this.getNumberConfig(
      'REVERSE_GEOCODING_ROUND_DECIMALS',
      3,
    );
    return `${lat.toFixed(decimals)},${lng.toFixed(decimals)}`;
  }

  private getNumberConfig(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) ? value : fallback;
  }
}
