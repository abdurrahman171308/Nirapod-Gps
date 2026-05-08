import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DeviceReportQueryDto } from './device-report-query.dto';

export class IdleTimeReportQueryDto extends DeviceReportQueryDto {
  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 720 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  idleThresholdMinutes?: number;
}
