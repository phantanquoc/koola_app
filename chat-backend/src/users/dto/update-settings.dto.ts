import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({
    description: 'Whether push notifications are enabled for this user',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
