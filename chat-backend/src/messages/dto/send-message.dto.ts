import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '../message.schema';

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Audio (voice notes)
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/mp4',
  'audio/webm',
  // Video
  'video/mp4',
  'video/quicktime',
  'video/webm',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
]);

@ValidatorConstraint({ name: 'mimeType', async: false })
export class AllowedMimeTypeConstraint implements ValidatorConstraintInterface {
  validate(mimeType: string): boolean {
    if (!mimeType) return true; // optional
    return ALLOWED_MIME_TYPES.has(mimeType);
  }

  defaultMessage(args: ValidationArguments): string {
    return 'File type not supported';
  }
}

export class SendMessageDto {
  @ApiProperty({ enum: MessageType, example: MessageType.TEXT })
  @IsEnum(MessageType)
  type: MessageType;

  @ApiPropertyOptional({ example: 'Hello!' })
  @IsOptional()
  @IsString()
  @MaxLength(10000, { message: 'Message exceeds 10,000 character limit' })
  content?: string;

  @ApiPropertyOptional({ example: 'https://minio.example.com/bucket/file.jpg' })
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  @Validate(AllowedMimeTypeConstraint)
  mediaMimeType?: string;

  @ApiPropertyOptional({ example: 2048000 })
  @IsOptional()
  @Min(0)
  mediaSize?: number;

  /** Client-generated unique ID for deduplication */
  @ApiPropertyOptional({ example: 'msg_abc123' })
  @IsOptional()
  @IsString()
  clientMessageId?: string;

  /** Duration in seconds for audio/video media */
  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @Min(0)
  mediaDuration?: number;

  /** ObjectId of the source message being replied to */
  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  @IsOptional()
  @IsString()
  replyTo?: string;
}
