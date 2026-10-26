import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import {
  AdminAuditLog,
  AdminAuditLogDocument,
  AdminAuditAction,
  AdminAuditTargetType,
} from './schemas/admin-audit-log.schema';

/** Audit log entry + tên admin resolve lúc đọc (không denormalize). */
export type AuditLogWithActor = AdminAuditLogDocument & {
  actorName?: string;
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
    targetType?: string;
    targetId?: string;
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
    if (dto.targetType) filter.targetType = dto.targetType;
    if (dto.targetId) filter.targetId = dto.targetId;
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
    const entries = data as unknown as AuditLogWithActor[];
    const actorIds = [
      ...new Set(
        entries.map((d) => d.actorId).filter((id) => id && Types.ObjectId.isValid(id)),
      ),
    ];
    const nameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const actors = await this.userModel
        .find({ _id: { $in: actorIds } })
        .select('displayName')
        .lean();
      for (const a of actors) nameById.set(String(a._id), a.displayName);
    }
    const enriched: AuditLogWithActor[] = entries.map((d) => {
      const actorName = nameById.get(d.actorId);
      if (!actorName) return d;
      return Object.assign({}, d, { actorName }) as AuditLogWithActor;
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
