import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class LocationHistoryQueryDto {
  @ApiPropertyOptional({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Start date (ISO format)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2024-01-31T23:59:59.999Z',
    description: 'End date (ISO format)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Maximum number of points to return',
    default: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10000)
  limit?: number = 1000;

  @ApiPropertyOptional({
    example: 0,
    description: 'Number of points to skip',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number = 0;
}
