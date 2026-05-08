import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DeviceCommand,
  DeviceCommandDocument,
  DeviceCommandStatus,
} from '../../database/schemas/device-command.schema';
import { DevicesService, UserContext } from '../devices/devices.service';
import { TcpServerService } from '../gps-ingest/tcp-server.service';
import { CreateDeviceCommandDto, DeviceCommandQueryDto } from './dto';

@Injectable()
export class CommandsService {
  constructor(
    @InjectModel(DeviceCommand.name)
    private readonly commandModel: Model<DeviceCommandDocument>,
    private readonly devicesService: DevicesService,
    private readonly tcpServerService: TcpServerService,
  ) {}

  async create(imei: string, dto: CreateDeviceCommandDto, user: UserContext) {
    const device = await this.devicesService.validateDeviceAccessByImei(
      imei,
      user,
    );
    const payloadBuffer = this.buildCommandPayload(dto, imei);
    const delivered = this.tcpServerService.sendCommand(imei, payloadBuffer);

    const command = new this.commandModel({
      deviceId: device._id,
      imei,
      command: dto.command,
      payload: payloadBuffer.toString('hex'),
      createdBy: new Types.ObjectId(user.userId),
      status: delivered ? DeviceCommandStatus.SENT : DeviceCommandStatus.FAILED,
      sentAt: delivered ? new Date() : undefined,
      failureReason: delivered
        ? undefined
        : 'Device offline or socket write failed',
    });

    // Persist engine lock state regardless of delivery so it re-enforces on reconnect
    if (dto.command === 'ENGINE_CUT') {
      await this.devicesService.setEngineCut(imei, true);
    } else if (dto.command === 'ENGINE_RESUME') {
      await this.devicesService.setEngineCut(imei, false);
    }

    return command.save();
  }

  async findByDevice(
    imei: string,
    query: DeviceCommandQueryDto,
    user: UserContext,
  ) {
    await this.devicesService.validateDeviceAccessByImei(imei, user);

    const filter: any = { imei };
    if (query.status) {
      filter.status = query.status;
    }

    const limit = query.limit ?? 50;

    return this.commandModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  private buildCommandPayload(dto: CreateDeviceCommandDto, imei: string): Buffer {
    if (dto.payloadHex) {
      const normalized = dto.payloadHex.toLowerCase();
      if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
        throw new BadRequestException(
          'payloadHex must be valid even-length hexadecimal',
        );
      }
      return Buffer.from(normalized, 'hex');
    }

    switch (dto.command) {
      case 'ENGINE_CUT':
        return Buffer.from(`*HQ,${imei},S20#`, 'utf8');
      case 'ENGINE_RESUME':
        return Buffer.from(`*HQ,${imei},S21#`, 'utf8');
      case 'REBOOT':
        return Buffer.from(`*HQ,${imei},RESET#`, 'utf8');
      case 'CUSTOM':
        if (!dto.payload) {
          throw new BadRequestException(
            'payload is required when command is CUSTOM',
          );
        }
        return Buffer.from(dto.payload, 'utf8');
      default:
        throw new BadRequestException('Unsupported command');
    }
  }
}
