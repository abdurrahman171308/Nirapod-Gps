import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AssignGeofenceDeviceDto {
  @ApiProperty({ example: '123456789012345' })
  @IsString()
  @Length(10, 20)
  imei: string;
}
