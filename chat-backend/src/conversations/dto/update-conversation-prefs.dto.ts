import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const MUTE_DURATIONS = ['1h', '8h', '24h', 'forever', 'off'] as const;
export type MuteDuration = (typeof MUTE_DURATIONS)[number];

/**
 * Private per-user conversation prefs. At least one field must be present —
 * enforced in ConversationsService.updatePrefs (400 when both are absent).
 */
export class UpdateConversationPrefsDto {
  @ApiPropertyOptional({ example: true, description: 'Pin (true) or unpin (false)' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({
    enum: MUTE_DURATIONS,
    example: '8h',
    description: 'Mute push notifications for a duration, forever, or turn off',
  })
  @IsOptional()
  @IsIn(MUTE_DURATIONS as unknown as string[])
  muteDuration?: MuteDuration;
}
