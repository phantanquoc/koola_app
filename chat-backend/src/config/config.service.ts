import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AppConfig,
  AppConfigDocument,
  CONFIG_SINGLETON_ID,
  ForceUpdateConfig,
} from './config.schema';
import {
  AdminAuditLog,
  AdminAuditLogDocument,
} from '../admin/schemas/admin-audit-log.schema';
import { UpdateConfigDto } from './dto/update-config.dto';

/** Phần cấu hình trả ra client — không lộ _id/updatedBy nội bộ. */
export interface PublicConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  forceUpdate: ForceUpdateConfig;
  featureFlags: Record<string, boolean>;
  announcement: {
    title: string;
    body: string;
    active: boolean;
    at: Date | null;
  };
}

/**
 * action/targetType của audit cho module cấu hình. Schema audit chưa khai báo
 * hai giá trị này (file thuộc agent khác) — xem crossFileNeeds. Ghi thẳng qua
 * model nên vẫn lưu được; lọc theo enum ở trang audit sẽ bỏ sót cho tới khi
 * danh sách được mở rộng.
 */
const CONFIG_AUDIT_ACTION = 'update_config';
const CONFIG_AUDIT_TARGET = 'config';

const CACHE_TTL_MS = 30_000;

function defaults(): PublicConfig {
  return {
    maintenanceMode: false,
    maintenanceMessage: '',
    forceUpdate: {
      android: { minVersion: '', message: '' },
      ios: { minVersion: '', message: '' },
    },
    featureFlags: {},
    announcement: { title: '', body: '', active: false, at: null },
  };
}

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private cache: PublicConfig | null = null;
  private cacheExpiresAt = 0;

  /**
   * Inject model audit trực tiếp thay vì AdminAuditService: AdminModule import
   * ConfigModule thì ConfigModule import ngược lại sẽ thành vòng. Một model là
   * đủ cho nhu cầu ghi log ở đây.
   */
  constructor(
    @InjectModel(AppConfig.name)
    private readonly configModel: Model<AppConfigDocument>,
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLogDocument>,
  ) {}

  async get(): Promise<PublicConfig> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) return this.cache;

    const doc = await this.configModel.findById(CONFIG_SINGLETON_ID).lean();
    const value = doc ? this.normalize(doc) : defaults();
    this.cache = value;
    this.cacheExpiresAt = now + CACHE_TTL_MS;
    return value;
  }

  async patch(
    dto: UpdateConfigDto,
    actorId: string,
    ip: string | null = null,
  ): Promise<PublicConfig> {
    const current = await this.get();
    const next: PublicConfig = {
      maintenanceMode:
        dto.maintenanceMode !== undefined
          ? dto.maintenanceMode
          : current.maintenanceMode,
      maintenanceMessage:
        dto.maintenanceMessage !== undefined
          ? dto.maintenanceMessage
          : current.maintenanceMessage,
      forceUpdate: {
        android: {
          ...current.forceUpdate.android,
          ...(dto.forceUpdate?.android ?? {}),
        },
        ios: { ...current.forceUpdate.ios, ...(dto.forceUpdate?.ios ?? {}) },
      },
      // Merge theo từng cờ: bật/tắt một cờ không được làm rơi các cờ khác.
      featureFlags: { ...current.featureFlags, ...(dto.featureFlags ?? {}) },
      announcement: { ...current.announcement },
    };

    if (dto.announcement) {
      Object.assign(next.announcement, dto.announcement);
      // Mốc thời gian để client biết thông báo vừa đổi, không phải bản đã xem.
      next.announcement.at = new Date();
    }

    // Đọc-sửa-ghi: chỉ super admin đổi cấu hình nên hiếm khi tranh chấp.
    // ponytail: last-write-wins, chuyển sang $set từng path khi có nhiều admin.
    const saved = await this.configModel
      .findOneAndUpdate(
        { _id: CONFIG_SINGLETON_ID },
        { $set: { ...next, updatedBy: actorId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean();

    this.invalidate();
    await this.writeAudit(actorId, dto, ip);

    return saved ? this.normalize(saved) : next;
  }

  private invalidate(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }

  /** Bù default cho document cũ thiếu field (hoặc document seed tay). */
  private normalize(raw: Partial<AppConfig>): PublicConfig {
    const base = defaults();
    return {
      maintenanceMode: raw.maintenanceMode ?? base.maintenanceMode,
      maintenanceMessage: raw.maintenanceMessage ?? base.maintenanceMessage,
      forceUpdate: {
        android: {
          ...base.forceUpdate.android,
          ...(raw.forceUpdate?.android ?? {}),
        },
        ios: { ...base.forceUpdate.ios, ...(raw.forceUpdate?.ios ?? {}) },
      },
      featureFlags: { ...(raw.featureFlags ?? {}) },
      announcement: {
        ...base.announcement,
        ...(raw.announcement ?? {}),
        at: raw.announcement?.at ?? null,
      },
    };
  }

  /**
   * Ghi audit không được làm hỏng thao tác đã lưu — cấu hình đã đổi rồi, ném
   * lỗi ở đây chỉ khiến admin tưởng chưa lưu và bấm lại.
   */
  private async writeAudit(
    actorId: string,
    dto: UpdateConfigDto,
    ip: string | null,
  ): Promise<void> {
    try {
      await this.auditModel.create({
        actorId,
        action: CONFIG_AUDIT_ACTION,
        targetType: CONFIG_AUDIT_TARGET,
        targetId: CONFIG_SINGLETON_ID,
        payload: dto as unknown as Record<string, unknown>,
        ip,
      });
    } catch (err) {
      this.logger.warn(`audit log failed: ${(err as Error).message}`);
    }
  }
}
