import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable } from 'rxjs';
import { User, UserDocument } from '../../users/user.schema';
import { RedisService } from '../redis/redis.service';

/** Header client tự khai — xem `docs/client-todo.md`. */
export const APP_PLATFORM_HEADER = 'x-app-platform';
export const APP_VERSION_HEADER = 'x-app-version';

/** Chỉ nhận dạng version thật, không nhận chuỗi rác do client gửi bừa. */
const VERSION_RE = /^\d{1,4}(?:\.\d{1,4}){0,3}$/;
const PLATFORMS = new Set(['ios', 'android', 'web']);

/** Ghi lại tối đa 1 lần/ngày/người/phiên bản — tránh 1 UPDATE mỗi request. */
const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Ghi nhận phiên bản client đang chạy thật.
 *
 * **Vì sao không lấy từ store**: repo này chưa có app trên App Store/Play
 * (`itunes lookup` trả 0 kết quả, Play Store 404) và không có project `ios/`.
 * Nên "fetch phiên bản mới nhất từ store" là không thể — không có nguồn nào để
 * fetch. Cách duy nhất có dữ liệu thật là **client tự khai phiên bản của nó**,
 * đúng cách Firebase Remote Config / Sentry releases làm.
 *
 * Không chặn request khi thiếu header: app cũ chưa gửi, và telemetry không được
 * làm hỏng API. Mọi lỗi ở đây bị nuốt sau khi log.
 */
@Injectable()
export class ClientVersionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ClientVersionInterceptor.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly redis: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { userId?: string };
    }>();

    const rawPlatform = req.headers[APP_PLATFORM_HEADER];
    const rawVersion = req.headers[APP_VERSION_HEADER];
    const platform = typeof rawPlatform === 'string' ? rawPlatform.toLowerCase() : '';
    const version = typeof rawVersion === 'string' ? rawVersion.trim() : '';
    const userId = req.user?.userId;

    // Không await: telemetry không được làm chậm response.
    if (userId && PLATFORMS.has(platform) && VERSION_RE.test(version)) {
      void this.record(userId, platform, version);
    }

    return next.handle();
  }

  private async record(
    userId: string,
    platform: string,
    version: string,
  ): Promise<void> {
    try {
      // Dedupe theo (user, platform, version): thiết bị mở app cả ngày chỉ ghi
      // 1 lần, nhưng đổi phiên bản là ghi ngay (key khác).
      const fresh = await this.redis.setNXEX(
        `clientver:${userId}:${platform}:${version}`,
        '1',
        DEDUPE_TTL_SECONDS,
      );
      if (!fresh) return;

      await this.userModel.updateOne(
        { _id: userId },
        {
          $set: {
            lastAppPlatform: platform,
            lastAppVersion: version,
            lastAppVersionAt: new Date(),
          },
        },
      );
    } catch (err) {
      // Telemetry hỏng không được ảnh hưởng request của người dùng.
      this.logger.warn(
        `[ClientVersion] record failed for ${userId}: ${(err as Error)?.message}`,
      );
    }
  }
}
