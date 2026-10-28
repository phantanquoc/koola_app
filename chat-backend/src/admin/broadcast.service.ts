import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Namespace } from 'socket.io';
import { AdminAuditService } from './admin-audit.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
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
  /** Số socket nhận được tại thời điểm emit (kênh in-app). */
  recipients: number;
  /** Số thiết bị nhận push cho người không có socket (kênh FCM). */
  pushDelivered: number;
  /**
   * Vì sao không đẩy được push. `no_recipient_list` = audience là all/personal/
   * business: danh sách người nhận tính theo socket, không biết ai đang offline
   * nên không có ai để push. Muốn người offline cũng nhận thì chọn 'ids'.
   */
  pushSkipped?: 'no_recipient_list' | 'fcm_not_configured';
  audience: BroadcastAudience;
  audienceIds: string[];
  logId: string | null;
}

const HISTORY_LIMIT_CAP = 100;
const HISTORY_LIMIT_DEFAULT = 20;

/**
 * Room theo loại tài khoản do gateway tạo lúc handshake (`account:personal` /
 * `account:business`). Trước đây audience personal/business emit cho **toàn bộ**
 * socket trong khi log ghi "gửi cho nhóm" — admin tưởng đã gửi đúng nhóm.
 */
const ACCOUNT_ROOM: Record<'personal' | 'business', string> = {
  personal: 'account:personal',
  business: 'account:business',
};

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectModel(BroadcastLog.name)
    private readonly logModel: Model<BroadcastLogDocument>,
    private readonly audit: AdminAuditService,
    private readonly chatGateway: ChatGateway,
    private readonly notifications: NotificationsService,
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

    const { sockets, rooms, pushUserIds, skipped } = await this.deliver(
      audience,
      audienceIds,
      payload,
    );

    // FCM cho người không có socket: broadcast là thông báo toàn hệ thống, nếu
    // chỉ phát qua socket thì người đang tắt app không bao giờ biết.
    const push = await this.pushOffline(pushUserIds, payload);
    const pushDelivered = push.delivered;
    const pushSkipped = skipped ?? push.skipped;

    const logId = await this.writeLog({
      title: input.title,
      body: input.body,
      audience,
      audienceIds,
      sentBy: actorId,
      recipientsOnline: sockets,
      pushDelivered,
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
        recipientsOnline: sockets,
        pushDelivered,
        rooms,
      },
      ip: ip ?? null,
    });

    return {
      message: 'broadcast sent',
      payload,
      recipients: sockets,
      pushDelivered,
      ...(pushSkipped ? { pushSkipped } : {}),
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

  /**
   * Phát in-app và trả:
   * - `sockets`: số socket nhận được (độ phủ in-app thật)
   * - `rooms`: room đã emit, để đối soát khi gửi lại
   * - `pushUserIds`: người KHÔNG có socket → cần push
   *
   * Gateway lỗi không được làm mất log.
   */
  private async deliver(
    audience: BroadcastAudience,
    audienceIds: string[],
    payload: { title: string; body: string; at: string },
  ): Promise<{
    sockets: number;
    rooms: string[];
    pushUserIds: string[];
    skipped?: 'no_recipient_list';
  }> {
    const ns = this.chatGateway.io as unknown as Namespace | undefined;
    if (!ns) return { sockets: 0, rooms: [], pushUserIds: [] };

    try {
      if (audience === 'ids') {
        const rooms = audienceIds.map((id) => `user:${id}`);
        if (rooms.length === 0) {
          return { sockets: 0, rooms: [], pushUserIds: [] };
        }
        // fetchSockets đồng bộ qua adapter Redis nên đếm được cả socket ở instance khác.
        const sockets = await ns.in(rooms).fetchSockets();
        ns.to(rooms).emit('system_broadcast', payload);

        // Người trong danh sách không có socket nào = đang offline.
        const online = new Set(
          sockets
            .map((s) => (s.data as { user?: { sub?: string } })?.user?.sub)
            .filter((id): id is string => typeof id === 'string'),
        );
        return {
          sockets: sockets.length,
          rooms,
          pushUserIds: audienceIds.filter((id) => !online.has(id)),
        };
      }

      if (audience === 'all') {
        ns.emit('system_broadcast', payload);
        const sockets = ns.sockets?.size ?? 0;
        return {
          sockets,
          rooms: ['all'],
          pushUserIds: [],
          // 'all' không có danh sách người để push — chỉ in-app.
          skipped: 'no_recipient_list',
        };
      }

      // personal/business → room theo loại tài khoản.
      const room = ACCOUNT_ROOM[audience];
      const sockets = await ns.in(room).fetchSockets();
      ns.to(room).emit('system_broadcast', payload);
      return {
        sockets: sockets.length,
        rooms: [room],
        pushUserIds: [],
        // Đếm theo socket nên không biết ai offline → không có ai để push.
        skipped: 'no_recipient_list',
      };
    } catch (err) {
      this.logger.warn(
        `[Broadcast] emit failed (audience=${audience}): ${(err as Error)?.message}`,
      );
      return { sockets: 0, rooms: [], pushUserIds: [] };
    }
  }

  /**
   * Push cho người không có socket. Lỗi FCM không làm hỏng broadcast đã phát
   * in-app — chỉ log cảnh báo và trả 0.
   */
  private async pushOffline(
    userIds: string[],
    payload: { title: string; body: string; at: string },
  ): Promise<{ delivered: number; skipped?: 'fcm_not_configured' }> {
    if (userIds.length === 0) return { delivered: 0 };
    try {
      const res = await this.notifications.sendBroadcastPush({
        recipientIds: userIds,
        title: payload.title,
        body: payload.body,
      });
      return {
        delivered: res.delivered,
        ...(res.skipped ? { skipped: res.skipped } : {}),
      };
    } catch (err) {
      this.logger.warn(
        `[Broadcast] push fallback failed: ${(err as Error)?.message}`,
      );
      return { delivered: 0 };
    }
  }

  private async writeLog(doc: {
    title: string;
    body: string;
    audience: BroadcastAudience;
    audienceIds: string[];
    sentBy: string;
    recipientsOnline: number;
    pushDelivered: number;
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
