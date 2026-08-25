import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import * as os from 'os';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    this.client.on('error', (err) => {
      this.logger.warn('[Redis] Connection error:', err.message);
    });

    this.client.on('connect', () => {
      this.logger.log('[Redis] Connected.');
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Set a key with NX (only if not exists) and EX (expiry in seconds).
   * Returns true if the key was set (did not exist), false otherwise.
   */
  async setNXEX(key: string, value: string, seconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', seconds, 'NX');
    return result === 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Atomically get a key's value and delete it in a single operation (GETDEL,
   * Redis 6.2+). Returns the value if the key existed, null otherwise.
   * Used for single-use tokens (e.g. password-reset tickets) where a
   * get-then-del race could otherwise allow double-spend.
   */
  async getDel(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Incremental SCAN for a pattern. Replaces the blocking `KEYS` command which
   * scans the entire keyspace in one call. Safe even if the pattern matches
   * many keys — iterates in small batches via cursor. Used only for the tiny,
   * bounded `typing:<conv>:*` keyspace today.
   */
  async scanKeys(pattern: string, countHint = 100): Promise<string[]> {
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        String(countHint),
      );
      cursor = next;
      out.push(...batch);
    } while (cursor !== '0');
    return out;
  }

  /** @deprecated Use scanKeys — KEYS blocks Redis. Kept for backwards compat. */
  async keys(pattern: string): Promise<string[]> {
    return this.scanKeys(pattern);
  }

  /** Plain SET with EX TTL (no NX). */
  async setEX(key: string, value: string, seconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', seconds);
  }

  /**
   * Cron mutual-exclusion helper — thin wrapper over SET NX EX.
   * Distinct lock keys (e.g. `lock:media-cron` vs `lock:media-cleanup`)
   * prevent same-schedule crons from blocking each other.
   * Value is the pod identity so logs/debugging can attribute the holder.
   * Keep this narrow (`key, ttl → boolean`) to reserve a BullMQ upgrade path.
   */
  async tryAcquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const podId = `${os.hostname()}-${process.pid}`;
    return this.setNXEX(key, podId, ttlSeconds);
  }

  /**
   * Atomically increments a counter key and sets its TTL on first creation.
   * Uses a Lua script so the INCR + EXPIRE are executed as a single atomic op.
   * Returns the new counter value after increment.
   */
  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    const result = await this.client.eval(script, 1, key, String(ttlSeconds));
    return result as number;
  }
}
