import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Media, MediaDocument } from './media.schema';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  // Daily cron (03:00) → TTL well above expected runtime. Distinct lock key
  // from MediaCronService so the two 03:00 jobs never block each other.
  private static readonly LOCK_KEY = 'lock:media-cleanup';
  private static readonly LOCK_TTL_SECONDS = 3000;

  constructor(
    @InjectModel(Media.name)
    private mediaModel: Model<MediaDocument>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Mark orphan uploads (no associated message after 24h) as deleted.
   * Runs daily at 3:00 AM.
   */
  @Cron('0 3 * * *')
  async cleanupOrphanUploads(): Promise<void> {
    // Multi-instance guard: only one pod runs this tick (task 7.2).
    const acquired = await this.redisService.tryAcquireLock(
      MediaCleanupService.LOCK_KEY,
      MediaCleanupService.LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      this.logger.debug(
        '[MediaCleanup] Lock held by another instance — skipping this tick.',
      );
      return;
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.mediaModel.updateMany(
      {
        messageId: null,
        deleted: false,
        createdAt: { $lt: cutoff },
      },
      { $set: { deleted: true } },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Marked ${result.modifiedCount} orphan uploads as deleted`,
      );
    }
  }
}
