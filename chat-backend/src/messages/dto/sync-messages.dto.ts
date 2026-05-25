import {
  IsOptional,
  IsDateString,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SyncMessagesDto {
  @ApiPropertyOptional({
    description:
      'ISO8601 timestamp — return messages whose updatedAt is after this time. ' +
      'Includes tombstones (deleted: true) and per-user deletions so clients can converge local state.',
    example: '2026-03-31T10:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiPropertyOptional({
    description: 'Cursor for pagination — message _id to start after',
    example: '65f1a2b3c4d5e6f7a8b9c0d1',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Max messages per page', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 100;
}
