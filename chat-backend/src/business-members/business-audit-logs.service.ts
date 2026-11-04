import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BusinessAuditLog,
  BusinessAuditLogDocument,
} from './schemas/business-audit-log.schema';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Injectable()
export class BusinessAuditLogsService {
  private readonly logger = new Logger(BusinessAuditLogsService.name);

  constructor(
    @InjectModel(BusinessAuditLog.name)
    private auditLogModel: Model<BusinessAuditLogDocument>,
  ) {}

  // Task 9.2: Helper function to log audit events
  async auditLog(params: {
    businessId: string;
    actorId: string;
    eventType: string;
    resourceId?: string;
    changes?: Record<string, any>;
    metadata?: Record<string, any>;
    deviceId?: string;
  }): Promise<void> {
    try {
      await this.auditLogModel.create({
        businessId: new Types.ObjectId(params.businessId),
        actorId: new Types.ObjectId(params.actorId),
        eventType: params.eventType,
        resourceId: params.resourceId,
        changes: params.changes,
        metadata: params.metadata,
        deviceId: params.deviceId,
        createdAt: new Date(),
      });

      this.logger.log(
        `[Audit] ${params.eventType} by ${params.actorId} in business ${params.businessId}`,
      );
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      this.logger.error('[Audit] Failed to log event:', error);
    }
  }

  // Task 9.9: Query audit logs with filters
  async queryLogs(
    businessId: string,
    dto: QueryAuditLogsDto,
  ): Promise<{ logs: any[]; total: number; page: number; limit: number }> {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const filter: any = {
      businessId: new Types.ObjectId(businessId),
    };

    // Date range filter
    if (dto.startDate || dto.endDate) {
      filter.createdAt = {};
      if (dto.startDate) {
        filter.createdAt.$gte = new Date(dto.startDate);
      }
      if (dto.endDate) {
        filter.createdAt.$lte = new Date(dto.endDate);
      }
    }

    // Event type filter
    if (dto.eventType) {
      filter.eventType = dto.eventType;
    }

    // Actor filter
    if (dto.actorId) {
      filter.actorId = new Types.ObjectId(dto.actorId);
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .populate('actorId', 'displayName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return {
      logs: logs.map((log: any) => ({
        id: log._id,
        actorId: log.actorId,
        eventType: log.eventType,
        resourceId: log.resourceId,
        changes: log.changes,
        metadata: log.metadata,
        deviceId: log.deviceId,
        createdAt: log.createdAt,
      })),
      total,
      page,
      limit,
    };
  }
}
