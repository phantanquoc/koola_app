import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CallLog,
  CallLogDocument,
  CallLogStatus,
  CallLogType,
} from './call-log.schema';
import { CallMetric, CallMetricDocument } from './call-metric.schema';
import { CallMetricSampleDto } from './dto/submit-metrics.dto';

export interface CreateCallLogData {
  sessionId: string;
  initiatorId: string;
  targetUserId: string;
  conversationId: string;
  callType: CallLogType;
  status?: CallLogStatus;
  startedAt?: Date;
}

export interface UpdateCallLogData {
  status?: CallLogStatus;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  duration?: number;
}

@Injectable()
export class CallLogsService {
  private readonly logger = new Logger(CallLogsService.name);

  constructor(
    @InjectModel(CallLog.name)
    private readonly callLogModel: Model<CallLogDocument>,
    @InjectModel(CallMetric.name)
    private readonly callMetricModel: Model<CallMetricDocument>,
  ) {}

  async createLog(data: CreateCallLogData): Promise<CallLogDocument> {
    const log = new this.callLogModel({
      sessionId: data.sessionId,
      initiatorId: data.initiatorId,
      targetUserId: data.targetUserId,
      conversationId: data.conversationId,
      callType: data.callType,
      status: data.status ?? 'missed',
      startedAt: data.startedAt ?? new Date(),
      answeredAt: null,
      endedAt: null,
      duration: 0,
    });
    await log.save();
    this.logger.log(`[CallLogs] Created log for session ${data.sessionId}`);
    return log;
  }

  async updateLog(sessionId: string, update: UpdateCallLogData): Promise<void> {
    await this.callLogModel.findOneAndUpdate({ sessionId }, { $set: update });
    this.logger.log(
      `[CallLogs] Updated log for session ${sessionId}: ${JSON.stringify(update)}`,
    );
  }

  async findBySessionId(sessionId: string): Promise<CallLogDocument | null> {
    return this.callLogModel.findOne({ sessionId }).exec();
  }

  async getCallHistory(
    userId: string,
    page: number,
    limit: number,
    conversationId?: string,
  ): Promise<{
    items: CallLogDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const orFilter = { $or: [{ initiatorId: userId }, { targetUserId: userId }] };
    const filter: Record<string, unknown> = conversationId
      ? { $and: [orFilter, { conversationId }] }
      : orFilter;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.callLogModel
        .find(filter)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.callLogModel.countDocuments(filter),
    ]);

    return { items: items as CallLogDocument[], total, page, limit };
  }

  async submitMetrics(
    sessionId: string,
    userId: string,
    samples: CallMetricSampleDto[],
  ): Promise<{ accepted: number }> {
    if (samples.length === 0) {
      return { accepted: 0 };
    }

    const log = await this.callLogModel.findOne({ sessionId }).lean();
    if (!log) {
      throw new NotFoundException(`Call session not found: ${sessionId}`);
    }

    if (log.initiatorId !== userId && log.targetUserId !== userId) {
      throw new ForbiddenException(
        'User is not a participant of this call session',
      );
    }

    const docs = samples.map((s) => ({
      sessionId,
      userId,
      timestamp: new Date(s.timestamp),
      packetsLost: s.packetsLost ?? 0,
      packetsReceived: s.packetsReceived ?? 0,
      jitterMs: s.jitterMs ?? 0,
      roundTripMs: s.roundTripMs ?? 0,
      videoResolution: s.videoResolution,
      connectionType: s.connectionType,
    }));

    await this.callMetricModel.insertMany(docs, { ordered: false });

    this.logger.log(
      `[CallMetrics] Stored ${docs.length} samples for session ${sessionId}`,
    );

    return { accepted: docs.length };
  }
}
