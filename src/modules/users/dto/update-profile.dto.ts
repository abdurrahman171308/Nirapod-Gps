import { IsOptional, IsString, MinLength, MaxLength, IsNotEmpty, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsString()
  @IsNotEmpty()
  declare district: string;

  @ApiPropertyOptional({ example: 'Mirpur' })
  @IsString()
  @IsNotEmpty()
  declare thana: string;

  @ApiPropertyOptional({ example: 'Mirpur-1' })
  @IsOptional()
  @IsString()
  union?: string;

  @ApiPropertyOptional({ example: 'House 12, Road 5, Block B' })
  @IsString()
  @IsNotEmpty()
  declare addressLine: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Rahim' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Hossain' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: '+8801712345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ type: UpdateAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAddressDto)
  address?: UpdateAddressDto;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'OldPass@123' })
  @IsString()
  @MinLength(6)
  declare currentPassword: string;

  @ApiPropertyOptional({ example: 'NewPass@123' })
  @IsString()
  @MinLength(6)
  declare newPassword: string;
}
