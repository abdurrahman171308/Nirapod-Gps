import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
    description: 'Optional coupon code',
    example: 'SAVE20',
  })
  @IsString()
  @IsOptional()
  couponCode?: string;
}
