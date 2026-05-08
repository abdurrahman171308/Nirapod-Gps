import { TcpServerService, GPS_LOCATION_EVENT } from './tcp-server.service';

describe('TcpServerService HQ text protocol', () => {
  function createService() {
    const eventEmitter = { emit: jest.fn() };
    const service = new TcpServerService(
      {} as any,
      {} as any,
      eventEmitter as any,
    );
    const socket = { write: jest.fn() };
    const connection = {
      socket,
      imei: '',
      buffer: Buffer.alloc(0),
      lastActivity: new Date(),
    };

    return { service, eventEmitter, socket, connection };
  }

  function getLocationTelemetry(eventEmitter: { emit: jest.Mock }) {
    const call = eventEmitter.emit.mock.calls.find(
      ([event]) => event === GPS_LOCATION_EVENT,
    );
    return call?.[1];
  }

  it('sets ignition on from HQ V1 status FFFFFFFF', () => {
    const { service, eventEmitter, socket, connection } = createService();

    (service as any).handleTextPacket(
      socket,
      connection,
      '*HQ,867232056157820,V1,133137,A,2357.68955,N,08936.24939,E,005.40,000,220426,FFFFFFFF#',
    );

    expect(getLocationTelemetry(eventEmitter)).toEqual(
      expect.objectContaining({
        imei: '867232056157820',
        ignition: true,
      }),
    );
  });

  it('sets ignition off from HQ V1 status FFFFFBFF', () => {
    const { service, eventEmitter, socket, connection } = createService();

    (service as any).handleTextPacket(
      socket,
      connection,
      '*HQ,867232056157820,V1,133137,A,2357.68955,N,08936.24939,E,000.00,000,220426,FFFFFBFF#',
    );

    expect(getLocationTelemetry(eventEmitter)).toEqual(
      expect.objectContaining({
        imei: '867232056157820',
        ignition: false,
      }),
    );
  });
});
