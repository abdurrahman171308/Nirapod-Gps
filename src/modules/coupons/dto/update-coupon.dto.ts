import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsArray,
  IsOptional,
  IsPositive,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '../../../database/schemas/coupon.schema';
import { PlanName } from '../../../database/schemas/plan.schema';

export class UpdateCouponDto {
  @ApiPropertyOptional({ enum: DiscountType })
  @IsEnum(DiscountType)
  @IsOptional()
  discountType?: DiscountType;

  @ApiPropertyOptional()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  discountValue?: number;

  @ApiPropertyOptional({ enum: PlanName, isArray: true })
  @IsArray()
  @IsEnum(PlanName, { each: true })
  @IsOptional()
  applicablePlans?: PlanName[];

  @ApiPropertyOptional()
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxUsage?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
