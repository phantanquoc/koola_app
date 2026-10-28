import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import { RedisService } from '../common/redis/redis.service';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';

const MAX_USERS_PER_TICK = 200;
/** Không có admin nào bấm nút — ghi rõ nguồn gốc thay đổi trong audit. */
const SYSTEM_ACTOR = 'system';

/**
 * Tự gỡ ban hết hạn (mục #2).
 * Cron chỉ là "đồng hồ": mọi thay đổi trạng thái đi qua AdminService.unbanUser
 * để syncSellers + logic hiện có không bị nhân bản ở hai nơi.
 */
@Injectable()
export class AdminUnbanCron {
  private readonly logger = new Logger(AdminUnbanCron.name);

  private static readonly LOCK_KEY = 'cron:admin-unban';
  private static readonly LOCK_TTL_SECONDS = 10 * 60;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly adminService: AdminService,
    private readonly audit: AdminAuditService,
    private readonly redisService: RedisService,
  ) {}

  @Cron('*/15 * * * *')
  async handleUnbanTick(): Promise<void> {
    const acquired = await this.redisService.tryAcquireLock(
      AdminUnbanCron.LOCK_KEY,
      AdminUnbanCron.LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      this.logger.debug(
        '[AdminUnbanCron] Lock held by another instance — skipping this tick.',
      );
      return;
    }

    const expired = await this.userModel
      .find({ isBanned: true, bannedUntil: { $lte: new Date() } })
      .limit(MAX_USERS_PER_TICK)
      .select('_id accountType')
      .lean<Array<{ _id: Types.ObjectId; accountType?: string }>>();

    if (expired.length === 0) return;

    let ok = 0;
    let failed = 0;
    for (const u of expired) {
      try {
        await this.adminService.unbanUser(String(u._id));
        await this.audit.log({
          actorId: SYSTEM_ACTOR,
          action: 'unban_user',
          targetType: u.accountType === 'business' ? 'business' : 'user',
          targetId: String(u._id),
          payload: { reason: 'Ban expired (auto)' },
          ip: null,
        });
        ok++;
      } catch (err: unknown) {
        // Một user lỗi không được chặn phần còn lại của tick.
        failed++;
        this.logger.warn(
          `[AdminUnbanCron] Unban failed for ${String(u._id)}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `[AdminUnbanCron] Đã gỡ ban ${ok}/${expired.length} tài khoản (lỗi: ${failed})`,
    );
  }
}
