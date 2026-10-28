import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Namespace } from 'socket.io';
import { AdminAuditService } from './admin-audit.service';
import { ChatGateway } from '../gateway/chat.gateway';
import {
  BroadcastAudience,
  BroadcastLog,
  BroadcastLogDocument,
} from './schemas/broadcast-log.schema';

export interface BroadcastInput {
  title: string;
  body: string;
  /** Bỏ trống = 'all' để client cũ không phải đổi. */
  audience?: BroadcastAudience;
  /** Chỉ dùng khi audience='ids'. */
  audienceIds?: string[];
}

export interface BroadcastResult {
  message: string;
  payload: { title: string; body: string; at: string };
  recipients: number;
  audience: BroadcastAudience;
  audienceIds: string[];
  logId: string | null;
}

const HISTORY_LIMIT_CAP = 100;
const HISTORY_LIMIT_DEFAULT = 20;

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectModel(BroadcastLog.name)
    private readonly logModel: Model<BroadcastLogDocument>,
    private readonly audit: AdminAuditService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async send(
    input: BroadcastInput,
    actorId: string,
    ip?: string | null,
  ): Promise<BroadcastResult> {
    const audience: BroadcastAudience = input.audience ?? 'all';
    // Dedupe trước khi emit: trùng id sẽ không gửi 2 lần (Socket.IO dedupe room)
    // nhưng vẫn làm log khó đối soát.
    const audienceIds =
      audience === 'ids'
        ? [...new Set((input.audienceIds ?? []).map((id) => id.trim()))].filter(
            Boolean,
          )
        : [];

    const payload = {
      title: input.title,
      body: input.body,
      at: new Date().toISOString(),
    };

    const recipients = await this.deliver(audience, audienceIds, payload);

    const logId = await this.writeLog({
      title: input.title,
      body: input.body,
      audience,
      audienceIds,
      sentBy: actorId,
      recipientsOnline: recipients,
    });

    await this.audit.log({
      actorId,
      action: 'broadcast',
      targetType: 'broadcast',
      targetId: 'broadcast',
      // Không nhét cả danh sách id vào audit — hàng trăm ObjectId làm log khó đọc;
      // số lượng + log riêng là đủ để đối soát.
      payload: {
        title: input.title,
        body: input.body,
        audience,
        audienceIdCount: audienceIds.length,
        recipientsOnline: recipients,
      },
      ip: ip ?? null,
    });

    return {
      message: 'broadcast sent',
      payload,
      recipients,
      audience,
      audienceIds,
      logId,
    };
  }

  async history(dto: { page?: number; limit?: number }): Promise<{
    data: BroadcastLogDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, dto.page ?? 1);
    // Cap ở service chứ không chỉ DTO: service còn được gọi từ cron/script.
    const limit = Math.min(
      HISTORY_LIMIT_CAP,
      Math.max(1, dto.limit ?? HISTORY_LIMIT_DEFAULT),
    );
    const [data, total] = await Promise.all([
      this.logModel
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(),
    ]);
    return { data: data as BroadcastLogDocument[], total, page, limit };
  }

  /** Trả số socket khớp tại thời điểm emit; lỗi gateway không được làm mất log. */
  private async deliver(
    audience: BroadcastAudience,
    audienceIds: string[],
    payload: { title: string; body: string; at: string },
  ): Promise<number> {
    const ns = this.chatGateway.io as unknown as Namespace | undefined;
    if (!ns) return 0;

    try {
      if (audience === 'ids') {
        const rooms = audienceIds.map((id) => `user:${id}`);
        if (rooms.length === 0) return 0;
        // fetchSockets đồng bộ qua adapter Redis nên đếm được cả socket ở instance khác.
        const sockets = await ns.in(rooms).fetchSockets();
        ns.to(rooms).emit('system_broadcast', payload);
        return sockets.length;
      }

      // personal/business: chưa có room theo loại tài khoản (gateway chỉ có
      // conversation:<id> và user:<id>), nên emit toàn bộ và ghi audience vào log
      // để đối soát khi cần gửi lại đúng nhóm.
      const recipients = ns.sockets?.size ?? 0;
      ns.emit('system_broadcast', payload);
      return recipients;
    } catch (err) {
      this.logger.warn(
        `[Broadcast] emit failed (audience=${audience}): ${(err as Error)?.message}`,
      );
      return 0;
    }
  }

  private async writeLog(doc: {
    title: string;
    body: string;
    audience: BroadcastAudience;
    audienceIds: string[];
    sentBy: string;
    recipientsOnline: number;
  }): Promise<string | null> {
    try {
      const created = await this.logModel.create(doc);
      const id = (created as { _id?: { toString(): string } })?._id;
      return id ? id.toString() : null;
    } catch (err) {
      // Log lịch sử lỗi không được chặn việc đã gửi — audit vẫn ghi lại sau đó.
      this.logger.warn(
        `[Broadcast] history write failed: ${(err as Error)?.message}`,
      );
      return null;
    }
  }
}
