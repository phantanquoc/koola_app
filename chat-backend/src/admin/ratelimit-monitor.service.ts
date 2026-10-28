import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

export interface RatelimitBucket {
  /** Định danh người dùng/IP nếu tách được, ngược lại là nguyên key Redis. */
  key: string;
  /**
   * Phần route của key (`Class-Handler-throttler`). Không có nó thì mọi bucket
   * của cùng một IP hiện thành các dòng giống nhau — không biết route nào bị gọi.
   */
  route: string | null;
  hits: number;
  ttlSeconds: number;
}

const TOP_DEFAULT = 20;
const TOP_CAP = 100;
/**
 * Prefix RedisThrottlerStorage phải ghi vào key. Nest mặc định băm
 * `Class-Handler-throttler-tracker` thành sha256 nên không còn dấu vết IP —
 * xem crossFileNeeds: storage cần prefix + tracker gốc để trang này có nghĩa.
 */
const THROTTLER_PREFIX = 'throttler:';
/** sha256 hex — key mặc định của Nest, không tách được tracker. */
const HASHED_KEY_RE = /^[a-f0-9]{64}$/i;

@Injectable()
export class RatelimitMonitorService {
  private readonly logger = new Logger(RatelimitMonitorService.name);

  constructor(private readonly redisService: RedisService) {}

  async top(limit = TOP_DEFAULT): Promise<RatelimitBucket[]> {
    const capped = Math.min(TOP_CAP, Math.max(1, limit));
    let scanned: { key: string; ttl: number }[];
    try {
      scanned = await this.redisService.scanKeysWithTtl(`${THROTTLER_PREFIX}*`);
    } catch (err) {
      // Trang giám sát không được làm sập admin khi Redis chập chờn.
      this.logger.warn(
        `[RatelimitMonitor] SCAN failed: ${(err as Error)?.message}`,
      );
      return [];
    }
    if (scanned.length === 0) return [];

    const values = await this.readCounters(scanned.map((s) => s.key));
    return scanned
      .map((s, i) => {
        const { tracker, route } = this.trackerView(s.key);
        return {
          key: tracker,
          route,
          hits: values[i],
          ttlSeconds: s.ttl,
        };
      })
      .sort((a, b) => b.hits - a.hits)
      .slice(0, capped);
  }

  /** Pipeline MGET để giữ số round-trip = 1; NaN/thiếu key coi như 0. */
  private async readCounters(keys: string[]): Promise<number[]> {
    try {
      const pipeline = this.redisService.getClient().pipeline();
      for (const k of keys) pipeline.get(k);
      const results = await pipeline.exec();
      return keys.map((_, i) => {
        const raw = results?.[i]?.[1];
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
      });
    } catch (err) {
      this.logger.warn(
        `[RatelimitMonitor] counter read failed: ${(err as Error)?.message}`,
      );
      return keys.map(() => 0);
    }
  }

  /**
   * Tách tracker khỏi key. Key đã băm thì không đoán — trả nguyên key để người
   * vận hành thấy đúng thứ Redis đang giữ, không bịa IP.
   *
   * Định dạng kỳ vọng của storage (`throttler:<route>-<tracker>`) nằm ở
   * crossFileNeeds — Nest mặc định băm cả key nên tracker không còn đọc được.
   */
  private trackerView(key: string): { tracker: string; route: string | null } {
    const raw = key.startsWith(THROTTLER_PREFIX)
      ? key.slice(THROTTLER_PREFIX.length)
      : key;
    // Key đã băm thì không đoán — trả nguyên key, route để null.
    if (!raw || HASHED_KEY_RE.test(raw)) return { tracker: key, route: null };
    const segments = raw.split('-');
    // Tracker là segment cuối (IP hoặc userId); route phía trước có thể có '-'.
    const tracker = segments.pop() || raw;
    const route = segments.length > 0 ? segments.join('-') : null;
    return { tracker, route };
  }
}
