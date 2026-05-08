import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class DeviceCommandQueryDto {
  @ApiPropertyOptional({ enum: ['QUEUED', 'SENT', 'FAILED'] })
  @IsOptional()
  @IsIn(['QUEUED', 'SENT', 'FAILED'])
  status?: 'QUEUED' | 'SENT' | 'FAILED';

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
