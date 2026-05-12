import { Types } from 'mongoose';
import { Role } from '../../common/enums/roles.enum';
import { DashboardService } from './dashboard.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createLeanQuery<T>(value: T) {
  return {
    lean: jest.fn().mockReturnValue(createExecQuery(value)),
  };
}

function createSelectLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnValue(createLeanQuery(value)),
  };
}

function createRecentAlertsQuery<T>(value: T) {
  return {
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue(createLeanQuery(value)),
    }),
  };
}

describe('DashboardService', () => {
  it('returns active and expired subscription counts for assigned user devices', async () => {
    const now = new Date();
    const device1Id = new Types.ObjectId();
    const device2Id = new Types.ObjectId();
    const device3Id = new Types.ObjectId();

    const assignedDevices = [
      {
        _id: device1Id,
        imei: '111',
        name: 'Car 1',
        isOnline: true,
        lastSeenAt: now,
        lastIgnition: true,
        lastIgnitionAt: now,
        lastLat: 23.7,
        lastLng: 90.4,
        lastSpeed: 40,
      },
      {
        _id: device2Id,
        imei: '222',
        name: 'Car 2',
        isOnline: false,
        lastSeenAt: new Date(now.getTime() - 60 * 60 * 1000),
        lastIgnition: false,
        lastIgnitionAt: now,
      },
      {
        _id: device3Id,
        imei: '333',
        name: 'Car 3',
        isOnline: true,
        lastSeenAt: now,
        lastIgnition: false,
        lastIgnitionAt: now,
      },
    ];

    const deviceModel = {
      find: jest.fn().mockReturnValue(createSelectLeanQuery(assignedDevices)),
    };
    const alertModel = {
      countDocuments: jest.fn().mockReturnValue(createExecQuery(0)),
      find: jest.fn().mockReturnValue(createRecentAlertsQuery([])),
    };
    const userModel = {};
    const subscriptionModel = {
      find: jest.fn().mockReturnValue(
        createSelectLeanQuery([
          {
            subscribedDeviceIds: [device1Id, device3Id],
          },
        ]),
      ),
    };

    const service = new DashboardService(
      deviceModel as any,
      alertModel as any,
      userModel as any,
      subscriptionModel as any,
    );

    const result = await service.getSummary({
      userId: new Types.ObjectId().toString(),
      role: Role.USER,
    });

    expect(result.devices.total).toBe(3);
    expect(result.devices.online).toBe(2);
    expect(result.subscriptions).toEqual({
      active: 2,
      expired: 1,
    });
  });

  it('marks all assigned devices as expired when the user has no active subscription', async () => {
    const now = new Date();
    const device1Id = new Types.ObjectId();
    const device2Id = new Types.ObjectId();

    const deviceModel = {
      find: jest.fn().mockReturnValue(
        createSelectLeanQuery([
          {
            _id: device1Id,
            imei: '111',
            name: 'Car 1',
            isOnline: true,
            lastSeenAt: now,
            lastIgnition: true,
            lastIgnitionAt: now,
          },
          {
            _id: device2Id,
            imei: '222',
            name: 'Car 2',
            isOnline: true,
            lastSeenAt: now,
            lastIgnition: false,
            lastIgnitionAt: now,
          },
        ]),
      ),
    };
    const alertModel = {
      countDocuments: jest.fn().mockReturnValue(createExecQuery(0)),
      find: jest.fn().mockReturnValue(createRecentAlertsQuery([])),
    };
    const subscriptionModel = {
      find: jest.fn().mockReturnValue(createSelectLeanQuery([])),
    };

    const service = new DashboardService(
      deviceModel as any,
      alertModel as any,
      {} as any,
      subscriptionModel as any,
    );

    const result = await service.getSummary({
      userId: new Types.ObjectId().toString(),
      role: Role.USER,
    });

    expect(result.subscriptions).toEqual({
      active: 0,
      expired: 2,
    });
  });
});
