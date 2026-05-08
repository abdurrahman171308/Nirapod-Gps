import { Test, TestingModule } from '@nestjs/testing';
import { GT06ParserService } from './gt06-parser.service';
import { CrcUtil } from '../../common/utils/crc.util';

/**
 * Builds a valid GT06 short-format packet (0x7878).
 * Format: [0x78, 0x78, length, protocolNumber, ...data, serialHigh, serialLow, crcHigh, crcLow, 0x0D, 0x0A]
 */
function buildShortPacket(
  protocolNumber: number,
  data: Buffer,
  serial = 1,
): Buffer {
  // length = protocolNumber(1) + data + serial(2) + crc(2) = data.length + 5
  const packetLength = data.length + 5;
  const content = Buffer.alloc(2 + packetLength);
  content[0] = packetLength;
  content[1] = protocolNumber;
  data.copy(content, 2);
  content.writeUInt16BE(serial, 2 + data.length);

  const crcData = content.subarray(0, 2 + data.length + 2);
  const crc = CrcUtil.calculateCrc(crcData);

  const packet = Buffer.alloc(packetLength + 5);
  packet[0] = 0x78;
  packet[1] = 0x78;
  content.copy(packet, 2);
  packet.writeUInt16BE(crc, 2 + 2 + data.length + 2);
  packet[packet.length - 2] = 0x0d;
  packet[packet.length - 1] = 0x0a;
  return packet;
}

describe('GT06ParserService', () => {
  let service: GT06ParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GT06ParserService],
    }).compile();

    service = module.get<GT06ParserService>(GT06ParserService);
  });

  // ─── parseLoginPacket ────────────────────────────────────────────────────────

  describe('parseLoginPacket', () => {
    it('decodes IMEI from BCD bytes', () => {
      // BCD bytes 86 12 34 56 78 90 12 34 decode to "8612345678901234"
      // The parser strips leading zeros and pads to 15 if shorter,
      // but if the raw string is already 16 chars it is returned as-is.
      const data = Buffer.from([0x86, 0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34]);
      const result = service.parseLoginPacket(data);
      expect(result).not.toBeNull();
      expect(result!.imei).toBe('8612345678901234');
    });

    it('returns null when data is too short', () => {
      const result = service.parseLoginPacket(Buffer.from([0x01, 0x23]));
      expect(result).toBeNull();
    });
  });

  // ─── parseLocationPacket ─────────────────────────────────────────────────────

  describe('parseLocationPacket', () => {
    function buildLocationData(
      lat: number,
      lng: number,
      speed: number,
      northLat = true,
      eastLng = true,
    ): Buffer {
      const buf = Buffer.alloc(26);
      // Date: 2024-06-15 12:30:00
      buf[0] = 24; // year - 2000
      buf[1] = 6;
      buf[2] = 15;
      buf[3] = 12;
      buf[4] = 30;
      buf[5] = 0;

      // GPS info: satellites=8, length=0
      buf[6] = (8 << 4) | 0;

      // lat/lng in units of 1/1800000 degrees
      const latRaw = Math.round(Math.abs(lat) * 1800000);
      const lngRaw = Math.round(Math.abs(lng) * 1800000);
      buf.writeUInt32BE(latRaw, 7);
      buf.writeUInt32BE(lngRaw, 11);

      buf[15] = speed;

      // course bits: [15:12]=flags, [9:0]=course heading
      // bit11=west(0=east), bit10=north
      let courseStatus = 0;
      if (!eastLng) courseStatus |= 1 << 11;
      if (northLat) courseStatus |= 1 << 10;
      buf.writeUInt16BE(courseStatus, 16);

      // MCC/MNC/LAC/CellID placeholder
      buf.writeUInt16BE(0x0460, 18); // MCC=460 (China, for GT06N)
      buf[20] = 0x00; // MNC
      buf.writeUInt16BE(0x0001, 21); // LAC
      buf.writeUInt16BE(0x0001, 23); // CellID
      return buf;
    }

    it('parses latitude and longitude correctly for north-east quadrant', () => {
      const result = service.parseLocationPacket(buildLocationData(22.5, 114.0, 60));
      expect(result).not.toBeNull();
      expect(result!.lat).toBeCloseTo(22.5, 3);
      expect(result!.lng).toBeCloseTo(114.0, 3);
    });

    it('negates latitude for south hemisphere', () => {
      const result = service.parseLocationPacket(buildLocationData(22.5, 114.0, 0, false, true));
      expect(result!.lat).toBeCloseTo(-22.5, 3);
      expect(result!.lng).toBeCloseTo(114.0, 3);
    });

    it('negates longitude for west hemisphere', () => {
      const result = service.parseLocationPacket(buildLocationData(40.7, 74.0, 0, true, false));
      expect(result!.lat).toBeCloseTo(40.7, 3);
      expect(result!.lng).toBeCloseTo(-74.0, 3);
    });

    it('parses speed correctly', () => {
      const result = service.parseLocationPacket(buildLocationData(0, 0, 85));
      expect(result!.speed).toBe(85);
    });

    it('parses satellite count from GPS info byte', () => {
      const result = service.parseLocationPacket(buildLocationData(1, 1, 0));
      expect(result!.satellites).toBe(8);
    });

    it('parses datetime correctly', () => {
      const result = service.parseLocationPacket(buildLocationData(1, 1, 0));
      expect(result!.datetime.getUTCFullYear()).toBe(2024);
      expect(result!.datetime.getUTCMonth()).toBe(5); // June = 5 (0-indexed)
      expect(result!.datetime.getUTCDate()).toBe(15);
      expect(result!.datetime.getUTCHours()).toBe(12);
      expect(result!.datetime.getUTCMinutes()).toBe(30);
    });

    it('returns null when data is too short', () => {
      expect(service.parseLocationPacket(Buffer.alloc(10))).toBeNull();
    });
  });

  // ─── parseAlarmPacket ────────────────────────────────────────────────────────

  describe('parseAlarmPacket', () => {
    it('identifies SOS alarm type (1)', () => {
      const locData = Buffer.alloc(27);
      locData[6] = (4 << 4); // 4 satellites
      // alarmType bits [2:0] of byte 26 = 1 (SOS)
      locData[26] = 0x01;
      const result = service.parseAlarmPacket(locData);
      expect(result).not.toBeNull();
      expect(result!.alarmType).toBe(1);
      expect(result!.alarmDescription).toBe('SOS');
    });

    it('identifies Power Cut alarm type (2)', () => {
      const locData = Buffer.alloc(27);
      locData[6] = (4 << 4);
      locData[26] = 0x02;
      const result = service.parseAlarmPacket(locData);
      expect(result!.alarmType).toBe(2);
      expect(result!.alarmDescription).toBe('Power Cut');
    });

    it('identifies Fence In alarm type (4)', () => {
      const locData = Buffer.alloc(27);
      locData[6] = (4 << 4);
      locData[26] = 0x04;
      const result = service.parseAlarmPacket(locData);
      expect(result!.alarmType).toBe(4);
      expect(result!.alarmDescription).toBe('Fence In');
    });
  });

  // ─── parsePackets ────────────────────────────────────────────────────────────

  describe('parsePackets', () => {
    it('returns empty array for empty buffer', () => {
      expect(service.parsePackets(Buffer.alloc(0))).toEqual([]);
    });

    it('returns empty array for buffer with no valid start bytes', () => {
      expect(service.parsePackets(Buffer.from([0x00, 0x01, 0x02]))).toEqual([]);
    });

    it('parses a single short packet (0x7878)', () => {
      // Minimal login data: 8 bytes of IMEI
      const imeiData = Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0x01, 0x23, 0x40]);
      const packet = buildShortPacket(0x01, imeiData, 1);
      const { packets } = service.parsePackets(packet);
      expect(packets).toHaveLength(1);
      expect(packets[0].protocolNumber).toBe(0x01);
    });

    it('parses two consecutive short packets', () => {
      const imeiData = Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0x01, 0x23, 0x40]);
      const p1 = buildShortPacket(0x01, imeiData, 1);
      const p2 = buildShortPacket(0x13, Buffer.alloc(0), 2);
      const combined = Buffer.concat([p1, p2]);
      const { packets } = service.parsePackets(combined);
      expect(packets).toHaveLength(2);
      expect(packets[0].protocolNumber).toBe(0x01);
      expect(packets[1].protocolNumber).toBe(0x13);
    });
  });

  // ─── normalizeToTelemetry ────────────────────────────────────────────────────

  describe('normalizeToTelemetry', () => {
    it('maps location data fields to telemetry correctly', () => {
      const location = {
        datetime: new Date('2024-01-01T00:00:00Z'),
        lat: 22.5,
        lng: 114.0,
        speed: 60,
        course: 180,
        satellites: 8,
        mcc: 460,
        mnc: 0,
        lac: 1,
        cellId: 1,
      };
      const telemetry = service.normalizeToTelemetry('123456789012345', location, 'raw');
      expect(telemetry.imei).toBe('123456789012345');
      expect(telemetry.lat).toBe(22.5);
      expect(telemetry.lng).toBe(114.0);
      expect(telemetry.speed).toBe(60);
      expect(telemetry.course).toBe(180);
      expect(telemetry.satellites).toBe(8);
      expect(telemetry.raw).toBe('raw');
      expect(telemetry.serverTime).toBeInstanceOf(Date);
    });
  });

  // ─── getProtocolName ─────────────────────────────────────────────────────────

  describe('getProtocolName', () => {
    it('returns LOGIN for 0x01', () => {
      expect(service.getProtocolName(0x01)).toBe('LOGIN');
    });

    it('returns HEARTBEAT for 0x13', () => {
      expect(service.getProtocolName(0x13)).toBe('HEARTBEAT');
    });

    it('returns LOCATION for 0x12', () => {
      expect(service.getProtocolName(0x12)).toBe('LOCATION');
    });

    it('returns ALARM for 0x16', () => {
      expect(service.getProtocolName(0x16)).toBe('ALARM');
    });

    it('returns UNKNOWN hex string for unrecognized protocol', () => {
      expect(service.getProtocolName(0xff)).toContain('UNKNOWN');
      expect(service.getProtocolName(0xff)).toContain('ff');
    });
  });
});
