import { Injectable } from '@nestjs/common';
import { MediaService } from '../media/media.service';

/** Trần ký mỗi lần gọi: 1 trang admin tối đa 60 ảnh, tránh payload phình. */
export const MAX_KEYS_PER_CALL = 60;

/**
 * Presigned GET sống 60 phút; cache 50 phút để lần phân trang kế tiếp dùng lại
 * URL (URL gốc vẫn còn hạn ~10 phút khi cache hết hạn).
 */
const CACHE_TTL_MS = 50 * 60 * 1000;

/** Chỉ quét cache khi phình to — tránh O(n) mỗi request. */
const CACHE_SWEEP_THRESHOLD = 1000;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

/**
 * Ký URL cho media trong màn kiểm duyệt. `messages.mediaUrl` và
 * `stories.mediaKey` lưu MinIO object key, không phải URL — admin-web cần URL
 * đọc được nên backend ký hộ.
 *
 * Ký là HMAC cục bộ (không gọi mạng), nên rẻ; cache chủ yếu để giữ URL ổn định
 * khi admin lật trang và tránh ký lặp trong cùng một trang.
 */
@Injectable()
export class ModerationMediaService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly mediaService: MediaService) {}

  /**
   * Ký nhiều key một lượt. Key trùng được gộp; key lỗi trả `null` nhưng không
   * làm hỏng cả batch. Key vượt trần 60 trả `null` (không ký).
   */
  async presignMany(
    keys: Array<string | null | undefined>,
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    const candidates: string[] = [];

    for (const raw of keys) {
      if (typeof raw !== 'string') continue;
      const key = raw.trim();
      if (!key || result.has(key)) continue;
      result.set(key, null);
      if (candidates.length < MAX_KEYS_PER_CALL) candidates.push(key);
    }
    if (candidates.length === 0) return result;

    const now = Date.now();
    const toSign: string[] = [];
    for (const key of candidates) {
      const hit = this.cache.get(key);
      if (hit && hit.expiresAt > now) {
        result.set(key, hit.url);
        continue;
      }
      if (hit) this.cache.delete(key);
      toSign.push(key);
    }

    // Từng key lỗi độc lập: một object mồ côi không được kéo cả trang về null.
    const signed = await Promise.all(
      toSign.map(async (key): Promise<[string, string | null]> => {
        try {
          return [key, await this.mediaService.generatePresignedGetUrl(key)];
        } catch {
          return [key, null];
        }
      }),
    );

    const expiresAt = now + CACHE_TTL_MS;
    for (const [key, url] of signed) {
      result.set(key, url);
      if (url) this.cache.set(key, { url, expiresAt });
    }
    this.sweepExpired(now);
    return result;
  }

  private sweepExpired(now: number): void {
    if (this.cache.size < CACHE_SWEEP_THRESHOLD) return;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }
}
