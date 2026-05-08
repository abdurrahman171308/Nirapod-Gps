import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { AlertType } from '../../../common/enums/alert-type.enum';

export class CreateAlertDto {
  @ApiProperty({ example: '123456789012345' })
  @IsString()
  @IsNotEmpty()
  imei: string;

  @ApiProperty({ enum: AlertType, example: AlertType.OVERSPEED })
  @IsEnum(AlertType)
  type: AlertType;

  @ApiProperty({ example: 'Speed limit exceeded: 95 km/h' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ example: 25.123456 })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ example: 55.123456 })
  @IsNumber()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ example: 95 })
  @IsNumber()
  @IsOptional()
  speed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  meta?: Record<string, any>;
}
