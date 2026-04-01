import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MediaService } from '../media/media.service';

@Injectable()
export class MediaCronService {
  private readonly logger = new Logger(MediaCronService.name);

  constructor(private readonly mediaService: MediaService) {}

  @Cron('0 3 * * *') // Every day at 03:00
  async cleanupOrphanedMedia(): Promise<void> {
    this.logger.log('[MediaCron] Starting orphaned media cleanup...');

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

    const orphans = await this.mediaService.findOrphansForCleanup(cutoff);
    this.logger.log(
      `[MediaCron] Found ${orphans.length} orphaned media items to clean up.`,
    );

    let cleanedCount = 0;
    let errorCount = 0;

    for (const media of orphans) {
      try {
        // Delete from MinIO
        await this.mediaService.deleteFromMinio(media.mediaKey);
        // Delete MongoDB record
        await this.mediaService.deleteMediaRecord(media._id.toString());
        cleanedCount++;
        this.logger.debug(`[MediaCron] Cleaned up: ${media.mediaKey}`);
      } catch (err) {
        errorCount++;
        this.logger.error(
          `[MediaCron] Failed to clean up ${media.mediaKey}:`,
          err,
        );
      }
    }

    this.logger.log(
      `[MediaCron] Cleanup complete. Cleaned: ${cleanedCount}, Errors: ${errorCount}`,
    );
  }
}
