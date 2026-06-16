import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_VIDEO_BYTES } from '../media-limits.constants';

const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/zip',
  'application/x-rar-compressed',
] as const;

export { SUPPORTED_MIME_TYPES };

export class RequestPresignedUrlDto {
  @ApiProperty({ description: 'Original filename', example: 'photo.jpg' })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'image/jpeg',
    enum: SUPPORTED_MIME_TYPES,
  })
  @IsEnum(SUPPORTED_MIME_TYPES, {
    message: `mimeType must be one of: ${SUPPORTED_MIME_TYPES.join(', ')}`,
  })
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes', example: 2048000 })
  @IsNumber()
  @Max(MAX_VIDEO_BYTES, { message: 'File size exceeds 100MB limit' })
  size: number;

  @ApiPropertyOptional({ description: 'Conversation ID for access control' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Request thumbnail upload URL too' })
  @IsOptional()
  @IsBoolean()
  generateThumbnail?: boolean;
}
