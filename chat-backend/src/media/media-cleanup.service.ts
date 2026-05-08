import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Media, MediaDocument } from './media.schema';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    @InjectModel(Media.name)
    private mediaModel: Model<MediaDocument>,
  ) {}

  /**
   * Mark orphan uploads (no associated message after 24h) as deleted.
   * Runs daily at 3:00 AM.
   */
  @Cron('0 3 * * *')
  async cleanupOrphanUploads(): Promise<void> {
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
