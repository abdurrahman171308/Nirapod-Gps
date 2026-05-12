import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GeofencesService } from './geofences.service';
import { Geofence } from '../../database/schemas/geofence.schema';
import { DevicesService } from '../devices/devices.service';
import { AlertsService } from '../alerts/alerts.service';
import { Role } from '../../common/enums/roles.enum';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeofencesServicePrivate = any;

describe('GeofencesService – geometry', () => {
  let service: GeofencesServicePrivate;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeofencesService,
        { provide: getModelToken(Geofence.name), useValue: {} },
        { provide: DevicesService, useValue: {} },
        { provide: AlertsService, useValue: {} },
      ],
    }).compile();

    service = module.get<GeofencesService>(GeofencesService) as GeofencesServicePrivate;
  });

  // ─── haversineDistanceMeters ─────────────────────────────────────────────────

  describe('haversineDistanceMeters', () => {
    it('returns ~0 for identical coordinates', () => {
      const d = service.haversineDistanceMeters(51.5, -0.1, 51.5, -0.1);
      expect(d).toBeCloseTo(0, 1);
    });

    it('calculates ~111km per degree of latitude', () => {
      const d = service.haversineDistanceMeters(0, 0, 1, 0);
      expect(d).toBeGreaterThan(110_000);
      expect(d).toBeLessThan(112_000);
    });

    it('calculates correct distance between London and Paris (~340km)', () => {
      // London: 51.5074, -0.1278 | Paris: 48.8566, 2.3522
      const d = service.haversineDistanceMeters(51.5074, -0.1278, 48.8566, 2.3522);
      expect(d).toBeGreaterThan(330_000);
      expect(d).toBeLessThan(350_000);
    });

    it('is symmetric', () => {
      const d1 = service.haversineDistanceMeters(22.5, 114.0, 23.0, 113.5);
      const d2 = service.haversineDistanceMeters(23.0, 113.5, 22.5, 114.0);
      expect(d1).toBeCloseTo(d2, 1);
    });

    it('calculates short distances accurately (~100m)', () => {
      // ~0.001 degree latitude ≈ 111m
      const d = service.haversineDistanceMeters(0, 0, 0.001, 0);
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(120);
    });
  });

  // ─── pointInPolygon ──────────────────────────────────────────────────────────

  describe('pointInPolygon', () => {
    // Simple square: (0,0) to (1,1)
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ];

    it('detects point inside square', () => {
      expect(service.pointInPolygon(0.5, 0.5, square)).toBe(true);
    });

    it('detects point outside square', () => {
      expect(service.pointInPolygon(2, 2, square)).toBe(false);
    });

    it('detects point outside on negative side', () => {
      expect(service.pointInPolygon(-0.5, 0.5, square)).toBe(false);
    });

    it('works with a triangle', () => {
      const triangle = [
        { lat: 0, lng: 0 },
        { lat: 2, lng: 0 },
        { lat: 1, lng: 2 },
      ];
      expect(service.pointInPolygon(1, 0.5, triangle)).toBe(true);
      expect(service.pointInPolygon(0.1, 1.9, triangle)).toBe(false);
    });

    it('works with real-world polygon (rough Hong Kong area)', () => {
      const hkBox = [
        { lat: 22.15, lng: 113.83 },
        { lat: 22.15, lng: 114.44 },
        { lat: 22.56, lng: 114.44 },
        { lat: 22.56, lng: 113.83 },
      ];
      // Victoria Harbour: inside
      expect(service.pointInPolygon(22.3, 114.17, hkBox)).toBe(true);
      // Shenzhen: outside
      expect(service.pointInPolygon(22.7, 114.1, hkBox)).toBe(false);
    });
  });

  // ─── isInsideGeofence ────────────────────────────────────────────────────────

  describe('isInsideGeofence', () => {
    describe('circle type', () => {
      const circleGeofence: Partial<Geofence> = {
        type: 'circle',
        centerLat: 22.3,
        centerLng: 114.17,
        radiusMeters: 500,
        points: [],
      };

      it('returns true for point inside circle', () => {
        // ~0m from center
        expect(service.isInsideGeofence(circleGeofence as Geofence, 22.3, 114.17)).toBe(true);
      });

      it('returns true for point just within radius', () => {
        // ~440m north of center
        expect(service.isInsideGeofence(circleGeofence as Geofence, 22.304, 114.17)).toBe(true);
      });

      it('returns false for point outside circle', () => {
        // ~1.1km from center
        expect(service.isInsideGeofence(circleGeofence as Geofence, 22.31, 114.17)).toBe(false);
      });

      it('returns false when circle center is undefined', () => {
        const broken: Partial<Geofence> = { type: 'circle', points: [] };
        expect(service.isInsideGeofence(broken as Geofence, 22.3, 114.17)).toBe(false);
      });
    });

    describe('polygon type', () => {
      const polygonGeofence: Partial<Geofence> = {
        type: 'polygon',
        points: [
          { lat: 22.2, lng: 114.1 },
          { lat: 22.2, lng: 114.2 },
          { lat: 22.3, lng: 114.2 },
          { lat: 22.3, lng: 114.1 },
        ],
      };

      it('returns true for point inside polygon', () => {
        expect(service.isInsideGeofence(polygonGeofence as Geofence, 22.25, 114.15)).toBe(true);
      });

      it('returns false for point outside polygon', () => {
        expect(service.isInsideGeofence(polygonGeofence as Geofence, 22.5, 114.15)).toBe(false);
      });

      it('returns false when polygon has fewer than 3 points', () => {
        const twoPoints: Partial<Geofence> = {
          type: 'polygon',
          points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
        };
        expect(service.isInsideGeofence(twoPoints as Geofence, 0.5, 0.5)).toBe(false);
      });

      it('returns false when polygon has no points', () => {
        const noPoints: Partial<Geofence> = { type: 'polygon', points: [] };
        expect(service.isInsideGeofence(noPoints as Geofence, 0.5, 0.5)).toBe(false);
      });
    });
  });
});

describe('GeofencesService - findAll', () => {
  it('returns all geofences for regular users', async () => {
    const geofences = [{ _id: 'g1' }, { _id: 'g2' }];
    const exec = jest.fn().mockResolvedValue(geofences);
    const lean = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ lean });
    const find = jest.fn().mockReturnValue({ sort });
    const devicesService = { getAssignedImeis: jest.fn() };

    const service = new GeofencesService(
      { find } as any,
      devicesService as any,
      {} as any,
    );

    const result = await service.findAll({
      userId: 'user-1',
      role: Role.USER,
    });

    expect(result).toBe(geofences);
    expect(find).toHaveBeenCalledWith();
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(devicesService.getAssignedImeis).not.toHaveBeenCalled();
  });

  it('returns all geofences for admins', async () => {
    const geofences = [{ _id: 'g1' }];
    const exec = jest.fn().mockResolvedValue(geofences);
    const lean = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ lean });
    const find = jest.fn().mockReturnValue({ sort });

    const service = new GeofencesService(
      { find } as any,
      {} as any,
      {} as any,
    );

    const result = await service.findAll({
      userId: 'admin-1',
      role: Role.ADMIN,
    });

    expect(result).toBe(geofences);
    expect(find).toHaveBeenCalledWith();
  });
});
