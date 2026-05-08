import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as net from 'net';
import { GT06ParserService } from './gt06-parser.service';
import { GT06ProtocolNumber } from '../../common/types/gps.type';

interface DeviceConnection {
  socket: net.Socket;
  imei: string;
  buffer: Buffer;
  lastActivity: Date;
}

export const GPS_LOCATION_EVENT = 'gps.location';
export const GPS_ALARM_EVENT = 'gps.alarm';
export const GPS_DEVICE_CONNECTED = 'gps.device.connected';
export const GPS_DEVICE_DISCONNECTED = 'gps.device.disconnected';
export const GPS_DEVICE_HEARTBEAT = 'gps.device.heartbeat';

const HQ_IGNITION_STATUS_BIT = 10;

@Injectable()
export class TcpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TcpServerService.name);
  private server: net.Server | null = null;
  private connections: Map<string, DeviceConnection> = new Map();
  private socketToImei: Map<net.Socket, string> = new Map();

  constructor(
    private configService: ConfigService,
    private gt06Parser: GT06ParserService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    const port = this.configService.get<number>('TCP_PORT') || 5023;
    await this.start(port).catch((error) => {
      this.logger.error(
        `TCP Server failed to start on port ${port}: ${error.message}. GPS device ingestion will be unavailable.`,
      );
    });
  }

  async onModuleDestroy() {
    await this.stop();
  }

  private async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.handleConnection(socket));

      const onStartupError = (error: Error) => {
        reject(error);
      };

      this.server.once('error', onStartupError);

      this.server.listen(port, () => {
        this.server!.removeListener('error', onStartupError);
        this.server!.on('error', (error) => {
          this.logger.error(`TCP Server runtime error: ${error.message}`);
        });
        this.logger.log(`TCP Server listening on port ${port}`);
        resolve();
      });
    });
  }

  private async stop(): Promise<void> {
    for (const [, connection] of this.connections) {
      connection.socket.destroy();
    }
    this.connections.clear();
    this.socketToImei.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.logger.log('TCP Server stopped');
          resolve();
        });
      });
    }
  }

  private handleConnection(socket: net.Socket): void {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.log(`New connection from ${clientId}`);

    const connection: DeviceConnection = {
      socket,
      imei: '',
      buffer: Buffer.alloc(0),
      lastActivity: new Date(),
    };

    socket.setTimeout(900000); // 15 minutes — devices heartbeat every 2-5 min

    socket.on('data', (data: Buffer) => {
      this.handleData(socket, connection, data);
    });

    socket.on('close', () => {
      this.handleDisconnect(socket, connection);
    });

    socket.on('error', (error) => {
      this.logger.warn(`Socket error from ${clientId}: ${error.message}`);
      socket.destroy();
    });

    socket.on('timeout', () => {
      this.logger.warn(`Socket timeout for ${clientId}`);
      socket.destroy();
    });
  }

  private handleData(
    socket: net.Socket,
    connection: DeviceConnection,
    data: Buffer,
  ): void {
    connection.buffer = Buffer.concat([connection.buffer, data]);
    connection.lastActivity = new Date();

    try {
      // Detect text-based protocol (ALO tracker sends ASCII semicolon-delimited strings)
      const rawStr = connection.buffer.toString('utf8');
      if (this.isTextProtocol(connection.buffer)) {
        this.logger.debug(`Raw text data received: ${rawStr}`);

        // HQ protocol: each packet starts with * and ends with #
        // Multiple packets may arrive concatenated in one TCP frame: *HQ,...#*HQ,...#
        // Split on complete *...# packets first, then fall back to newline/semicolon delimiters
        const hqPackets = rawStr.match(/\*[^#]*#/g);
        if (hqPackets && hqPackets.length > 0) {
          for (const pkt of hqPackets) {
            this.handleTextPacket(socket, connection, pkt.trim());
          }
          // Keep anything after the last # in the buffer (incomplete packet)
          const lastHash = rawStr.lastIndexOf('#');
          const trailing = rawStr.slice(lastHash + 1).trim();
          connection.buffer = trailing.length > 0 ? Buffer.from(trailing, 'utf8') : Buffer.alloc(0);
        } else {
          // No complete HQ packet yet — wait for more data or fall back to line/semicolon
          const lines = rawStr.split(/\r?\n/);
          if (lines.length > 1) {
            for (let i = 0; i < lines.length - 1; i++) {
              const line = lines[i].trim();
              if (line.length > 0) {
                this.handleTextPacket(socket, connection, line);
              }
            }
            connection.buffer = Buffer.from(lines[lines.length - 1], 'utf8');
          } else {
            const trimmed = rawStr.trim();
            if (trimmed.endsWith(';') || trimmed.length > 20) {
              this.handleTextPacket(socket, connection, trimmed);
              connection.buffer = Buffer.alloc(0);
            }
          }
        }

        if (connection.buffer.length > 10240) {
          this.logger.warn('Buffer overflow, clearing buffer');
          connection.buffer = Buffer.alloc(0);
        }
        return;
      }

      // Binary GT06 protocol
      const { packets, consumed } = this.gt06Parser.parsePackets(connection.buffer);

      for (const packet of packets) {
        this.processPacket(socket, connection, packet);
      }

      if (consumed > 0) {
        connection.buffer = connection.buffer.subarray(consumed);
      }

      if (connection.buffer.length > 10240) {
        this.logger.warn('Buffer overflow, clearing buffer');
        connection.buffer = Buffer.alloc(0);
      }
    } catch (error) {
      this.logger.error(`Error processing data: ${error}`);
      this.logger.debug(`Raw data (hex): ${data.toString('hex')}`);
    }
  }

  private isTextProtocol(buffer: Buffer): boolean {
    // ALO / text-based trackers send printable ASCII with semicolons
    // GT06 binary packets always start with 0x78 0x78 or 0x79 0x79
    if (buffer.length < 2) return false;
    if (buffer[0] === 0x78 && buffer[1] === 0x78) return false;
    if (buffer[0] === 0x79 && buffer[1] === 0x79) return false;
    // Check if first bytes are printable ASCII (IMEI digits start with 8)
    return buffer[0] >= 0x20 && buffer[0] <= 0x7e;
  }

  /**
   * Handles HQ text protocol used by ALO / similar trackers.
   * Format: *HQ,IMEI,CMD,data...#
   * Commands:
   *   HTBT          — heartbeat, reply *HQ,IMEI,HTBT#
   *   V1,status,time,lat,lng,speed,course,... — location report
   */
  private handleTextPacket(
    socket: net.Socket,
    connection: DeviceConnection,
    line: string,
  ): void {
    this.logger.log(`Text packet received: ${line}`);

    // Strip leading * and trailing #
    const stripped = line.replace(/^\*/, '').replace(/#$/, '');
    const parts = stripped.split(',');

    // Expected: HQ,IMEI,CMD,...
    if (parts.length < 3 || parts[0] !== 'HQ') {
      this.logger.warn(`Unrecognized text packet format: ${line}`);
      return;
    }

    const imei = parts[1].trim();
    if (!imei || !/^\d{15,16}$/.test(imei)) {
      this.logger.warn(`Invalid IMEI in HQ packet: ${imei}`);
      return;
    }

    const cmd = parts[2].trim();

    // Register device on first packet
    if (!connection.imei) {
      connection.imei = imei;
      this.connections.set(imei, connection);
      this.socketToImei.set(socket, imei);
      this.logger.log(`Device (HQ protocol) logged in: IMEI ${imei}`);
      this.eventEmitter.emit(GPS_DEVICE_CONNECTED, {
        imei,
        connectedAt: new Date(),
      });
    }

    switch (cmd) {
      case 'HTBT':
        // Heartbeat — acknowledge
        socket.write(`*HQ,${imei},HTBT#`);
        this.logger.log(`Heartbeat from IMEI ${imei}`);
        this.eventEmitter.emit(GPS_DEVICE_HEARTBEAT, { imei, at: new Date() });
        break;

      case 'V1':
        // Location packet: *HQ,IMEI,V1,status,time,lat,N/S,lng,E/W,speed,course,date,...#
        // parts: [HQ, IMEI, V1, status, time(HHMMSS), lat(DDMM.MMMM), N/S, lng(DDDMM.MMMM), E/W, speed, course, date(DDMMYY), ...]
        this.handleHqLocation(socket, connection, imei, parts);
        break;

      default:
        this.logger.log(`Unhandled HQ command: ${cmd} from IMEI ${imei}`);
        // Acknowledge unknown commands generically
        socket.write(`*HQ,${imei},${cmd}#`);
    }
  }

  private handleHqLocation(
    socket: net.Socket,
    _connection: DeviceConnection,
    imei: string,
    parts: string[],
  ): void {
    // Actual packet: *HQ,IMEI,V1,HHMMSS,A,lat,N/S,lng,E/W,speed,course,DDMMYY,...#
    // parts[0]=HQ, [1]=IMEI, [2]=V1, [3]=HHMMSS, [4]=A/V, [5]=lat, [6]=N/S,
    //          [7]=lng, [8]=E/W, [9]=speed, [10]=course, [11]=DDMMYY
    if (parts.length < 12) {
      this.logger.warn(`V1 location packet too short from IMEI ${imei}`);
      return;
    }

    try {
      const timeStr = parts[3]; // HHMMSS
      const fixStatus = parts[4]; // A=valid, V=invalid
      const dateStr = parts[11]; // DDMMYY

      if (fixStatus === 'V') {
        this.logger.warn(`No GPS fix (V) in V1 packet from IMEI ${imei}`);
        return;
      }

      const hh = parseInt(timeStr.slice(0, 2), 10);
      const mm = parseInt(timeStr.slice(2, 4), 10);
      const ss = parseInt(timeStr.slice(4, 6), 10);
      const dd = parseInt(dateStr.slice(0, 2), 10);
      const mo = parseInt(dateStr.slice(2, 4), 10);
      const yy = 2000 + parseInt(dateStr.slice(4, 6), 10);
      const deviceTime = new Date(Date.UTC(yy, mo - 1, dd, hh, mm, ss));

      if (isNaN(deviceTime.getTime())) {
        this.logger.warn(
          `Invalid date in V1 packet from IMEI ${imei}: time=${timeStr} date=${dateStr}`,
        );
        return;
      }

      // Convert NMEA DDMM.MMMM to decimal degrees
      const latRaw = parseFloat(parts[5]);
      const latDeg = Math.floor(latRaw / 100);
      const latMin = latRaw - latDeg * 100;
      let lat = latDeg + latMin / 60;
      if (parts[6] === 'S') lat = -lat;

      const lngRaw = parseFloat(parts[7]);
      const lngDeg = Math.floor(lngRaw / 100);
      const lngMin = lngRaw - lngDeg * 100;
      let lng = lngDeg + lngMin / 60;
      if (parts[8] === 'W') lng = -lng;

      const speed = parseFloat(parts[9]) || 0; // knots
      const course = parseFloat(parts[10]) || 0;
      const ignition = this.parseHqIgnition(parts[12]);

      if (isNaN(lat) || isNaN(lng)) {
        this.logger.warn(`Invalid coordinates in V1 packet from IMEI ${imei}`);
        return;
      }

      const telemetry: import('../../common/types/gps.type').NormalizedTelemetry =
        {
          imei,
          lat,
          lng,
          speed: Math.round(speed * 1.852), // knots → km/h
          course,
          deviceTime,
          serverTime: new Date(),
          raw: parts.join(','),
        };
      if (ignition !== undefined) {
        telemetry.ignition = ignition;
      }

      this.logger.log(
        `Location (HQ V1): IMEI ${imei}, lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}, speed=${telemetry.speed}km/h${
          ignition === undefined ? '' : `, ignition=${ignition ? 'on' : 'off'}`
        }`,
      );

      this.eventEmitter.emit(GPS_LOCATION_EVENT, telemetry);
    } catch (err) {
      this.logger.error(`Error parsing V1 location from IMEI ${imei}: ${err}`);
    }

    // Acknowledge location packet
    socket.write(`*HQ,${imei},V1#`);
  }

  private parseHqIgnition(statusHex?: string): boolean | undefined {
    const status = this.parseHqVehicleStatus(statusHex);
    if (status === undefined) return undefined;

    return Math.floor(status / 2 ** HQ_IGNITION_STATUS_BIT) % 2 === 1;
  }

  private parseHqVehicleStatus(statusHex?: string): number | undefined {
    const normalized = statusHex?.trim();
    if (!normalized || !/^[0-9a-fA-F]{8}$/.test(normalized)) {
      return undefined;
    }

    return Number.parseInt(normalized, 16);
  }

  private processPacket(
    socket: net.Socket,
    connection: DeviceConnection,
    packet: any,
  ): void {
    const protocolName = this.gt06Parser.getProtocolName(packet.protocolNumber);
    this.logger.debug(
      `Received ${protocolName} packet from ${connection.imei || 'unknown'}`,
    );

    switch (packet.protocolNumber) {
      case GT06ProtocolNumber.LOGIN:
        this.handleLoginPacket(socket, connection, packet);
        break;

      case GT06ProtocolNumber.HEARTBEAT:
        this.handleHeartbeatPacket(socket, connection, packet);
        break;

      case GT06ProtocolNumber.LOCATION:
      case GT06ProtocolNumber.LOCATION_LBS:
        this.handleLocationPacket(socket, connection, packet);
        break;

      case GT06ProtocolNumber.ALARM:
        this.handleAlarmPacket(socket, connection, packet);
        break;

      default:
        this.logger.debug(
          `Unhandled protocol: 0x${packet.protocolNumber.toString(16)}`,
        );
        this.logger.debug(`Packet data (hex): ${packet.data.toString('hex')}`);
    }
  }

  private handleLoginPacket(
    socket: net.Socket,
    connection: DeviceConnection,
    packet: any,
  ): void {
    const loginData = this.gt06Parser.parseLoginPacket(packet.data);

    if (loginData) {
      connection.imei = loginData.imei;
      this.connections.set(loginData.imei, connection);
      this.socketToImei.set(socket, loginData.imei);

      this.logger.log(`Device logged in: IMEI ${loginData.imei}`);

      this.eventEmitter.emit(GPS_DEVICE_CONNECTED, {
        imei: loginData.imei,
        connectedAt: new Date(),
      });
    }

    const ack = this.gt06Parser.buildLoginAck(packet.serialNumber);
    socket.write(ack);
    this.logger.debug(`Sent login ACK for serial ${packet.serialNumber}`);
  }

  private handleHeartbeatPacket(
    socket: net.Socket,
    connection: DeviceConnection,
    packet: any,
  ): void {
    const ack = this.gt06Parser.buildHeartbeatAck(packet.serialNumber);
    socket.write(ack);
    this.logger.debug(
      `Sent heartbeat ACK for IMEI ${connection.imei}, serial ${packet.serialNumber}`,
    );
  }

  private handleLocationPacket(
    socket: net.Socket,
    connection: DeviceConnection,
    packet: any,
  ): void {
    if (!connection.imei) {
      this.logger.warn('Received location packet before login');
      return;
    }

    const locationData = this.gt06Parser.parseLocationPacket(packet.data);

    if (locationData) {
      const telemetry = this.gt06Parser.normalizeToTelemetry(
        connection.imei,
        locationData,
        packet.data.toString('hex'),
      );

      this.logger.debug(
        `Location: IMEI ${connection.imei}, lat=${telemetry.lat}, lng=${telemetry.lng}, speed=${telemetry.speed}`,
      );

      this.eventEmitter.emit(GPS_LOCATION_EVENT, telemetry);
    }

    const ack = this.gt06Parser.buildLocationAck(packet.serialNumber);
    socket.write(ack);
  }

  private handleAlarmPacket(
    socket: net.Socket,
    connection: DeviceConnection,
    packet: any,
  ): void {
    if (!connection.imei) {
      this.logger.warn('Received alarm packet before login');
      return;
    }

    const alarmData = this.gt06Parser.parseAlarmPacket(packet.data);

    if (alarmData) {
      const telemetry = this.gt06Parser.normalizeToTelemetry(
        connection.imei,
        alarmData,
        packet.data.toString('hex'),
      );

      this.logger.log(
        `ALARM: IMEI ${connection.imei}, type=${alarmData.alarmDescription}`,
      );

      this.eventEmitter.emit(GPS_ALARM_EVENT, {
        ...telemetry,
        alarmType: alarmData.alarmType,
        alarmDescription: alarmData.alarmDescription,
      });

      this.eventEmitter.emit(GPS_LOCATION_EVENT, telemetry);
    }

    const ack = this.gt06Parser.buildLocationAck(packet.serialNumber);
    socket.write(ack);
  }

  private handleDisconnect(
    socket: net.Socket,
    _connection: DeviceConnection,
  ): void {
    const imei = this.socketToImei.get(socket);

    if (imei) {
      this.logger.log(`Device disconnected: IMEI ${imei}`);
      this.connections.delete(imei);
      this.socketToImei.delete(socket);

      this.eventEmitter.emit(GPS_DEVICE_DISCONNECTED, {
        imei,
        disconnectedAt: new Date(),
      });
    }
  }

  isDeviceOnline(imei: string): boolean {
    return this.connections.has(imei);
  }

  getConnectedDevices(): string[] {
    return Array.from(this.connections.keys());
  }

  getConnectionInfo(imei: string): { lastActivity: Date } | null {
    const connection = this.connections.get(imei);
    if (!connection) return null;

    return {
      lastActivity: connection.lastActivity,
    };
  }

  sendCommand(imei: string, command: Buffer): boolean {
    const connection = this.connections.get(imei);
    if (!connection) return false;

    try {
      connection.socket.write(command);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send command to ${imei}: ${error}`);
      return false;
    }
  }
}
