import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'rahim_dhaka' })
  @IsString()
  declare username: string;

  @ApiProperty({ example: 'User@123456' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  declare password: string;
}
