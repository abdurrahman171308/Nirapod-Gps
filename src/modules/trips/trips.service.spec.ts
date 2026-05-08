import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TripsService } from './trips.service';
import { Trip } from '../../database/schemas/trip.schema';
import { LocationPoint } from '../../database/schemas/location-point.schema';
import { Device } from '../../database/schemas/device.schema';
import { DevicesService } from '../devices/devices.service';
import { ReverseGeocodingService } from './reverse-geocoding.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TripsServicePrivate = any;

function makePoint(
  lat: number,
  lng: number,
  speed: number,
  offsetSeconds = 0,
  baseDate = new Date('2024-01-01T08:00:00Z'),
): { lat: number; lng: number; speed: number; deviceTime: Date } {
  return {
    lat,
    lng,
    speed,
    deviceTime: new Date(baseDate.getTime() + offsetSeconds * 1000),
  };
}

describe('TripsService – trip detection', () => {
  let service: TripsServicePrivate;
  let tripModel: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
    insertMany: jest.Mock;
    deleteMany: jest.Mock;
    updateOne: jest.Mock;
    aggregate: jest.Mock;
  };
  let locationPointModel: {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let deviceModel: {
    findOne: jest.Mock;
  };
  let reverseGeocodingService: {
    reverse: jest.Mock;
  };

  beforeEach(async () => {
    tripModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      insertMany: jest.fn(),
      deleteMany: jest.fn(),
      updateOne: jest.fn(),
      aggregate: jest.fn(),
    };
    locationPointModel = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    deviceModel = {
      findOne: jest.fn(),
    };
    reverseGeocodingService = {
      reverse: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getModelToken(Trip.name), useValue: tripModel },
        { provide: getModelToken(LocationPoint.name), useValue: locationPointModel },
        { provide: getModelToken(Device.name), useValue: deviceModel },
        { provide: DevicesService, useValue: {} },
        { provide: ReverseGeocodingService, useValue: reverseGeocodingService },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService) as TripsServicePrivate;
  });

  // ─── haversineDistance ───────────────────────────────────────────────────────

  describe('haversineDistance', () => {
    it('returns 0 for identical points', () => {
      expect(service.haversineDistance(0, 0, 0, 0)).toBeCloseTo(0, 5);
    });

    it('returns ~111km per degree of latitude', () => {
      const d = service.haversineDistance(0, 0, 1, 0);
      expect(d).toBeGreaterThan(110);
      expect(d).toBeLessThan(112);
    });

    it('is symmetric', () => {
      const d1 = service.haversineDistance(22.5, 114.0, 23.0, 113.0);
      const d2 = service.haversineDistance(23.0, 113.0, 22.5, 114.0);
      expect(d1).toBeCloseTo(d2, 4);
    });
  });

  // ─── calculateTotalDistance ──────────────────────────────────────────────────

  describe('calculateTotalDistance', () => {
    it('returns 0 for a single point', () => {
      expect(service.calculateTotalDistance([{ lat: 0, lng: 0 }])).toBe(0);
    });

    it('returns 0 for an empty array', () => {
      expect(service.calculateTotalDistance([])).toBe(0);
    });

    it('sums distances between consecutive points', () => {
      const points = [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 0 }, // ~111km
        { lat: 2, lng: 0 }, // ~111km
      ];
      const d = service.calculateTotalDistance(points);
      expect(d).toBeGreaterThan(220);
      expect(d).toBeLessThan(224);
    });
  });

  // ─── isValidTrip ─────────────────────────────────────────────────────────────

  describe('isValidTrip', () => {
    it('accepts a trip meeting both thresholds (>= 0.1km, >= 60s)', () => {
      expect(service.isValidTrip({ distance: 0.5, duration: 120 })).toBe(true);
    });

    it('rejects a trip that is too short in distance', () => {
      expect(service.isValidTrip({ distance: 0.05, duration: 120 })).toBe(
        false,
      );
    });

    it('rejects a trip that is too short in duration', () => {
      expect(service.isValidTrip({ distance: 1.0, duration: 30 })).toBe(false);
    });

    it('accepts a trip exactly at the minimum thresholds', () => {
      expect(service.isValidTrip({ distance: 0.1, duration: 60 })).toBe(true);
    });
  });

  // ─── detectTrips ─────────────────────────────────────────────────────────────

  describe('detectTrips', () => {
    it('returns empty array for no points', () => {
      expect(service.detectTrips([])).toEqual([]);
    });

    it('returns empty array for a single point', () => {
      expect(service.detectTrips([makePoint(0, 0, 0)])).toEqual([]);
    });

    it('detects a single trip with movement followed by a long stop', () => {
      const points = [
        // Moving phase: travel ~1km north over 2 minutes
        makePoint(0.0, 0, 10, 0),
        makePoint(0.003, 0, 10, 30),
        makePoint(0.006, 0, 10, 60),
        makePoint(0.009, 0, 10, 90),
        makePoint(0.012, 0, 10, 120),
        // Stop for 6 minutes (> 5min threshold)
        makePoint(0.012, 0, 0, 180),
        makePoint(0.012, 0, 0, 240),
        makePoint(0.012, 0, 0, 300),
        makePoint(0.012, 0, 0, 360),
        makePoint(0.012, 0, 0, 480), // 8 min stop → trip ends
      ];
      const trips = service.detectTrips(points);
      expect(trips).toHaveLength(1);
      expect(trips[0].distance).toBeGreaterThan(0.1);
      expect(trips[0].duration).toBeGreaterThan(60);
    });

    it('does not end trip on a short stop (< 5 minutes)', () => {
      const points = [
        makePoint(0.0, 0, 10, 0),
        makePoint(0.003, 0, 10, 30),
        makePoint(0.006, 0, 10, 60),
        // Short stop — only 2 minutes
        makePoint(0.006, 0, 0, 90),
        makePoint(0.006, 0, 0, 150),
        // Resume moving
        makePoint(0.009, 0, 10, 210),
        makePoint(0.012, 0, 10, 270),
      ];
      // Trip still in progress at end of points — open trip, not finalized
      const trips = service.detectTrips(points);
      // Either 0 (open) or 1 (finalized at end) — but must NOT split into 2
      expect(trips.length).toBeLessThanOrEqual(1);
    });

    it('detects two trips separated by a long stop', () => {
      const points = [
        // Trip 1
        makePoint(0.0, 0, 10, 0),
        makePoint(0.003, 0, 10, 30),
        makePoint(0.006, 0, 10, 60),
        makePoint(0.009, 0, 10, 90),
        makePoint(0.012, 0, 10, 120),
        // Long stop: 10 minutes
        makePoint(0.012, 0, 0, 180),
        makePoint(0.012, 0, 0, 300),
        makePoint(0.012, 0, 0, 420),
        makePoint(0.012, 0, 0, 540),
        makePoint(0.012, 0, 0, 720), // 9 min stop
        // Trip 2
        makePoint(0.012, 0, 10, 780),
        makePoint(0.015, 0, 10, 810),
        makePoint(0.018, 0, 10, 840),
        makePoint(0.021, 0, 10, 870),
        makePoint(0.024, 0, 10, 900),
        // Long stop again
        makePoint(0.024, 0, 0, 960),
        makePoint(0.024, 0, 0, 1080),
        makePoint(0.024, 0, 0, 1200),
        makePoint(0.024, 0, 0, 1320),
        makePoint(0.024, 0, 0, 1500), // 9 min stop
      ];
      const trips = service.detectTrips(points);
      expect(trips).toHaveLength(2);
      expect(trips[0].startLat).toBeCloseTo(0, 4);
      expect(trips[1].startLat).toBeCloseTo(0.012, 4);
    });

    it('discards a trip that is too short (below min distance/duration)', () => {
      // Only 3 points, very close together, very short duration
      const points = [
        makePoint(0.0, 0, 10, 0),
        makePoint(0.0001, 0, 10, 5),
        makePoint(0.0002, 0, 10, 10),
        makePoint(0.0002, 0, 0, 20),
        makePoint(0.0002, 0, 0, 60),
        makePoint(0.0002, 0, 0, 120),
        makePoint(0.0002, 0, 0, 360), // 6 min stop — would finalize
      ];
      const trips = service.detectTrips(points);
      // Trip is too short in distance/duration — should be filtered out
      expect(trips).toHaveLength(0);
    });

    it('populates trip fields correctly', () => {
      const points = [
        makePoint(0.0, 0, 20, 0),
        makePoint(0.003, 0, 30, 30),
        makePoint(0.006, 0, 25, 60),
        makePoint(0.009, 0, 20, 90),
        makePoint(0.012, 0, 20, 120),
        makePoint(0.012, 0, 0, 180),
        makePoint(0.012, 0, 0, 300),
        makePoint(0.012, 0, 0, 420),
        makePoint(0.012, 0, 0, 540),
        makePoint(0.012, 0, 0, 660),
      ];
      const trips = service.detectTrips(points);
      expect(trips).toHaveLength(1);

      const trip = trips[0];
      expect(trip.startLat).toBeCloseTo(0, 4);
      expect(trip.startLng).toBeCloseTo(0, 4);
      expect(trip.endLat).toBeCloseTo(0.012, 4);
      expect(trip.maxSpeed).toBe(30);
      expect(trip.avgSpeed).toBeGreaterThan(0);
      expect(trip.distance).toBeGreaterThan(0.1);
      expect(trip.duration).toBeGreaterThan(60);
      expect(trip.pointCount).toBeGreaterThan(0);
    });
  });

  describe('live trip finalization', () => {
    it('finalizes an active trip when heartbeat inactivity exceeds the stop threshold', async () => {
      deviceModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'device-1' }),
      });
      tripModel.create.mockResolvedValue({});

      const baseDate = new Date('2024-01-01T08:00:00Z');

      await service.handleLocationForTripDetection({
        imei: '123456789012345',
        lat: 0,
        lng: 0,
        speed: 20,
        course: 0,
        deviceTime: baseDate,
        serverTime: baseDate,
      });

      await service.handleLocationForTripDetection({
        imei: '123456789012345',
        lat: 0.003,
        lng: 0,
        speed: 20,
        course: 0,
        deviceTime: new Date(baseDate.getTime() + 120_000),
        serverTime: new Date(baseDate.getTime() + 120_000),
      });

      await service.handleDeviceHeartbeatForTripDetection({
        imei: '123456789012345',
        at: new Date(baseDate.getTime() + 8 * 60 * 1000),
      });

      expect(tripModel.create).toHaveBeenCalledTimes(1);
      expect(tripModel.create.mock.calls[0][0]).toMatchObject({
        deviceId: 'device-1',
        imei: '123456789012345',
      });
    });
  });
});
