import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddressDto {
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

  @ApiProperty({ example: 'Dhaka' })
  @IsString()
  @IsNotEmpty()
  declare district: string;

  @ApiPropertyOptional({ example: 584 })
  @IsOptional()
  @IsNumber()
  upazilaId?: number;

  @ApiProperty({ example: 'Mirpur' })
  @IsString()
  @IsNotEmpty()
  declare thana: string;

  @ApiPropertyOptional({ example: 'Mirpur-1' })
  @IsOptional()
  @IsString()
  union?: string;

  @ApiProperty({ example: 'House 12, Road 5, Block B' })
  @IsString()
  @IsNotEmpty()
  declare addressLine: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'user@gps-tracker.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  declare email: string;

  @ApiProperty({ example: 'rahim_dhaka' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Username may only contain lowercase letters, numbers, and underscores',
  })
  declare username: string;

  @ApiProperty({ example: 'User@123456' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  declare password: string;

  @ApiPropertyOptional({ example: 'Rahim' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Hossain' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ example: '+8801712345678' })
  @IsString()
  @IsNotEmpty()
  declare phone: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  declare address: AddressDto;
}
