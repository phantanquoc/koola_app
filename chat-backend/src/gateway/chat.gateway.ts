import { Logger, UseGuards } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { WsAuthGuard } from './guards/ws-auth.guard';
import { socketCorsOrigin } from '../common/cors';
import { UsersService } from '../users/users.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MembershipService } from '../conversations/services/membership.service';
import { MessagesService } from '../messages/messages.service';
import { TypingService } from '../messages/typing.service';
import { SendMessageDto } from '../messages/dto/send-message.dto';
import { MessageType } from '../messages/message.schema';

const HEARTBEAT_TIMEOUT_MS = 30_000; // 30 seconds

interface AuthSocketData {
  user?: {
    sub: string;
    phone: string;
    actorId?: string;
    accountType?: 'personal' | 'business';
  };
  heartbeatTimer?: NodeJS.Timeout;
}

type AuthSocket = Socket & { data: AuthSocketData };

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: socketCorsOrigin(), credentials: true },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  io: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly conversationsService: ConversationsService,
    private readonly membershipService: MembershipService,
    private readonly messagesService: MessagesService,
    private readonly typingService: TypingService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(): void {
    this.logger.log(
      '[ChatGateway] WebSocket Gateway initialized on /chat namespace',
    );

    // Wire TypingService auto-stop callback → broadcast user_typing stop
    this.typingService.setTypingStopCallback(
      (convId: string, userId: string) => {
        this.io.to(`conversation:${convId}`).emit('user_typing', {
          conversationId: convId,
          userId,
          isTyping: false,
        });
      },
    );

    // Wire blurhash callback → broadcast message_updated with blurhash
    this.messagesService.setBlurhashCallback(
      (
        messageId: string,
        conversationId: string,
        blurhash: string,
        width: number,
        height: number,
      ) => {
        this.io.to(`conversation:${conversationId}`).emit('message_updated', {
          messageId,
          conversationId,
          blurhash,
          imageWidth: width,
          imageHeight: height,
        });
      },
    );

    // Wire new-message emit callback → broadcast new_message for story-reply DMs
    this.messagesService.setNewMessageEmitCallback(
      (conversationId, payload) => {
        this.io
          .to(`conversation:${conversationId}`)
          .emit('new_message', { message: payload.message });
      },
    );

    // Wire pin/unpin emit callbacks → broadcast to conversation room
    this.conversationsService.setPinEmitCallback((conversationId, payload) => {
      this.io
        .to(`conversation:${conversationId}`)
        .emit('message_pinned', { conversationId, ...payload });
    });
    this.conversationsService.setUnpinEmitCallback(
      (conversationId, payload) => {
        this.io
          .to(`conversation:${conversationId}`)
          .emit('message_unpinned', { conversationId, ...payload });
      },
    );

    // Wire membership revocation → force-evict sockets from the conversation room.
    // socketsLeave is adapter-aware, so this reaches sockets held by other instances.
    this.conversationsService.setMembershipRevokedCallback(
      (conversationId, userIds) => {
        for (const userId of userIds) {
          this.io
            .in(`user:${userId}`)
            .socketsLeave(`conversation:${conversationId}`);
          this.io
            .to(`user:${userId}`)
            .emit('conversation_access_revoked', { conversationId });
        }
        this.logger.debug(
          `[ChatGateway] Evicted ${userIds.length} user(s) from conversation:${conversationId}`,
        );
      },
    );
  }

  // ─── Connection ────────────────────────────────────────────────────────────────

  async handleConnection(client: AuthSocket): Promise<void> {
    const token = client.handshake.query.token as string | undefined;

    if (!token) {
      client.disconnect(true);
      return;
    }

    let payload: {
      sub: string;
      phone: string;
      act?: string;
      accountType?: string;
    };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      client.disconnect(true);
      return;
    }

    const userId = payload.sub;
    (client.data as AuthSocketData).user = {
      sub: payload.sub,
      phone: payload.phone,
      actorId: payload.act ?? payload.sub,
      accountType:
        (payload.accountType as 'personal' | 'business') ?? 'personal',
    };

    this.logger.log(
      `[ChatGateway] Client connected: ${client.id} (user: ${userId})`,
    );

    // Mark user online
    await this.usersService.updateOnlineStatus(userId, true);

    // Join personal room
    await client.join(`user:${userId}`);

    // Start heartbeat timeout
    this.resetHeartbeat(client);

    // Broadcast presence to all shared conversations
    await this.broadcastPresence(userId, true);
  }

  async handleDisconnect(client: AuthSocket): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub;
    if (!userId) return;

    this.logger.log(
      `[ChatGateway] Client disconnected: ${client.id} (user: ${userId})`,
    );

    // Clear heartbeat timer
    const timer = (client.data as AuthSocketData).heartbeatTimer;
    if (timer) {
      clearTimeout(timer);
    }

    // Mark offline
    await this.usersService.updateOnlineStatus(userId, false);

    // Broadcast presence
    await this.broadcastPresence(userId, false);
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────────────

  private resetHeartbeat(client: AuthSocket): void {
    const timer = (client.data as AuthSocketData).heartbeatTimer;
    if (timer) {
      clearTimeout(timer);
    }
    const timeout = setTimeout(() => {
      this.logger.warn(
        `[ChatGateway] Heartbeat timeout for client ${client.id} (user: ${(client.data as AuthSocketData).user?.sub})`,
      );
      // Forcing the client off the wire fires Socket.IO's normal disconnect
      // event, which calls handleDisconnect once. Calling handleDisconnect
      // here too would broadcast presence twice.
      client.disconnect(true);
    }, HEARTBEAT_TIMEOUT_MS);
    (client.data as AuthSocketData).heartbeatTimer = timeout;
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthSocket): {
    event: string;
    data: Record<string, unknown>;
  } {
    const userId = (client.data as AuthSocketData).user?.sub;
    if (userId) {
      // Update lastSeen without changing online status
      this.usersService.updateLastSeen(userId).catch((err) => {
        this.logger.warn(
          `[ChatGateway] Failed to update lastSeen for ${userId}: ${err.message}`,
        );
      });
    }
    this.resetHeartbeat(client);
    return { event: 'pong', data: {} };
  }

  // ─── Conversation Rooms ───────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @MessageBody('conversationId') conversationId: string,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';

    try {
      const isMember = await this.membershipService.isMember(
        userId,
        conversationId,
      );
      if (!isMember) {
        client.emit('error', {
          code: 403,
          message: 'Not a member of this conversation',
        });
        return;
      }

      await client.join(`conversation:${conversationId}`);
      client.emit('joined', { conversationId });
      this.logger.debug(
        `[ChatGateway] User ${userId} joined conversation ${conversationId}`,
      );
    } catch {
      client.emit('error', { code: 404, message: 'Conversation not found' });
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @MessageBody('conversationId') conversationId: string,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    await client.leave(`conversation:${conversationId}`);
    this.logger.debug(
      `[ChatGateway] User ${(client.data as AuthSocketData).user?.sub} left conversation ${conversationId}`,
    );
  }

  // ─── Send Message ────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody()
    payload: {
      conversationId: string;
      content?: string;
      type?: MessageType;
      clientMessageId?: string;
    },
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    const { conversationId, clientMessageId } = payload;

    // Check dedup if clientMessageId provided
    if (clientMessageId) {
      const dedup = await this.messagesService.findByClientMessageId(
        conversationId,
        clientMessageId,
      );
      if (dedup) {
        client.emit('message_ack', {
          messageId: dedup._id.toString(),
          status: dedup.status,
          ...dedup.toObject(),
        });
        return;
      }
    }

    const dto: SendMessageDto = {
      type: payload.type ?? MessageType.TEXT,
      content: payload.content,
      clientMessageId,
    };

    try {
      const result = await this.messagesService.sendMessage(
        conversationId,
        userId,
        dto,
      );

      // Send ack to sender — pass typed object to avoid unsafe spread
      const ackPayload = result.message.toObject() as Record<string, unknown>;
      client.emit('message_ack', {
        ...ackPayload,
        messageId: result.message._id.toString(),
        status: result.message.status,
      });

      // Broadcast to conversation room (excluding sender)
      this.io
        .to(`conversation:${conversationId}`)
        .except(client.id)
        .emit('new_message', {
          message: ackPayload,
        });

      // Fire-and-forget push notifications
      const sender = await this.usersService.findById(userId);
      this.messagesService
        .triggerPushNotifications(
          result.message,
          result.conversationId,
          result.senderId,
          sender?.displayName || 'Someone',
        )
        .catch((err) => {
          console.error('[ChatGateway] triggerPushNotifications error:', err);
        });
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      const status = error?.status ?? 500;
      client.emit('error', {
        code: status,
        message: error?.message ?? 'Send failed',
      });
    }
  }

  // ─── Typing ──────────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @MessageBody('conversationId') conversationId: string,
    @ConnectedSocket() client: AuthSocket,
  ): void {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    this.typingService.startTyping(conversationId, userId);
    this.io.to(`conversation:${conversationId}`).emit('user_typing', {
      conversationId,
      userId,
      isTyping: true,
    });
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @MessageBody('conversationId') conversationId: string,
    @ConnectedSocket() client: AuthSocket,
  ): void {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    this.typingService.stopTyping(conversationId, userId);
    this.io.to(`conversation:${conversationId}`).emit('user_typing', {
      conversationId,
      userId,
      isTyping: false,
    });
  }

  // ─── Reactions ────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('react_message')
  async handleReactMessage(
    @MessageBody()
    payload: {
      conversationId: string;
      messageId: string;
      emoji: string | null;
    },
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    try {
      const result = await this.messagesService.setReaction(
        payload.conversationId,
        payload.messageId,
        userId,
        payload.emoji,
      );
      this.io
        .to(`conversation:${payload.conversationId}`)
        .emit('message_reaction', {
          messageId: payload.messageId,
          conversationId: payload.conversationId,
          userId,
          emoji: result.emoji,
          action: result.action,
        });
    } catch (err) {
      client.emit('error', { code: 400, message: (err as Error).message });
    }
  }

  // ─── Pin ──────────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('pin_message')
  async handlePinMessage(
    @MessageBody() payload: { conversationId: string; messageId: string },
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    try {
      await this.conversationsService.pinMessage(
        payload.conversationId,
        payload.messageId,
        userId,
      );
    } catch (err) {
      client.emit('error', { code: 400, message: (err as Error).message });
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('unpin_message')
  async handleUnpinMessage(
    @MessageBody() payload: { conversationId: string; messageId: string },
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    try {
      await this.conversationsService.unpinMessage(
        payload.conversationId,
        payload.messageId,
        userId,
      );
    } catch (err) {
      client.emit('error', { code: 400, message: (err as Error).message });
    }
  }

  // ─── Mark Read ──────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @MessageBody() payload: { conversationId: string; messageId: string },
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    const { messageId } = payload;

    try {
      // Get message to find sender and conversationId
      const messageDoc = await this.messagesService.findById(messageId);
      if (!messageDoc) {
        client.emit('error', { code: 404, message: 'Message not found' });
        return;
      }

      await this.messagesService.markAsRead(messageId, userId);

      // Fetch updated readBy array after the write
      const updatedMsg = await this.messagesService.findById(messageId);
      const readBy: string[] = (updatedMsg as any)?.readBy ?? [userId];
      const conversationId: string =
        payload.conversationId || (messageDoc as any).conversationId;
      const readAt = new Date();

      // Emit to conversation room so all members receive the read receipt
      this.io.to(`conversation:${conversationId}`).emit('message_read', {
        messageId,
        conversationId,
        readBy,
        readAt,
      });
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      client.emit('error', {
        code: error?.status ?? 500,
        message: error?.message ?? 'Mark read failed',
      });
    }
  }

  // ─── Presence Update ──────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('presence_update')
  async handlePresenceUpdate(
    @MessageBody() payload: { status: 'online' | 'away' },
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = (client.data as AuthSocketData).user?.sub ?? '';
    const isOnline = payload.status === 'online';

    await this.usersService.updateOnlineStatus(userId, isOnline);

    // Broadcast to all shared conversations
    const convIds =
      await this.conversationsService.getSharedConversationIds(userId);
    for (const convId of convIds) {
      this.io.to(`conversation:${convId}`).emit('presence_update', {
        userId,
        isOnline,
        lastSeen: new Date().toISOString(),
      });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async broadcastPresence(
    userId: string,
    isOnline: boolean,
  ): Promise<void> {
    try {
      const convIds =
        await this.conversationsService.getSharedConversationIds(userId);
      for (const convId of convIds) {
        this.io.to(`conversation:${convId}`).emit('presence_update', {
          userId,
          isOnline,
          lastSeen: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.logger.error(
        `[ChatGateway] Failed to broadcast presence for user ${userId}:`,
        err,
      );
    }
  }
}
