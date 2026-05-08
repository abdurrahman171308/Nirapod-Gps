import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class DeviceReportQueryDto {
  @ApiPropertyOptional({
    description: 'Device IMEI',
    example: '123456789012345',
  })
  @IsString()
  @Length(10, 20)
  imei: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
