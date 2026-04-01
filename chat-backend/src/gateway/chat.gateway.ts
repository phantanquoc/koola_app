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
import { UsersService } from '../users/users.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { TypingService } from '../messages/typing.service';
import { SendMessageDto } from '../messages/dto/send-message.dto';
import { MessageType } from '../messages/message.schema';

const HEARTBEAT_TIMEOUT_MS = 30_000; // 30 seconds

interface AuthSocketData {
  user?: { sub: string; email: string };
  heartbeatTimer?: NodeJS.Timeout;
}

type AuthSocket = Socket & { data: AuthSocketData };

@WebSocketGateway({ namespace: '/chat', cors: true })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  io: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly conversationsService: ConversationsService,
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
  }

  // ─── Connection ────────────────────────────────────────────────────────────────

  async handleConnection(client: AuthSocket): Promise<void> {
    const token = client.handshake.query.token as string | undefined;

    if (!token) {
      client.disconnect(true);
      return;
    }

    let payload: { sub: string; email: string };
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
      email: payload.email,
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
      this.handleDisconnect(client).catch(() => {});
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
      this.usersService.updateLastSeen(userId).catch(() => {});
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
      const conv =
        await this.conversationsService.findByIdOrFail(conversationId);
      const isMember = conv.members.some((m) => m.userId.toString() === userId);
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
      // Get message to find sender
      const messageDoc = await this.messagesService.findById(messageId);
      if (!messageDoc) {
        client.emit('error', { code: 404, message: 'Message not found' });
        return;
      }

      await this.messagesService.markAsRead(messageId, userId);

      // Emit to sender's personal room
      this.io.to(`user:${messageDoc.senderId}`).emit('message_read', {
        messageId,
        readBy: userId,
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
