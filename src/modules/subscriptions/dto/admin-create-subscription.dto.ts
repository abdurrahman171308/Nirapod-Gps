import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsMongoId,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanName } from '../../../database/schemas/plan.schema';

export class AdminCreateSubscriptionDto {
  @ApiProperty({ description: 'Target user ID', example: '664a0e1d7b1a2b3c4d5e6f7a' })
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: PlanName, description: 'Subscription plan', example: PlanName.MONTHLY })
  @IsEnum(PlanName)
  @IsNotEmpty()
  planName: PlanName;

  @ApiProperty({
    description: 'Device IDs to include in this subscription',
    type: [String],
    example: ['664a1f2e8c1a2b3d4e5f6a7b', '664a1f2e8c1a2b3d4e5f6a7c'],
  })
  @IsArray()
  @IsMongoId({ each: true })
  @IsNotEmpty()
  deviceIds: string[];

  @ApiProperty({ description: 'Subscription duration in months', example: 1, minimum: 1, maximum: 120 })
  @IsInt()
  @Min(1)
  @Max(120)
  durationMonths: number;

  @ApiPropertyOptional({ description: 'Optional coupon code', example: 'SAVE20' })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional({ description: 'Admin notes for this payment record', example: 'Paid by bank transfer' })
  @IsString()
  @IsOptional()
  notes?: string;
}
