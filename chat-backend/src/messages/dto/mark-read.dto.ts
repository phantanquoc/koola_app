import { IsOptional, IsISO8601 } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkReadDto {
  /**
   * ISO-8601 timestamp. All messages in the conversation created at or before
   * this time (and not sent by the caller) will be marked as read.
   * Defaults to the current server time if omitted.
   */
  @ApiPropertyOptional({ example: '2026-04-20T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  upToTimestamp?: string;
}
