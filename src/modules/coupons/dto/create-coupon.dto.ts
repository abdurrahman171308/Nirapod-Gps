import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsArray,
  IsOptional,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '../../../database/schemas/coupon.schema';
import { PlanName } from '../../../database/schemas/plan.schema';

export class CreateCouponDto {
  @ApiProperty({ description: 'Coupon code (uppercase, unique)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;

  @ApiProperty({ enum: DiscountType, description: 'Discount type' })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ description: 'Discount value (% or fixed amount)' })
  @IsNumber()
  @IsPositive()
  discountValue: number;

  @ApiPropertyOptional({
    enum: PlanName,
    isArray: true,
    description: 'Applicable plans (empty = all plans)',
  })
  @IsArray()
  @IsEnum(PlanName, { each: true })
  @IsOptional()
  applicablePlans?: PlanName[];

  @ApiProperty({ description: 'Maximum number of times coupon can be used' })
  @IsNumber()
  @Min(1)
  maxUsage: number;

  @ApiProperty({ description: 'Expiry date (ISO 8601)' })
  @IsDateString()
  expiresAt: string;
}
