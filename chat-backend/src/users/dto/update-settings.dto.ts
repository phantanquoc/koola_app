import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ISO6391_CODES } from '../../translation/dto/translate.dto';

export class UpdateSettingsDto {
  @ApiProperty({
    description: 'Whether push notifications are enabled for this user',
    required: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notificationsEnabled?: boolean;

  @ApiProperty({
    description:
      'Preferred translation target language (ISO 639-1, e.g. "vi", "en"). Default "vi".',
    required: false,
    example: 'vi',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(ISO6391_CODES, {
    message: 'preferredLanguage must be a valid ISO 639-1 language code',
  })
  preferredLanguage?: string;

  @ApiProperty({
    description:
      'Whether incoming foreign-language messages are auto-translated. Default false.',
    required: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoTranslateEnabled?: boolean;
}
