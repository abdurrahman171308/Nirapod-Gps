import { Injectable, Logger } from '@nestjs/common';
import { CrcUtil } from '../../common/utils/crc.util';
import {
  GT06Packet,
  GT06ProtocolNumber,
  GT06LoginData,
  GT06LocationData,
  GT06AlarmData,
  NormalizedTelemetry,
} from '../../common/types/gps.type';

@Injectable()
export class GT06ParserService {
  private readonly logger = new Logger(GT06ParserService.name);

  parsePackets(buffer: Buffer): { packets: GT06Packet[]; consumed: number } {
    const packets: GT06Packet[] = [];
    let offset = 0;

    while (offset < buffer.length - 1) {
      const startByte1 = buffer[offset];
      const startByte2 = buffer[offset + 1];

      if (startByte1 === 0x78 && startByte2 === 0x78) {
        if (offset + 3 > buffer.length) break;
        const packetLength = buffer[offset + 2];
        const totalLength = packetLength + 5;

        if (offset + totalLength > buffer.length) {
          break;
        }

        const packet = this.parseShortPacket(
          buffer.subarray(offset, offset + totalLength),
        );
        if (packet) {
          packets.push(packet);
        }
        offset += totalLength;
      } else if (startByte1 === 0x79 && startByte2 === 0x79) {
        if (offset + 4 > buffer.length) break;
        const packetLength = buffer.readUInt16BE(offset + 2);
        const totalLength = packetLength + 6;

        if (offset + totalLength > buffer.length) {
          break;
        }

        const packet = this.parseLongPacket(
          buffer.subarray(offset, offset + totalLength),
        );
        if (packet) {
          packets.push(packet);
        }
        offset += totalLength;
      } else {
        offset++;
      }
    }

    return { packets, consumed: offset };
  }

  private parseShortPacket(buffer: Buffer): GT06Packet | null {
    try {
      if (buffer.length < 5) return null;

      const startBytes = buffer.readUInt16BE(0);
      const packetLength = buffer[2];
      const protocolNumber = buffer[3];

      const dataEndIndex = 2 + packetLength - 4;
      const data = buffer.subarray(4, dataEndIndex);

      const serialNumber = buffer.readUInt16BE(dataEndIndex);
      const crc = buffer.readUInt16BE(dataEndIndex + 2);
      const stopBytes = buffer.readUInt16BE(dataEndIndex + 4);

      const crcData = buffer.subarray(2, dataEndIndex + 2);
      const calculatedCrc = CrcUtil.calculateCrc(crcData);

      if (crc !== calculatedCrc) {
        this.logger.warn(
          `CRC mismatch: expected ${crc.toString(16)}, got ${calculatedCrc.toString(16)}`,
        );
      }

      return {
        startBytes,
        packetLength,
        protocolNumber,
        data,
        serialNumber,
        crc,
        stopBytes,
      };
    } catch (error) {
      this.logger.error(`Error parsing short packet: ${error}`);
      return null;
    }
  }

  private parseLongPacket(buffer: Buffer): GT06Packet | null {
    try {
      if (buffer.length < 6) return null;

      const startBytes = buffer.readUInt16BE(0);
      const packetLength = buffer.readUInt16BE(2);
      const protocolNumber = buffer[4];

      const dataEndIndex = 4 + packetLength - 4;
      const data = buffer.subarray(5, dataEndIndex);

      const serialNumber = buffer.readUInt16BE(dataEndIndex);
      const crc = buffer.readUInt16BE(dataEndIndex + 2);
      const stopBytes = buffer.readUInt16BE(dataEndIndex + 4);

      return {
        startBytes,
        packetLength,
        protocolNumber,
        data,
        serialNumber,
        crc,
        stopBytes,
      };
    } catch (error) {
      this.logger.error(`Error parsing long packet: ${error}`);
      return null;
    }
  }

  parseLoginPacket(data: Buffer): GT06LoginData | null {
    try {
      if (data.length < 8) return null;

      const imeiBytes = data.subarray(0, 8);
      let imei = '';

      for (let i = 0; i < 8; i++) {
        const byte = imeiBytes[i];
        const high = (byte >> 4) & 0x0f;
        const low = byte & 0x0f;
        imei += high.toString(16) + low.toString(16);
      }

      imei = imei.replace(/^0+/, '');

      if (imei.length < 15) {
        imei = imei.padStart(15, '0');
      }

      return { imei };
    } catch (error) {
      this.logger.error(`Error parsing login packet: ${error}`);
      return null;
    }
  }

  parseLocationPacket(data: Buffer): GT06LocationData | null {
    try {
      if (data.length < 22) return null;

      const year = 2000 + data[0];
      const month = data[1];
      const day = data[2];
      const hour = data[3];
      const minute = data[4];
      const second = data[5];

      const datetime = new Date(
        Date.UTC(year, month - 1, day, hour, minute, second),
      );

      void (data[6] & 0x0f); // gpsInfoLength unused
      const satellites = (data[6] >> 4) & 0x0f;

      const latRaw =
        ((data[7] << 24) | (data[8] << 16) | (data[9] << 8) | data[10]) >>> 0;
      const lngRaw =
        ((data[11] << 24) | (data[12] << 16) | (data[13] << 8) | data[14]) >>>
        0;

      let lat = latRaw / 1800000;
      let lng = lngRaw / 1800000;

      const speed = data[15];

      const courseStatus = (data[16] << 8) | data[17];
      const course = courseStatus & 0x03ff;
      const isEastLongitude = !((courseStatus >> 11) & 0x01);
      const isNorthLatitude = (courseStatus >> 10) & 0x01;
      // Bit 8 of courseStatus is the ACC/ignition flag in GT06
      const ignition = Boolean((courseStatus >> 8) & 0x01);

      if (!isNorthLatitude) lat = -lat;
      if (!isEastLongitude) lng = -lng;

      const mcc = (data[18] << 8) | data[19];
      const mnc = data[20];
      const lac = (data[21] << 8) | data[22];
      const cellId =
        data.length > 25
          ? (data[23] << 16) | (data[24] << 8) | data[25]
          : (data[23] << 8) | data[24];

      return {
        datetime,
        satellites,
        lat,
        lng,
        speed,
        course,
        ignition,
        mcc,
        mnc,
        lac,
        cellId,
      };
    } catch (error) {
      this.logger.error(`Error parsing location packet: ${error}`);
      return null;
    }
  }

  parseAlarmPacket(data: Buffer): GT06AlarmData | null {
    try {
      const location = this.parseLocationPacket(data);
      if (!location) return null;

      const terminalInfo = data.length > 26 ? data[26] : 0;
      const alarmType = terminalInfo & 0x07;

      const alarmDescriptions: Record<number, string> = {
        0: 'Normal',
        1: 'SOS',
        2: 'Power Cut',
        3: 'Shock Alarm',
        4: 'Fence In',
        5: 'Fence Out',
        6: 'Speed Alarm',
        7: 'Moving Alarm',
      };

      return {
        ...location,
        alarmType,
        alarmDescription: alarmDescriptions[alarmType] || 'Unknown',
      };
    } catch (error) {
      this.logger.error(`Error parsing alarm packet: ${error}`);
      return null;
    }
  }

  buildLoginAck(serialNumber: number): Buffer {
    return this.buildAckPacket(GT06ProtocolNumber.LOGIN, serialNumber);
  }

  buildHeartbeatAck(serialNumber: number): Buffer {
    return this.buildAckPacket(GT06ProtocolNumber.HEARTBEAT, serialNumber);
  }

  buildLocationAck(serialNumber: number): Buffer {
    return this.buildAckPacket(GT06ProtocolNumber.LOCATION, serialNumber);
  }

  private buildAckPacket(protocolNumber: number, serialNumber: number): Buffer {
    // GT06 ACK packet structure:
    // 0x78 0x78 | length(1) | protocol(1) | serialNumber(2) | crc(2) | 0x0d 0x0a
    // length field = bytes from protocol to end of serial number = 1 + 1 + 2 = 4
    // But GT06 length = bytes after length field up to (not including) stop bytes
    // = protocol(1) + serialNumber(2) + crc(2) = 5, so length byte = 0x05
    // Total packet = 2(start) + 1(len) + 1(proto) + 2(serial) + 2(crc) + 2(stop) = 10 bytes

    // CRC is computed over: length byte + protocol byte + serial number bytes
    const crcData = Buffer.alloc(4);
    crcData[0] = 0x05; // length
    crcData[1] = protocolNumber;
    crcData.writeUInt16BE(serialNumber, 2);

    const crc = CrcUtil.calculateCrc(crcData);

    const packet = Buffer.alloc(10);
    packet[0] = 0x78;
    packet[1] = 0x78;
    packet[2] = 0x05; // length
    packet[3] = protocolNumber;
    packet.writeUInt16BE(serialNumber, 4);
    packet.writeUInt16BE(crc, 6);
    packet[8] = 0x0d;
    packet[9] = 0x0a;

    return packet;
  }

  normalizeToTelemetry(
    imei: string,
    location: GT06LocationData,
    raw?: string,
  ): NormalizedTelemetry {
    const telemetry: NormalizedTelemetry = {
      imei,
      lat: location.lat,
      lng: location.lng,
      speed: location.speed,
      course: location.course,
      deviceTime: location.datetime,
      serverTime: new Date(),
      satellites: location.satellites,
      raw,
    };
    if (location.ignition !== undefined) {
      telemetry.ignition = location.ignition;
    }
    return telemetry;
  }

  getProtocolName(protocolNumber: number): string {
    const names: Record<number, string> = {
      [GT06ProtocolNumber.LOGIN]: 'LOGIN',
      [GT06ProtocolNumber.HEARTBEAT]: 'HEARTBEAT',
      [GT06ProtocolNumber.LOCATION]: 'LOCATION',
      [GT06ProtocolNumber.LOCATION_LBS]: 'LOCATION_LBS',
      [GT06ProtocolNumber.ALARM]: 'ALARM',
    };
    return names[protocolNumber] || `UNKNOWN(0x${protocolNumber.toString(16)})`;
  }
}
