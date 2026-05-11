import {
  IsOptional,
  IsString,
  IsArray,
  IsMongoId,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminRenewSubscriptionDto {
  @ApiProperty({ description: 'Additional months to extend the subscription', example: 3, minimum: 1, maximum: 120 })
  @IsInt()
  @Min(1)
  @Max(120)
  durationMonths: number;

  @ApiPropertyOptional({
    description: 'Update the set of subscribed devices (replaces existing selection). Omit to keep current devices.',
    type: [String],
    example: ['664a1f2e8c1a2b3d4e5f6a7b'],
  })
  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  deviceIds?: string[];

  @ApiPropertyOptional({ description: 'Optional coupon code to apply to the renewal', example: 'RENEW10' })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional({ description: 'Admin notes for this renewal payment record' })
  @IsString()
  @IsOptional()
  notes?: string;
}
