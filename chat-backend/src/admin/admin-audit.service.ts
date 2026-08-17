import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminAuditLog,
  AdminAuditLogDocument,
  AdminAuditAction,
  AdminAuditTargetType,
} from './schemas/admin-audit-log.schema';

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);
  constructor(
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLogDocument>,
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

  async list(dto: { page?: number; limit?: number }): Promise<{
    data: AdminAuditLogDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.auditModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments({}),
    ]);
    return { data: data as AdminAuditLogDocument[], total, page, limit };
  }

  private redact(payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...payload };
    for (const k of Object.keys(out)) {
      if (/password|token|secret/i.test(k)) out[k] = '[REDACTED]';
    }
    return out;
  }
}
