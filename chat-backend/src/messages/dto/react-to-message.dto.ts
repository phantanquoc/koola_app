import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const ALLOWED_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '😡'];

export class ReactToMessageDto {
  @ApiPropertyOptional({
    description:
      'Emoji to set as reaction. Pass null (or omit) to clear the existing reaction.',
    enum: ALLOWED_EMOJI,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @IsIn([...ALLOWED_EMOJI, null as unknown as string], {
    message: `emoji must be one of: ${ALLOWED_EMOJI.join(', ')} or null`,
  })
  emoji?: string | null;
}
