import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Media, MediaDocument } from './media.schema';
import {
  RequestPresignedUrlDto,
  SUPPORTED_MIME_TYPES,
} from './dto/request-presigned-url.dto';
import { minioClient, BUCKET, ensureBucketExists } from './minio-client';
import { ConversationsService } from '../conversations/conversations.service';

const MAGIC_BYTES_MAP: Record<
  string,
  Array<{ bytes: number[]; mask?: number[] }>
> = {
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/gif': [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  ],
  'image/webp': [
    {
      bytes: [0x52, 0x49, 0x46, 0x46],
      mask: [
        0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ],
    },
  ],
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }],
  'application/zip': [
    { bytes: [0x50, 0x4b, 0x03, 0x04] },
    { bytes: [0x50, 0x4b, 0x05, 0x06] },
    { bytes: [0x50, 0x4b, 0x07, 0x08] },
  ],
  'audio/mpeg': [
    { bytes: [0xff, 0xfb] },
    { bytes: [0xff, 0xf3] },
    { bytes: [0xff, 0xf2] },
  ],
  'video/mp4': [
    {
      bytes: [0x00, 0x00, 0x00],
      mask: [
        0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70,
      ],
    },
  ],
  'video/quicktime': [
    {
      bytes: [0x00, 0x00, 0x00],
      mask: [
        0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x66, 0x72, 0x65, 0x65,
      ],
    },
  ],
  'video/webm': [{ bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
  'audio/ogg': [{ bytes: [0x4f, 0x67, 0x67, 0x53] }],
  'audio/wav': [
    {
      bytes: [0x52, 0x49, 0x46, 0x46],
      mask: [0xff, 0xff, 0xff, 0xff, 0x57, 0x41, 0x56, 0x45],
    },
  ],
  'application/x-rar-compressed': [
    { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  ],
  'application/msword': [
    { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { bytes: [0x50, 0x4b, 0x03, 0x04] },
  ],
  'application/vnd.ms-excel': [
    { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    { bytes: [0x50, 0x4b, 0x03, 0x04] },
  ],
};

const PRESIGNED_PUT_EXPIRY_SECONDS = 900; // 15 minutes
const PRESIGNED_GET_EXPIRY_SECONDS = 3600; // 1 hour

@Injectable()
export class MediaService implements OnModuleInit {
  constructor(
    @InjectModel(Media.name)
    private mediaModel: Model<MediaDocument>,
    private conversationsService: ConversationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await ensureBucketExists();
    } catch (err) {
      console.error('[MediaService] Failed to initialize MinIO bucket:', err);
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  validateMimeType(mimeType: string): boolean {
    return SUPPORTED_MIME_TYPES.includes(
      mimeType as (typeof SUPPORTED_MIME_TYPES)[number],
    );
  }

  validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
    const signatures = MAGIC_BYTES_MAP[mimeType];
    if (!signatures) return false;

    for (const sig of signatures) {
      const mask = sig.mask || new Array(sig.bytes.length).fill(0xff);
      let match = true;
      for (let i = 0; i < sig.bytes.length; i++) {
        if ((buffer[i] & mask[i]) !== (sig.bytes[i] & mask[i])) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  }

  // ─── Key Generation ─────────────────────────────────────────────────────────

  generateMediaKey(userId: string, filename: string): string {
    const ext = filename.split('.').pop() || '';
    const key = `uploads/${userId}/${uuidv4()}${ext ? '.' + ext : ''}`;
    return key;
  }

  generateThumbnailKey(userId: string, filename: string): string {
    const ext = filename.split('.').pop() || '';
    const base = `thumbnails/${userId}/${uuidv4()}`;
    return `${base}_thumb${ext ? '.' + ext : ''}`;
  }

  // ─── URL Generation ─────────────────────────────────────────────────────────

  async generatePresignedPutUrl(mediaKey: string): Promise<string> {
    try {
      return await minioClient.presignedPutObject(
        BUCKET,
        mediaKey,
        PRESIGNED_PUT_EXPIRY_SECONDS,
      );
    } catch (err) {
      console.error(
        '[MediaService] Failed to generate presigned PUT URL:',
        err,
      );
      throw new ServiceUnavailableException('Storage service unavailable');
    }
  }

  async generatePresignedGetUrl(mediaKey: string): Promise<string> {
    try {
      return await minioClient.presignedGetObject(
        BUCKET,
        mediaKey,
        PRESIGNED_GET_EXPIRY_SECONDS,
      );
    } catch (err) {
      console.error(
        '[MediaService] Failed to generate presigned GET URL:',
        err,
      );
      throw new ServiceUnavailableException('Storage service unavailable');
    }
  }

  // ─── Business Logic ─────────────────────────────────────────────────────────

  async requestPresignedUploadUrl(
    userId: string,
    dto: RequestPresignedUrlDto,
  ): Promise<{ uploadUrl: string; mediaKey: string; expiresAt: string }> {
    // Validate MIME type
    if (!this.validateMimeType(dto.mimeType)) {
      throw new BadRequestException('File type not supported');
    }

    // Validate size (already done by class-validator @Max but double-check)
    if (dto.size > 104857600) {
      throw new BadRequestException('File size exceeds 100MB limit');
    }

    // Generate media key
    const mediaKey = this.generateMediaKey(userId, dto.filename);

    // Save Media document to MongoDB
    const media = await this.mediaModel.create({
      mediaKey,
      uploaderId: userId,
      mimeType: dto.mimeType,
      size: dto.size,
      deleted: false,
      thumbnailKey: null,
      conversationId: dto.conversationId || null,
      messageId: null,
    });

    // Generate presigned PUT URL
    let uploadUrl: string;
    try {
      uploadUrl = await this.generatePresignedPutUrl(mediaKey);
    } catch {
      // Rollback MongoDB insert on failure
      await this.mediaModel.deleteOne({ _id: media._id });
      throw new ServiceUnavailableException('Storage service unavailable');
    }

    const expiresAt = new Date(
      Date.now() + PRESIGNED_PUT_EXPIRY_SECONDS * 1000,
    ).toISOString();

    return { uploadUrl, mediaKey, expiresAt };
  }

  async getPresignedDownloadUrl(
    userId: string,
    mediaKey: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const media = await this.mediaModel.findOne({ mediaKey });
    if (!media || media.deleted) {
      throw new NotFoundException('Media not found');
    }

    // Access control: if conversationId is set, check membership
    if (media.conversationId) {
      const conv = await this.conversationsService.findByIdOrFail(
        media.conversationId,
      );
      const isMember = conv.members.some((m) => m.userId.toString() === userId);
      if (!isMember) {
        throw new ForbiddenException(
          'You are not authorized to access this media',
        );
      }
    }

    const url = await this.generatePresignedGetUrl(mediaKey);
    const expiresAt = new Date(
      Date.now() + PRESIGNED_GET_EXPIRY_SECONDS * 1000,
    ).toISOString();

    return { url, expiresAt };
  }

  async deleteMedia(userId: string, mediaKey: string): Promise<void> {
    const media = await this.mediaModel.findOne({ mediaKey });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    if (media.uploaderId !== userId) {
      throw new ForbiddenException('Only the uploader can delete this media');
    }

    media.deleted = true;
    await media.save();
  }

  async saveThumbnail(mediaKey: string, thumbnailKey: string): Promise<void> {
    await this.mediaModel.updateOne({ mediaKey }, { thumbnailKey });
  }

  async markDeleted(mediaKey: string): Promise<void> {
    await this.mediaModel.updateOne({ mediaKey }, { deleted: true });
  }

  async deleteFromMinio(mediaKey: string): Promise<void> {
    try {
      await minioClient.removeObject(BUCKET, mediaKey);
    } catch (err) {
      console.error(
        `[MediaService] Failed to delete object ${mediaKey} from MinIO:`,
        err,
      );
      throw err;
    }
  }

  // ─── Cron helpers (exposed for MediaCronService) ────────────────────────────

  async findOrphansForCleanup(cutoffDate: Date): Promise<MediaDocument[]> {
    return this.mediaModel.find({
      deleted: true,
      createdAt: { $lt: cutoffDate },
    });
  }

  async deleteMediaRecord(mediaId: string): Promise<void> {
    await this.mediaModel.deleteOne({ _id: mediaId });
  }
}
