export interface NormalizedTelemetry {
  imei: string;
  lat: number;
  lng: number;
  speed: number;
  course: number;
  deviceTime: Date;
  serverTime: Date;
  ignition?: boolean;
  satellites?: number;
  battery?: number;
  gsmSignal?: number;
  raw?: string;
}

export interface GT06Packet {
  startBytes: number;
  packetLength: number;
  protocolNumber: number;
  data: Buffer;
  serialNumber: number;
  crc: number;
  stopBytes: number;
}

export enum GT06ProtocolNumber {
  LOGIN = 0x01,
  HEARTBEAT = 0x13,
  LOCATION = 0x12,
  LOCATION_LBS = 0x17,
  ALARM = 0x16,
}

export interface GT06LoginData {
  imei: string;
}

export interface GT06LocationData {
  datetime: Date;
  satellites: number;
  lat: number;
  lng: number;
  speed: number;
  course: number;
  mcc: number;
  mnc: number;
  lac: number;
  cellId: number;
}

export interface GT06AlarmData extends GT06LocationData {
  alarmType: number;
  alarmDescription: string;
}
