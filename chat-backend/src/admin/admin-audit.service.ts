import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

/** Audit log entry + tên resolve lúc đọc (không denormalize). */
export type AuditLogWithActor = AdminAuditLogDocument & {
  actorName?: string;
  /**
   * Tên đối tượng bị tác động — chỉ resolve cho targetType user/business vì cả
   * hai nằm chung collection User. Các target khác (message/story/product…)
   * không gộp được vào đây mà không thêm 4 model; UI fallback id rút gọn.
   */
  targetName?: string;
  /**
   * Từng đối tượng kèm tên đã resolve — dòng bulk ghi targetId = "id1,id2,…"
   * nên UI cần danh sách này để hiện tên thay vì bắt moderator đọc ObjectId.
   */
  targetItems?: { id: string; name?: string }[];
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
    /** Ô tìm kiếm chung: khớp actor (tên/email) HOẶC mã đối tượng. */
    q?: string;
    /** `createdAt:asc|desc`. Log mặc định mới nhất trước. */
    sort?: string;
  }): Promise<{
    data: AuditLogWithActor[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    // Dựng bằng $and: `$or` của q và $or của actor không thể cùng nằm ở top-level,
    // gộp sai là bộ lọc này ghi đè bộ lọc kia (bug im lặng, chỉ thấy kết quả rộng hơn).
    const and: Record<string, unknown>[] = [];
    const filter: Record<string, unknown> = {};
    if (dto.action) filter.action = dto.action;
    if (dto.targetType) filter.targetType = dto.targetType;
    if (dto.targetId) filter.targetId = dto.targetId;

    // Tra theo tên/email: người điều tra nhớ "ai làm" chứ không nhớ ObjectId.
    // Không tìm thấy admin nào khớp thì trả rỗng ngay, đừng query audit cả bảng.
    if (dto.actor?.trim()) {
      const matched = await this.matchActorIds(dto.actor);
      if (matched.length === 0) return { data: [], total: 0, page, limit };
      filter.actorId = { $in: matched };
    }

    // Dòng bulk ghi targetId = "id1,id2,id3", nên khớp chính xác không bao giờ
    // tìm ra nó khi tra theo một hồ sơ. `search` khớp một phần để bắt được cả
    // trường hợp đó lẫn id đơn.
    if (dto.search?.trim()) {
      filter.targetId = new RegExp(escapeRegExp(dto.search.trim()), 'i');
    }

    // Ô tìm kiếm chung: một ô cho hai thứ người ta thật sự gõ vào (tên admin
    // hoặc mẩu id). Không tìm được admin nào khớp thì vẫn thử khớp id — gõ một
    // ObjectId vào ô này phải ra kết quả.
    if (dto.q?.trim()) {
      const q = dto.q.trim();
      const actorIds = await this.matchActorIds(q);
      const or: Record<string, unknown>[] = [
        { targetId: new RegExp(escapeRegExp(q), 'i') },
      ];
      if (actorIds.length > 0) or.push({ actorId: { $in: actorIds } });
      and.push({ $or: or });
    }

    // from/to tính cả biên: from <= createdAt <= to. Chỉ dựng $gte/$lte khi có
    // giá trị — truyền undefined vào $gte làm Mongo bỏ qua toàn bộ điều kiện.
    const createdAt: Record<string, Date> = {};
    if (dto.from) createdAt.$gte = new Date(dto.from);
    if (dto.to) createdAt.$lte = new Date(dto.to);
    if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

    const query = and.length > 0 ? { ...filter, $and: and } : filter;

    // Log mặc định mới nhất trước; cho phép đảo để đọc một sự cố từ đầu.
    // Whitelist: chỉ createdAt sort được — audit log không có nghĩa "xếp theo tên".
    const sort: Record<string, 1 | -1> = dto.sort === 'createdAt:asc'
      ? { createdAt: 1 }
      : { createdAt: -1 };

    const [data, total] = await Promise.all([
      this.auditModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments(query),
    ]);

    return {
      data: await this.enrich(data as unknown as AuditLogWithActor[]),
      total,
      page,
      limit,
    };
  }

  /** Tên/email → danh sách actorId khớp. Dùng chung cho `actor` và `q`. */
  private async matchActorIds(term: string): Promise<string[]> {
    const regex = new RegExp(escapeRegExp(term.trim()), 'i');
    const matched = await this.userModel
      .find({ $or: [{ displayName: regex }, { email: regex }] })
      .select('_id')
      .limit(50)
      .lean();
    return matched.map((u) => String(u._id));
  }

  /**
   * Một dòng audit theo id — cho route chi tiết share được (/audit-logs/:id).
   * Không có endpoint này thì deep-link phải gọi list rồi lọc ở client, sai
   * ngay khi log rơi ra ngoài trang đầu.
   */
  async findOne(id: string): Promise<AuditLogWithActor> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Audit log not found');
    }
    const entry = await this.auditModel.findById(id).lean();
    if (!entry) throw new NotFoundException('Audit log not found');
    const [enriched] = await this.enrich([entry as unknown as AuditLogWithActor]);
    return enriched;
  }

  /**
   * Gắn tên admin + tên đối tượng lúc đọc: log cũ (chỉ có actorId) cũng hiện
   * tên, không phải backfill, không đổi schema. Một query cho cả trang, không
   * phải N+1. user và business chung collection User nên một lượt find phủ cả
   * actor lẫn target.
   */
  private async enrich(entries: AuditLogWithActor[]): Promise<AuditLogWithActor[]> {
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
    return entries.map((d) => {
      const out = Object.assign({}, d) as AuditLogWithActor;
      const actorName = nameById.get(d.actorId);
      if (actorName) out.actorName = actorName;
      if (d.targetType === 'user' || d.targetType === 'business') {
        const ids = String(d.targetId).split(',').filter(Boolean);
        const items = ids.map((id) => ({ id, name: nameById.get(id) }));
        if (items.some((it) => it.name)) out.targetItems = items;
        const names = items.map((it) => it.name).filter(Boolean) as string[];
        if (names.length > 0) {
          // Dòng bulk: "A, B, C (+2)" để không nở hàng dài hàng trăm ký tự.
          out.targetName = names.length > 3
            ? `${names.slice(0, 3).join(', ')} (+${names.length - 3})`
            : names.join(', ');
        }
      }
      return out;
    });
  }

  private redact(payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...payload };
    for (const k of Object.keys(out)) {
      if (/password|token|secret/i.test(k)) out[k] = '[REDACTED]';
    }
    return out;
  }
}
