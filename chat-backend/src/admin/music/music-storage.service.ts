import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import {
  BUCKET,
  getMinioPublicClient,
  minioClient,
} from '../../media/minio-client';
import { MAX_VIDEO_BYTES } from '../../media/media-limits.constants';

/** Every catalog object lives under this prefix in the shared bucket. */
export const MUSIC_CATALOG_PREFIX = 'music-catalog/';

/** 15 minutes — matches the shared media endpoint's presigned PUT window. */
const PRESIGNED_PUT_EXPIRY_SECONDS = 900;

/** Presigned GET lifetime for playback URLs returned to the admin UI. */
export const PRESIGNED_PLAYBACK_EXPIRY_SECONDS = 3600;

const ALLOWED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
] as const;

/** Extension is derived from the client-declared MIME, never from the filename. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
};

export interface PresignedCatalogUpload {
  uploadUrl: string;
  audioKey: string;
  expiresAt: string;
}

/**
 * Storage for catalog audio.
 *
 * Deliberately does NOT go through `MediaService`: that path writes a `Media`
 * row with `messageId: null`, the exact shape `MediaCleanupService` is written
 * to mark deleted after 24h. A track's audio is never attached to a message,
 * so it must live outside that lifecycle.
 */
@Injectable()
export class MusicStorageService {
  private readonly logger = new Logger(MusicStorageService.name);

  /** Sign a PUT for a new `music-catalog/` object. Writes nothing to Mongo. */
  async presignUpload(
    mimeType: string,
    size: number,
  ): Promise<PresignedCatalogUpload> {
    if (!ALLOWED_AUDIO_MIME.includes(mimeType as never)) {
      throw new BadRequestException(
        `Định dạng không hỗ trợ. Chấp nhận: ${ALLOWED_AUDIO_MIME.join(', ')}`,
      );
    }
    if (!Number.isFinite(size) || size <= 0) {
      throw new BadRequestException('Kích thước file không hợp lệ');
    }
    if (size > MAX_VIDEO_BYTES) {
      throw new BadRequestException('File vượt quá 100MB');
    }

    const audioKey = `${MUSIC_CATALOG_PREFIX}${randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;

    let uploadUrl: string;
    try {
      uploadUrl = await getMinioPublicClient().presignedPutObject(
        BUCKET,
        audioKey,
        PRESIGNED_PUT_EXPIRY_SECONDS,
      );
    } catch (err) {
      this.logger.error('[MusicStorage] presign PUT failed', err);
      throw new ServiceUnavailableException(
        'Không ký được đường tải lên — thử lại sau',
      );
    }

    return {
      uploadUrl,
      audioKey,
      expiresAt: new Date(
        Date.now() + PRESIGNED_PUT_EXPIRY_SECONDS * 1000,
      ).toISOString(),
    };
  }

  /**
   * Object size in bytes, or null when the object does not exist.
   * Storage being unreachable is a different failure and is rethrown.
   */
  async statSize(audioKey: string): Promise<number | null> {
    try {
      const stat = await minioClient.statObject(BUCKET, audioKey);
      return stat.size;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') return null;
      this.logger.error(`[MusicStorage] statObject failed for ${audioKey}`, err);
      throw new ServiceUnavailableException(
        'Không kiểm tra được kho lưu trữ — thử lại sau',
      );
    }
  }

  /** Read the whole object into memory. Caller has already bounded the size. */
  async readObject(audioKey: string): Promise<Buffer> {
    const stream = await minioClient.getObject(BUCKET, audioKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /** Presigned GET for playback. Signed per call; never persisted. */
  async presignPlayback(audioKey: string): Promise<string> {
    return getMinioPublicClient().presignedGetObject(
      BUCKET,
      audioKey,
      PRESIGNED_PLAYBACK_EXPIRY_SECONDS,
    );
  }

  /**
   * Every object under `music-catalog/`, with its age.
   *
   * MinIO has no "unused" concept — the only way to find a file that no track
   * row points at is to list the prefix and diff against the collection. Paged
   * by the SDK's own continuation; the caller caps how many it keeps.
   */
  async listCatalogObjects(
    max = 5000,
  ): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    const out: Array<{ key: string; size: number; lastModified: Date }> = [];
    const stream = minioClient.listObjectsV2(
      BUCKET,
      MUSIC_CATALOG_PREFIX,
      true,
    );
    for await (const obj of stream) {
      if (!obj.name) continue;
      out.push({
        key: obj.name,
        size: obj.size ?? 0,
        lastModified: obj.lastModified ?? new Date(),
      });
      if (out.length >= max) break;
    }
    return out;
  }

  /**
   * Delete one catalog object. A missing object is a success — the goal state
   * is "not there", and a retried purge must not fail on its own last step.
   */
  async removeObject(audioKey: string): Promise<void> {
    try {
      await minioClient.removeObject(BUCKET, audioKey);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') return;
      this.logger.error(`[MusicStorage] removeObject failed for ${audioKey}`, err);
      throw new ServiceUnavailableException(
        'Không xoá được file trong kho — thử lại sau',
      );
    }
  }
}
