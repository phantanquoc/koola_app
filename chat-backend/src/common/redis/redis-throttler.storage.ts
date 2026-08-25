import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

/**
 * Structural mirror of @nestjs/throttler's ThrottlerStorageRecord — that
 * interface is not exported from the package's public entrypoint, so we type
 * the return inline. The ThrottlerStorage interface check below guarantees
 * the shape stays compatible with what ThrottlerGuard consumes.
 */
interface StorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}
import { RedisService } from './redis.service';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<StorageRecord> {
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));
    const totalHits = await this.redisService.incrementWithExpiry(
      key,
      ttlSeconds,
    );
    const isBlocked = totalHits > limit;
    const bdSeconds = Math.max(
      1,
      Math.ceil((blockDuration || ttl) / 1000),
    );
    return {
      totalHits,
      // ThrottlerGuard sets the Reset header to this value (seconds).
      timeToExpire: ttlSeconds,
      isBlocked,
      timeToBlockExpire: isBlocked ? bdSeconds : 0,
    };
  }
}
