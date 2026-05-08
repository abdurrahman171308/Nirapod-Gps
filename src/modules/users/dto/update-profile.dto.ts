import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'OldPass@123' })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiPropertyOptional({ example: 'NewPass@123' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
