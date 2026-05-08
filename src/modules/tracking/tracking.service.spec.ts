import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TrackingService } from './tracking.service';
import { LocationPoint } from '../../database/schemas/location-point.schema';
import { DevicesService } from '../devices/devices.service';
import { LocationsService } from '../locations/locations.service';
import { TripsService } from '../trips/trips.service';

describe('TrackingService live state', () => {
  let service: TrackingService;
  let devicesService: {
    validateDeviceAccessByImei: jest.Mock;
    getLatestLocation: jest.Mock;
  };

  beforeEach(async () => {
    devicesService = {
      validateDeviceAccessByImei: jest.fn(),
      getLatestLocation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        { provide: getModelToken(LocationPoint.name), useValue: {} },
        { provide: DevicesService, useValue: devicesService },
        { provide: LocationsService, useValue: {} },
        { provide: TripsService, useValue: {} },
      ],
    }).compile();

    service = module.get<TrackingService>(TrackingService);
  });

  it('marks offline devices with zero speed and ignition off', async () => {
    const lastSeenAt = new Date('2026-05-05T14:03:28.898Z');
    const latestLocation = {
      _id: '69f9f7d2f5e8054fa2aa8197',
      imei: '867232056157820',
      lat: 23.947105333333337,
      lng: 89.65108483333333,
      speed: 16,
      course: 311,
      deviceTime: new Date('2026-05-05T12:12:21.000Z'),
      serverTime: new Date('2026-05-05T13:59:46.282Z'),
      ignition: true,
    };

    devicesService.validateDeviceAccessByImei.mockResolvedValue({
      imei: '867232056157820',
      isOnline: false,
      lastSeenAt,
      lastIgnition: true,
      lastIgnitionAt: new Date('2026-05-05T13:59:46.282Z'),
    });
    devicesService.getLatestLocation.mockResolvedValue(latestLocation);

    const result = await service.getLive('867232056157820', {
      userId: 'admin',
      role: 'ADMIN' as any,
    });

    expect(result).toEqual({
      imei: '867232056157820',
      isOnline: false,
      lastSeenAt,
      latestLocation: {
        ...latestLocation,
        speed: 0,
        ignition: false,
      },
    });
  });

  it('keeps device online but clears moving speed when only heartbeat is newer', async () => {
    const lastSeenAt = new Date();
    const latestLocationTime = new Date(lastSeenAt.getTime() - 90 * 1000);
    const latestLocation = {
      imei: '867232056157820',
      lat: 23.947105333333337,
      lng: 89.65108483333333,
      speed: 16,
      course: 311,
      deviceTime: latestLocationTime,
      serverTime: latestLocationTime,
      ignition: true,
    };

    devicesService.validateDeviceAccessByImei.mockResolvedValue({
      imei: '867232056157820',
      isOnline: true,
      lastSeenAt,
      lastIgnition: true,
      lastIgnitionAt: lastSeenAt,
    });
    devicesService.getLatestLocation.mockResolvedValue(latestLocation);

    const result = await service.getLive('867232056157820', {
      userId: 'admin',
      role: 'ADMIN' as any,
    });

    expect(result.isOnline).toBe(true);
    expect(result.latestLocation).toEqual({
      ...latestLocation,
      speed: 0,
      ignition: true,
    });
  });

  it('keeps current speed when the latest location is also the latest activity', async () => {
    const lastSeenAt = new Date();
    const latestLocation = {
      imei: '867232056157820',
      lat: 23.947105333333337,
      lng: 89.65108483333333,
      speed: 16,
      course: 311,
      deviceTime: lastSeenAt,
      serverTime: lastSeenAt,
      ignition: true,
    };

    devicesService.validateDeviceAccessByImei.mockResolvedValue({
      imei: '867232056157820',
      isOnline: true,
      lastSeenAt,
      lastIgnition: true,
      lastIgnitionAt: lastSeenAt,
    });
    devicesService.getLatestLocation.mockResolvedValue(latestLocation);

    const result = await service.getLive('867232056157820', {
      userId: 'admin',
      role: 'ADMIN' as any,
    });

    expect(result).toEqual({
      imei: '867232056157820',
      isOnline: true,
      lastSeenAt,
      latestLocation: latestLocation,
    });
  });
});
