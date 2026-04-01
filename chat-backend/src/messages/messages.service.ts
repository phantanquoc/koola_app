import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { forwardRef, Inject } from '@nestjs/common';
import {
  Message,
  MessageDocument,
  MessageType,
  MessageStatus,
} from './message.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from '../conversations/conversations.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface TypingPayload {
  conversationId: string;
  userId: string;
}

export interface NewMessagePayload {
  message: MessageDocument;
  conversationId: string;
  senderId: string;
}

export interface MessageDeletedPayload {
  messageId: string;
  conversationId: string;
}

export interface MessageReadPayload {
  messageId: string;
  readBy: string;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    private conversationsService: ConversationsService,
    private typingService: TypingService,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {
    // Wire TypingService 5s timeout → emitTypingStop
    this.typingService.setTypingStopCallback((convId, userId) => {
      // This will be called by gateway module via emitTypingStop
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async verifyMember(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conv = await this.conversationsService.findByIdOrFail(conversationId);
    const isMember = conv.members.some((m) => m.userId.toString() === userId);
    if (!isMember) throw new ForbiddenException();
  }

  private buildPreview(content: string, type: MessageType): string {
    switch (type) {
      case MessageType.IMAGE:
        return '📷 Photo';
      case MessageType.FILE:
        return `📎 ${content || 'File'}`;
      case MessageType.VOICE:
        return '🎤 Voice message';
      case MessageType.SYSTEM:
        return content;
      default:
        return content.length > 50 ? content.slice(0, 50) + '…' : content;
    }
  }

  // ─── Send ───────────────────────────────────────────────────────────────────

  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<NewMessagePayload> {
    // Verify sender is a member
    await this.verifyMember(conversationId, senderId);

    // Validate: text messages must have content
    if (
      dto.type === MessageType.TEXT &&
      (!dto.content || dto.content.trim().length === 0)
    ) {
      throw new BadRequestException('content is required');
    }

    // Validate: content length
    if (dto.content && dto.content.length > 10000) {
      throw new BadRequestException('Message exceeds 10,000 character limit');
    }

    // Validate: media file size (100MB = 104857600 bytes)
    if (dto.mediaSize !== undefined && dto.mediaSize > 104857600) {
      throw new BadRequestException('File exceeds 100MB limit');
    }

    // Stop typing when message is sent
    this.typingService.stopTyping(conversationId, senderId);

    // Create message
    const message = await this.messageModel.create({
      conversationId,
      senderId,
      type: dto.type,
      content: dto.content ?? '',
      status: MessageStatus.SENT,
      mediaUrl: dto.mediaUrl ?? '',
      mediaMimeType: dto.mediaMimeType ?? '',
      mediaSize: dto.mediaSize ?? 0,
      deleted: false,
      clientMessageId: dto.clientMessageId ?? null,
    });

    // Update conversation last message
    const preview = this.buildPreview(dto.content ?? '', dto.type);
    await this.conversationsService.updateLastMessage(conversationId, preview);

    // Increment unread count for all other members
    await this.conversationsService.incrementUnreadCount(
      conversationId,
      senderId,
    );

    return this.emitNewMessage(message, conversationId, senderId);
  }

  // ─── Post-Send: Push Notifications ─────────────────────────────────────────

  async triggerPushNotifications(
    message: MessageDocument,
    conversationId: string,
    senderId: string,
    senderName: string,
  ): Promise<void> {
    // Get conversation to know type and name
    const conv = await this.conversationsService.findByIdOrFail(conversationId);

    // Recipient IDs = all members except sender
    const recipientIds = conv.members
      .map((m) => m.userId.toString())
      .filter((id) => id !== senderId);

    if (recipientIds.length === 0) return;

    // Fire-and-forget: don't block message response on FCM
    this.notificationsService
      .sendPushNotification({
        senderId,
        senderName,
        conversationId,
        conversationType: conv.type,
        conversationName: conv.name,
        messageId: message._id.toString(),
        messageType: message.type,
        messageContent: message.content,
        recipientIds,
      })
      .catch((err) => {
        console.error('[MessagesService] Push notification error:', err);
      });
  }

  // ─── List ───────────────────────────────────────────────────────────────────

  async listMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ messages: MessageDocument[]; nextCursor: string | null }> {
    await this.verifyMember(conversationId, userId);

    const query: Record<string, unknown> = {
      conversationId,
      deleted: false,
    };

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!isNaN(cursorDate.getTime())) {
        query['createdAt'] = { $lt: cursorDate };
      }
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('senderId', '_id email displayName avatar')
      .lean();

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;

    // Reverse to ascending order (oldest first) for client display
    const ascending = [...results].reverse();

    const nextCursor =
      hasMore && results.length > 0
        ? (results[results.length - 1] as any).createdAt.toISOString()
        : null;

    return { messages: ascending as MessageDocument[], nextCursor };
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<MessageDeletedPayload> {
    // Verify member
    await this.verifyMember(conversationId, userId);

    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');

    if (message.senderId !== userId) {
      throw new ForbiddenException();
    }

    // 24h window
    const ageMs = Date.now() - message.get('createdAt').getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours > 24) {
      throw new ForbiddenException(
        'Messages can only be deleted within 24 hours',
      );
    }

    message.deleted = true;
    message.content = 'This message was deleted';
    await message.save();

    return this.emitMessageDeleted(messageId, conversationId);
  }

  // ─── Read Status ────────────────────────────────────────────────────────────

  async markAsRead(
    messageId: string,
    userId: string,
  ): Promise<MessageReadPayload> {
    const message = await this.messageModel.findById(messageId).lean();
    if (!message) throw new NotFoundException('Message not found');

    // Verify user is member of conversation
    await this.verifyMember(message.conversationId, userId);

    // Update status: SENT → DELIVERED → READ
    await this.messageModel.updateOne(
      { _id: messageId },
      { $set: { status: MessageStatus.READ } },
    );

    // Reset unread for this user in this conversation
    await this.conversationsService.resetUnreadCount(
      message.conversationId,
      userId,
    );

    return { messageId, readBy: userId };
  }

  // ─── Typing ─────────────────────────────────────────────────────────────────

  emitTyping(convId: string, userId: string): void {
    this.typingService.startTyping(convId, userId);
  }

  emitTypingStop(convId: string, userId: string): TypingPayload {
    this.typingService.stopTyping(convId, userId);
    return { conversationId: convId, userId };
  }

  // ─── Query Helpers ─────────────────────────────────────────────────────────

  async findById(messageId: string): Promise<MessageDocument | null> {
    return this.messageModel
      .findById(messageId)
      .populate('senderId', '_id email displayName avatar');
  }

  async findByClientMessageId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<MessageDocument | null> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.messageModel.findOne({
      conversationId,
      clientMessageId,
      createdAt: { $gt: fiveMinutesAgo },
    });
  }

  // ─── Sync (offline recovery) ─────────────────────────────────────────────────

  /**
   * Fetch all messages across all user's conversations since a given timestamp.
   * Used by the offline queue sync endpoint — GET /messages/sync
   */
  async syncMessages(
    userId: string,
    since: string,
    cursor?: string,
    limit = 100,
  ): Promise<{ items: MessageDocument[]; hasMore: boolean; nextCursor: string | null }> {
    // Get all conversation IDs the user is a member of
    const Conversation = this.messageModel.db.model('Conversation');
    const userConversations = await (Conversation as any).find(
      { 'members.userId': new Types.ObjectId(userId) },
      { _id: 1 },
    );
    const conversationIds = userConversations.map((c: any) => c._id);

    if (conversationIds.length === 0) {
      return { items: [], hasMore: false, nextCursor: null };
    }

    const sinceDate = new Date(since);
    let query: Record<string, unknown> = {
      conversationId: { $in: conversationIds },
      deleted: false,
      createdAt: { $gt: sinceDate },
    };

    if (cursor) {
      const cursorDoc = await this.messageModel.findById(cursor).select('createdAt').lean() as any;
      if (cursorDoc) {
        query = {
          conversationId: { $in: conversationIds },
          deleted: false,
          $and: [
            { createdAt: { $gt: sinceDate } },
            { createdAt: { $gt: cursorDoc.createdAt } },
          ],
        };
      }
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: 1 })
      .limit(limit + 1)
      .populate('senderId', '_id email displayName avatar')
      .lean();

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor =
      hasMore && results.length > 0 ? (results[results.length - 1] as any)._id.toString() : null;

    return { items: results as MessageDocument[], hasMore, nextCursor };
  }

  // ─── Emit Payloads (for gateway module) ────────────────────────────────────

  emitNewMessage(
    msg: MessageDocument,
    convId: string,
    senderId: string,
  ): NewMessagePayload {
    return {
      message: msg,
      conversationId: convId,
      senderId,
    };
  }

  emitMessageDeleted(
    messageId: string,
    conversationId: string,
  ): MessageDeletedPayload {
    return { messageId, conversationId };
  }
}
