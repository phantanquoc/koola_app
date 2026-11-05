import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { escapeRegExp } from '../common/utils/escape-regexp';
import {
  OtpLog,
  OtpLogDocument,
  type OtpLogChannel,
} from './schemas/otp-log.schema';
import { PushLog, PushLogDocument } from './schemas/push-log.schema';
import type { ListOtpLogsDto, ListPushLogsDto } from './dto/list-ops-logs.dto';

export interface OtpLogInput {
  phone: string;
  channel: OtpLogChannel;
  purpose: string;
  success: boolean;
  error?: string | null;
  provider: string;
  sessionUuid?: string | null;
  ip?: string | null;
}

export interface PushLogInput {
  userId: string;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  title: string;
  body: string;
  kind: string;
}

/** Kết quả $facet — một dòng duy nhất cho cả trang lẫn số liệu tổng. */
interface OtpFacet {
  data?: OtpLogDocument[];
  stats?: Array<{ total: number; success: number }>;
}
interface PushFacet {
  data?: PushLogDocument[];
  stats?: Array<{
    total: number;
    tokenCount: number;
    successCount: number;
    failureCount: number;
  }>;
}

/**
 * Che PII kiểu maskVnPhone nhưng chỉ giữ đúng đầu/cuối theo yêu cầu vận hành:
 * 0912345678 → 091•••78. Số quá ngắn → che toàn bộ để không lộ gì.
 */
export function maskPhone(raw: string | null | undefined): string {
  if (!raw) return '•••';
  const s = raw.trim();
  if (!s) return '•••';

  let digits = s.replace(/\D/g, '');
  // +84/quốc tế về dạng nội địa để "3 số đầu" luôn là đầu số thật (091…).
  if (digits.startsWith('84') && digits.length >= 11)
    digits = `0${digits.slice(2)}`;
  if (digits.length <= 5) return '•••';
  return `${digits.slice(0, 3)}•••${digits.slice(-2)}`;
}

@Injectable()
export class OpsLogService {
  private readonly logger = new Logger(OpsLogService.name);

  constructor(
    @InjectModel(OtpLog.name)
    private readonly otpModel: Model<OtpLogDocument>,
    @InjectModel(PushLog.name)
    private readonly pushModel: Model<PushLogDocument>,
  ) {}

  /**
   * Fire-and-forget: log là quan sát, ghi hỏng không được làm rơi luồng gửi OTP.
   * Không await ở caller, và ở đây cũng nuốt mọi lỗi.
   */
  logOtp(input: OtpLogInput): void {
    void this.otpModel
      .create({
        phone: input.phone,
        channel: input.channel,
        purpose: input.purpose,
        success: input.success,
        error: input.error ?? null,
        provider: input.provider,
        sessionUuid: input.sessionUuid ?? null,
        ip: input.ip ?? null,
      })
      .catch((err: unknown) => {
        this.logger.warn(`otp log failed: ${(err as Error).message}`);
      });
  }

  logPush(input: PushLogInput): void {
    void this.pushModel.create(input).catch((err: unknown) => {
      this.logger.warn(`push log failed: ${(err as Error).message}`);
    });
  }

  async listOtp(dto: ListOtpLogsDto): Promise<{
    data: Array<Record<string, unknown>>;
    total: number;
    page: number;
    limit: number;
    stats: {
      total: number;
      success: number;
      failed: number;
      successRate: number;
    };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const filter = this.buildFilter({
      phone: dto.phone,
      success: dto.success,
      from: dto.from,
      to: dto.to,
    });

    // Một aggregate duy nhất cho cả trang + tổng + tỉ lệ — tránh 3 round-trip
    // (find/count/group) và tránh N+1 khi UI hiện số liệu kèm danh sách.
    const [facet] = await this.otpModel.aggregate<OtpFacet>([
      { $match: filter },
      {
        $facet: {
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          stats: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                success: { $sum: { $cond: ['$success', 1, 0] } },
              },
            },
          ],
        },
      },
    ]);

    const totalInRange = facet?.stats?.[0]?.total ?? 0;
    const success = facet?.stats?.[0]?.success ?? 0;

    return {
      data: (facet?.data ?? []).map((row) => ({
        ...row,
        // Kênh email giữ nguyên địa chỉ — ops cần tra tài khoản; yêu cầu chỉ
        // che SĐT.
        phone: row.channel === 'email' ? row.phone : maskPhone(row.phone),
      })),
      total: totalInRange,
      page,
      limit,
      stats: {
        total: totalInRange,
        success,
        failed: totalInRange - success,
        successRate: totalInRange > 0 ? success / totalInRange : 0,
      },
    };
  }

  async listPush(dto: ListPushLogsDto): Promise<{
    data: PushLogDocument[];
    total: number;
    page: number;
    limit: number;
    stats: {
      total: number;
      tokenCount: number;
      successCount: number;
      failureCount: number;
      deliveryRate: number;
    };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const filter = this.buildFilter({
      userId: dto.userId,
      kind: dto.kind,
      from: dto.from,
      to: dto.to,
    });

    const [facet] = await this.pushModel.aggregate<PushFacet>([
      { $match: filter },
      {
        $facet: {
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          stats: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                tokenCount: { $sum: '$tokenCount' },
                successCount: { $sum: '$successCount' },
                failureCount: { $sum: '$failureCount' },
              },
            },
          ],
        },
      },
    ]);

    const totalInRange = facet?.stats?.[0]?.total ?? 0;
    const tokenCount = facet?.stats?.[0]?.tokenCount ?? 0;
    const successCount = facet?.stats?.[0]?.successCount ?? 0;

    return {
      data: facet?.data ?? [],
      total: totalInRange,
      page,
      limit,
      stats: {
        total: totalInRange,
        tokenCount,
        successCount,
        failureCount: facet?.stats?.[0]?.failureCount ?? 0,
        // Tỉ lệ trên số token đã thử — log 0 token vẫn hiện được "vì sao trượt".
        deliveryRate: tokenCount > 0 ? successCount / tokenCount : 0,
      },
    };
  }

  private buildFilter(params: {
    phone?: string;
    success?: 'true' | 'false';
    userId?: string;
    kind?: string;
    from?: string;
    to?: string;
  }): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (params.success) filter.success = params.success === 'true';
    if (params.userId) filter.userId = params.userId;
    if (params.kind) filter.kind = params.kind;

    if (params.phone?.trim()) {
      const term = params.phone.trim();
      if (term.includes('@')) {
        filter.phone = new RegExp(escapeRegExp(term), 'i');
      } else {
        // Dữ liệu cũ lưu cả "+8490…" lẫn "090…" — khớp cả hai dạng.
        const digits = term.replace(/\D/g, '');
        const local =
          digits.startsWith('84') && digits.length >= 11
            ? `0${digits.slice(2)}`
            : digits;
        const patterns = [local]
          .filter(Boolean)
          .map((d) => new RegExp(escapeRegExp(d)));
        if (local.startsWith('0')) {
          patterns.push(new RegExp(escapeRegExp(`84${local.slice(1)}`)));
        }
        filter.phone = patterns.length === 1 ? patterns[0] : { $in: patterns };
      }
    }

    const createdAt: Record<string, Date> = {};
    if (params.from) createdAt.$gte = new Date(params.from);
    if (params.to) createdAt.$lte = new Date(params.to);
    if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

    return filter;
  }
}
