import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsMongoId,
  MaxLength,
  ValidateIf,
  ArrayMinSize,
} from 'class-validator';
import { NotificationType, NotificationTarget } from '../../../database/schemas/notification.schema';

export class SendNotificationDto {
  @ApiProperty({ example: 'Service Maintenance Alert' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: 'Scheduled maintenance on Sunday 2 AM – 4 AM. Service may be briefly unavailable.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({ enum: NotificationTarget, default: NotificationTarget.ALL })
  @IsOptional()
  @IsEnum(NotificationTarget)
  target?: NotificationTarget;

  @ApiPropertyOptional({ type: [String], description: 'Required when target is SPECIFIC' })
  @ValidateIf((o) => o.target === NotificationTarget.SPECIFIC)
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  targetUserIds?: string[];
}
