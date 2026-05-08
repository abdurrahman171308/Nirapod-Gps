import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateDeviceCommandDto {
  @ApiProperty({
    example: 'ENGINE_CUT',
    enum: ['ENGINE_CUT', 'ENGINE_RESUME', 'REBOOT', 'CUSTOM'],
  })
  @IsString()
  @IsIn(['ENGINE_CUT', 'ENGINE_RESUME', 'REBOOT', 'CUSTOM'])
  command: 'ENGINE_CUT' | 'ENGINE_RESUME' | 'REBOOT' | 'CUSTOM';

  @ApiPropertyOptional({
    description: 'Optional plain text payload for CUSTOM command',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  payload?: string;

  @ApiPropertyOptional({
    description: 'Optional command payload in hex (without 0x)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 400)
  payloadHex?: string;
}
