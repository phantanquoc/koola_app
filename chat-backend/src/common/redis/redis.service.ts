import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
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

  async del(key: string): Promise<void> {
    await this.client.del(key);
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
