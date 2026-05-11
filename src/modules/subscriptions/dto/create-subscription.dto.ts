import { IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, IsMongoId, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanName } from '../../../database/schemas/plan.schema';

export class CreateSubscriptionDto {
  @ApiProperty({
    enum: PlanName,
    description: 'Subscription plan',
    example: PlanName.MONTHLY,
  })
  @IsEnum(PlanName)
  @IsNotEmpty()
  planName: PlanName;

  @ApiPropertyOptional({
    description: 'Specific device IDs to subscribe. If omitted, all assigned devices are included.',
    type: [String],
    example: ['664a1f2e8c1a2b3d4e5f6a7b'],
  })
  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  deviceIds?: string[];

  @ApiPropertyOptional({
    description: 'Number of months to subscribe for. Defaults to 1 (monthly) or 12 (yearly) based on plan.',
    example: 3,
    minimum: 1,
    maximum: 120,
  })
  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  durationMonths?: number;

  @ApiPropertyOptional({
    description: 'Optional coupon code',
    example: 'SAVE20',
  })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional({
    description: 'Optional notes',
    example: 'Paid by bank transfer',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
