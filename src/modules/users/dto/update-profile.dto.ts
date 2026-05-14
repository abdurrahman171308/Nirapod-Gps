import { IsOptional, IsString, IsNumber, MinLength, MaxLength, IsNotEmpty, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  divisionId?: number;

  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsOptional()
  @IsString()
  division?: string;

  @ApiPropertyOptional({ example: 47 })
  @IsOptional()
  @IsNumber()
  districtId?: number;

  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  district?: string;

  @ApiPropertyOptional({ example: 584 })
  @IsOptional()
  @IsNumber()
  upazilaId?: number;

  @ApiPropertyOptional({ example: 'Mirpur' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  thana?: string;

  @ApiPropertyOptional({ example: 'Mirpur-1' })
  @IsOptional()
  @IsString()
  union?: string;

  @ApiPropertyOptional({ example: 'House 12, Road 5, Block B' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  addressLine?: string;
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
