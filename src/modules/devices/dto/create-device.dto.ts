import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsNumber,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({
    example: '123456789012345',
    description: 'Device IMEI (15 digits)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{15}$/, { message: 'IMEI must be exactly 15 digits' })
  imei: string;

  @ApiProperty({ example: 'Vehicle 001', description: 'Device/Vehicle name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'ABC-123',
    description: 'License plate number',
  })
  @IsString()
  @IsOptional()
  plateNumber?: string;

  @ApiPropertyOptional({
    example: '+1234567890',
    description: 'SIM card number',
  })
  @IsString()
  @IsOptional()
  simNumber?: string;

  @ApiPropertyOptional({ example: 120, description: 'Speed limit in km/h' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(300)
  speedLimitKph?: number;

  @ApiPropertyOptional({
    example: '65f2e4d437f2918d5d437a18',
    description: 'User ID to assign this device/vehicle to',
  })
  @IsString()
  @IsOptional()
  @IsMongoId({ message: 'assignedUserId must be a valid MongoDB ObjectId' })
  assignedUserId?: string;
}
