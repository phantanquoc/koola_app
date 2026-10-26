import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import { escapeRegExp } from '../common/utils/escape-regexp';
import {
  AdminAuditLog,
  AdminAuditLogDocument,
  AdminAuditAction,
  AdminAuditTargetType,
} from './schemas/admin-audit-log.schema';

/** Audit log entry + tên admin resolve lúc đọc (không denormalize). */
export type AuditLogWithActor = AdminAuditLogDocument & {
  actorName?: string;
  /**
   * Tên đối tượng bị tác động — chỉ resolve cho targetType user/business vì cả
   * hai nằm chung collection User. Các target khác (message/story/product…)
   * không gộp được vào đây mà không thêm 4 model; UI fallback id rút gọn.
   */
  targetName?: string;
};

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);
  constructor(
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLogDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async log(params: {
    actorId: string;
    action: AdminAuditAction;
    targetType: AdminAuditTargetType;
    targetId: string;
    payload?: Record<string, unknown> | null;
    ip?: string | null;
  }): Promise<void> {
    try {
      const redacted = params.payload ? this.redact(params.payload) : null;
      await this.auditModel.create({
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        payload: redacted,
        ip: params.ip ?? null,
      });
    } catch (err) {
      this.logger.warn(`audit log failed: ${(err as Error).message}`);
    }
  }

  async list(dto: {
    page?: number;
    limit?: number;
    action?: string;
    /** Tên hoặc email admin — resolve sang actorId trước khi query. */
    actor?: string;
    targetType?: string;
    targetId?: string;
    from?: string;
    to?: string;
    search?: string;
  }): Promise<{
    data: AuditLogWithActor[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.action) filter.action = dto.action;
    if (dto.targetType) filter.targetType = dto.targetType;
    if (dto.targetId) filter.targetId = dto.targetId;

    // Tra theo tên/email: người điều tra nhớ "ai làm" chứ không nhớ ObjectId.
    // Không tìm thấy admin nào khớp thì trả rỗng ngay, đừng query audit cả bảng.
    if (dto.actor?.trim()) {
      const regex = new RegExp(escapeRegExp(dto.actor.trim()), 'i');
      const matched = await this.userModel
        .find({ $or: [{ displayName: regex }, { email: regex }] })
        .select('_id')
        .limit(50)
        .lean();
      if (matched.length === 0) return { data: [], total: 0, page, limit };
      filter.actorId = { $in: matched.map((u) => String(u._id)) };
    }

    // Dòng bulk ghi targetId = "id1,id2,id3", nên khớp chính xác không bao giờ
    // tìm ra nó khi tra theo một hồ sơ. `search` khớp một phần để bắt được cả
    // trường hợp đó lẫn id đơn.
    if (dto.search?.trim()) {
      filter.targetId = new RegExp(escapeRegExp(dto.search.trim()), 'i');
    }

    // from/to tính cả biên: from <= createdAt <= to. Chỉ dựng $gte/$lte khi có
    // giá trị — truyền undefined vào $gte làm Mongo bỏ qua toàn bộ điều kiện.
    const createdAt: Record<string, Date> = {};
    if (dto.from) createdAt.$gte = new Date(dto.from);
    if (dto.to) createdAt.$lte = new Date(dto.to);
    if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

    const [data, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    // Resolve tên admin lúc đọc: log cũ (chỉ có actorId) cũng hiện tên, không
    // phải backfill, không đổi schema. 1 query cho cả trang, không phải N+1.
    // Gộp luôn targetName vào cùng query: user và business đều nằm ở collection
    // User, nên một lượt find phủ cả hai — điều tra đọc được tên thay vì ObjectId.
    const entries = data as unknown as AuditLogWithActor[];
    const resolveIds = new Set<string>();
    for (const d of entries) {
      if (d.actorId && Types.ObjectId.isValid(d.actorId)) resolveIds.add(d.actorId);
      if (d.targetType === 'user' || d.targetType === 'business') {
        for (const id of String(d.targetId).split(',')) {
          if (Types.ObjectId.isValid(id)) resolveIds.add(id);
        }
      }
    }
    const nameById = new Map<string, string>();
    if (resolveIds.size > 0) {
      const people = await this.userModel
        .find({ _id: { $in: [...resolveIds] } })
        .select('displayName')
        .lean();
      for (const p of people) nameById.set(String(p._id), p.displayName);
    }
    const enriched: AuditLogWithActor[] = entries.map((d) => {
      const out = Object.assign({}, d) as AuditLogWithActor;
      const actorName = nameById.get(d.actorId);
      if (actorName) out.actorName = actorName;
      if (d.targetType === 'user' || d.targetType === 'business') {
        const ids = String(d.targetId).split(',').filter(Boolean);
        const names = ids.map((id) => nameById.get(id)).filter(Boolean) as string[];
        if (names.length > 0) {
          // Dòng bulk: "A, B, C (+2)" để không nở hàng dài hàng trăm ký tự.
          out.targetName = names.length > 3
            ? `${names.slice(0, 3).join(', ')} (+${names.length - 3})`
            : names.join(', ');
        }
      }
      return out;
    });

    return { data: enriched, total, page, limit };
  }

  private redact(payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...payload };
    for (const k of Object.keys(out)) {
      if (/password|token|secret/i.test(k)) out[k] = '[REDACTED]';
    }
    return out;
  }
}
