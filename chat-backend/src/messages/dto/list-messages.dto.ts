import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsMongoId,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListMessagesDto {
  @ApiPropertyOptional({ example: '2026-03-31T10:00:00.000Z' })
  @IsOptional()
  @ValidateIf((o) => !o.around)
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /**
   * When provided, returns a context window of messages centered on this
   * message ID (N/2 before + target + N/2 after). When `around` is present,
   * `before`, `after`, and `cursor` parameters are silently ignored (no 400).
   */
  @ApiPropertyOptional({
    description:
      'Message ID to center the context window around. When present, cursor is ignored.',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId({ message: 'around must be a valid MongoDB ObjectId' })
  around?: string;
}

/**
 * Shape of a single message as returned by GET /conversations/:id/messages
 * and the sync endpoint. Used for Swagger documentation only — actual
 * responses are plain Mongoose lean objects.
 */
export class MessageResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty()
  senderId: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: ['sending', 'sent', 'delivered', 'read'] })
  status: string;

  @ApiProperty()
  mediaUrl: string;

  @ApiProperty()
  mediaMimeType: string;

  @ApiProperty()
  mediaSize: number;

  @ApiProperty()
  deleted: boolean;

  @ApiPropertyOptional({ type: [String] })
  deletedFor: string[];

  /**
   * Per-member read tracking. Array of user IDs that have read this message.
   * Always present in responses (empty array for unread messages and legacy
   * documents that pre-date this field).
   */
  @ApiProperty({ type: [String], example: ['userId1', 'userId2'] })
  readBy: string[];

  @ApiPropertyOptional({ type: [Object] })
  reactions: { userId: string; emoji: string }[];

  @ApiPropertyOptional({ nullable: true })
  clientMessageId: string | null;

  @ApiPropertyOptional({ nullable: true })
  blurhash: string | null;

  @ApiPropertyOptional({ nullable: true })
  imageWidth: number | null;

  @ApiPropertyOptional({ nullable: true })
  imageHeight: number | null;

  @ApiPropertyOptional({ nullable: true })
  mediaDuration: number | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
