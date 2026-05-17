import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentType } from '../../../database/schemas/content.schema';

export class CreateContentDto {
  @ApiProperty({ enum: ContentType, description: 'Content type: OFFER | FEATURE_NEWS | BANNER' })
  @IsEnum(ContentType)
  type: ContentType;

  @ApiProperty({ description: 'Title of the content item' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Body / detail text' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Image URL (banner image, offer thumbnail, etc.)' })
  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Start date – applicable for OFFER type (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @ApiPropertyOptional({ description: 'Expiry date – applicable for OFFER type (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Whether the content is visible in app', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
