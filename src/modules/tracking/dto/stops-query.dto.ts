import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { TrackingQueryDto } from './tracking-query.dto';

export class StopsQueryDto extends TrackingQueryDto {
  @ApiPropertyOptional({
    description: 'Minimum stop duration in minutes',
    default: 5,
    minimum: 1,
    maximum: 720,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  minStopMinutes?: number;
}
