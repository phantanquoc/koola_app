import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

/**
 * Distributed typing indicator state.
 *
 * Backed by Redis (`typing:<conv>:<user>` EX 5) instead of an in-process
 * Map<Timeout>: with multiple backend instances behind a load balancer,
 * in-memory timers would only ever expire on the pod that received the
 * `typing_start` event. The shared Redis key makes typing state visible to
 * every instance and auto-expires after 5s with no timer bookkeeping — the
 * receiver-side UI already clears its indicator after a short grace period
 * when no fresh `user_typing` event arrives.
 */
@Injectable()
export class TypingService {
  /** Indicator lifetime; refreshed on every typing_start keystroke. */
  private static readonly TTL_SECONDS = 5;

  constructor(private readonly redisService: RedisService) {}

  private getTypingKey(convId: string, userId: string): string {
    return `typing:${convId}:${userId}`;
  }

  /** Refresh the typing indicator for this user in this conversation. */
  async startTyping(convId: string, userId: string): Promise<void> {
    await this.redisService.setEX(
      this.getTypingKey(convId, userId),
      '1',
      TypingService.TTL_SECONDS,
    );
  }

  /** Clear the typing indicator (message sent or user stopped typing). */
  async stopTyping(convId: string, userId: string): Promise<void> {
    await this.redisService.del(this.getTypingKey(convId, userId));
  }

  /** Snapshot of who is currently typing in a conversation (re-join catch-up). */
  async getTypingUsers(convId: string): Promise<string[]> {
    const keys = await this.redisService.scanKeys(`typing:${convId}:*`);
    return keys.map((k) => k.split(':').pop()!);
  }
}
