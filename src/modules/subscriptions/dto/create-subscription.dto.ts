import { IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, IsMongoId } from 'class-validator';
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
    description: 'Optional coupon code',
    example: 'SAVE20',
  })
  @IsString()
  @IsOptional()
  couponCode?: string;
}
