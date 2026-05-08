import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Message,
  MessageDocument,
  MessageType,
  MessageStatus,
} from './message.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from '../conversations/conversations.service';
import { MembershipService } from '../conversations/services/membership.service';
import { UnreadService } from '../conversations/services/unread.service';
import { TypingService } from './typing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { minioClient, BUCKET } from '../media/minio-client';
import { ConversationType } from '../conversations/conversation.schema';

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

export interface MessagesReadResult {
  updated: number;
  readAt: Date;
  /** IDs of messages that were marked read (for socket event emission) */
  messageIds: string[];
  /** The full readBy array for each message, keyed by messageId */
  readByMap: Map<string, string[]>;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    private conversationsService: ConversationsService,
    private membershipService: MembershipService,
    private unreadService: UnreadService,
    private typingService: TypingService,
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
    await this.membershipService.verifyMember(userId, conversationId);
  }

  private buildPreview(content: string, type: MessageType): string {
    switch (type) {
      case MessageType.IMAGE:
        return '📷 Photo';
      case MessageType.FILE:
        return `📎 ${content || 'File'}`;
      case MessageType.VOICE:
        return '🎤 Voice message';
      case MessageType.VIDEO:
        return '🎬 Video';
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

    // Validate: media file size (200MB = 209715200 bytes)
    if (dto.mediaSize !== undefined && dto.mediaSize > 209715200) {
      throw new BadRequestException('File exceeds 200MB limit');
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
      mediaDuration: dto.mediaDuration ?? null,
    });

    // Update conversation last message
    const preview = this.buildPreview(dto.content ?? '', dto.type);
    await this.conversationsService.updateLastMessage(conversationId, preview);

    // Increment unread count for all other members
    await this.unreadService.incrementUnreadCount(conversationId, [senderId]);

    // Fire-and-forget: generate blurhash for image messages
    if (dto.type === MessageType.IMAGE && dto.mediaUrl) {
      this.generateBlurhash(message._id.toString(), dto.mediaUrl).catch((err) =>
        console.error('[MessagesService] blurhash generation failed:', err),
      );
    }

    return this.emitNewMessage(message, conversationId, senderId);
  }

  // ─── Blurhash Generation ────────────────────────────────────────────────────

  /**
   * Callback set by ChatGateway to broadcast blurhash updates via socket.
   */
  private blurhashCallback?: (
    messageId: string,
    conversationId: string,
    blurhash: string,
    width: number,
    height: number,
  ) => void;

  setBlurhashCallback(
    cb: (
      messageId: string,
      conversationId: string,
      blurhash: string,
      width: number,
      height: number,
    ) => void,
  ): void {
    this.blurhashCallback = cb;
  }

  private async generateBlurhash(
    messageId: string,
    mediaKey: string,
  ): Promise<void> {
    const sharp = require('sharp');
    const { encode } = require('blurhash') as typeof import('blurhash');

    // Download from MinIO
    const stream = await minioClient.getObject(BUCKET, mediaKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // Get original dimensions and resize to small for blurhash
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const COMPONENT_X = 4;
    const COMPONENT_Y = 3;
    const THUMB_W = 32;
    const THUMB_H = Math.round(THUMB_W * (height / (width || 1)));

    const { data, info } = await sharp(buffer)
      .resize(THUMB_W, THUMB_H || THUMB_W, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const blurhash = encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      COMPONENT_X,
      COMPONENT_Y,
    );

    // Update message in DB
    await this.messageModel.updateOne(
      { _id: messageId },
      { $set: { blurhash, imageWidth: width, imageHeight: height } },
    );

    // Broadcast via socket if callback set
    const message = await this.messageModel.findById(messageId).lean();
    if (message && this.blurhashCallback) {
      this.blurhashCallback(
        messageId,
        message.conversationId,
        blurhash,
        width,
        height,
      );
    }
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
      deletedFor: { $ne: userId },
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
      .populate('senderId', '_id phone email displayName avatar')
      .lean();

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;

    // Reverse to ascending order (oldest first) for client display
    const ascending = [...results].reverse();

    // Normalize readBy: ensure field is always present as an array (old
    // documents created before the readBy field was added may be missing it).
    const normalized = ascending.map((msg) => {
      const m = msg as any;
      if (!Array.isArray(m.readBy)) {
        m.readBy = [];
      }
      return m;
    });

    const nextCursor =
      hasMore && results.length > 0
        ? (results[results.length - 1] as any).createdAt.toISOString()
        : null;

    return { messages: normalized as MessageDocument[], nextCursor };
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

    // Update status: SENT → DELIVERED → READ and add to readBy (idempotent)
    await this.messageModel.updateOne(
      { _id: messageId },
      {
        $set: { status: MessageStatus.READ },
        $addToSet: { readBy: userId },
      },
    );

    // Reset unread for this user in this conversation
    await this.unreadService.resetUnreadCount(userId, message.conversationId);

    return { messageId, readBy: userId };
  }

  /**
   * Bulk mark-read for a conversation, up to an optional timestamp.
   *
   * - Marks all messages in the conversation (not sent by the caller, not
   *   already read by the caller) as read by adding the caller's userId to
   *   `readBy` ($addToSet — idempotent).
   * - For DIRECT conversations only: also sets `status = READ` on the same
   *   messages, preserving backward compatibility with mobile clients that
   *   inspect the `status` field.
   * - For GROUP conversations: `status` is NOT changed.
   */
  async markMessagesRead(
    conversationId: string,
    userId: string,
    upToTimestamp?: string,
  ): Promise<MessagesReadResult> {
    // Verify caller is a member (throws ForbiddenException if not)
    const conv = await this.conversationsService.findByIdOrFail(conversationId);
    const isMember = conv.members.some((m) => m.userId.toString() === userId);
    if (!isMember)
      throw new ForbiddenException('Not a member of this conversation');

    const readAt = new Date();
    const upTo = upToTimestamp ? new Date(upToTimestamp) : readAt;

    const filter: Record<string, unknown> = {
      conversationId,
      senderId: { $ne: userId },
      createdAt: { $lte: upTo },
      readBy: { $ne: userId },
    };

    // Determine which fields to update
    const isDirect = conv.type === ConversationType.DIRECT;
    const updateDoc: Record<string, unknown> = {
      $addToSet: { readBy: userId },
    };
    if (isDirect) {
      (updateDoc as any)['$set'] = { status: MessageStatus.READ };
    }

    const result = await this.messageModel.updateMany(filter, updateDoc);
    const updated = result.modifiedCount;

    // Reset unread count for caller
    await this.unreadService.resetUnreadCount(userId, conversationId);

    // Fetch the affected messages to get their current readBy arrays
    // (for socket event emission by the controller/gateway)
    const affectedMessages = await this.messageModel
      .find({
        conversationId,
        senderId: { $ne: userId },
        createdAt: { $lte: upTo },
        readBy: userId,
      })
      .select('_id readBy')
      .lean();

    const messageIds: string[] = [];
    const readByMap = new Map<string, string[]>();
    for (const msg of affectedMessages) {
      const id = (msg as any)._id.toString();
      messageIds.push(id);
      readByMap.set(id, (msg as any).readBy ?? []);
    }

    return { updated, readAt, messageIds, readByMap };
  }

  // ─── Reactions ──────────────────────────────────────────────────────────────

  async toggleReaction(
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<{ action: 'add' | 'remove'; emoji: string }> {
    await this.verifyMember(conversationId, userId);

    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');
    if (message.conversationId !== conversationId)
      throw new ForbiddenException();

    const existing = message.reactions.find((r) => r.userId === userId);

    if (existing && existing.emoji === emoji) {
      // Toggle off — remove reaction
      await this.messageModel.updateOne(
        { _id: messageId },
        { $pull: { reactions: { userId } } },
      );
      return { action: 'remove', emoji };
    } else if (existing) {
      // Change emoji — replace
      await this.messageModel.updateOne(
        { _id: messageId, 'reactions.userId': userId },
        { $set: { 'reactions.$.emoji': emoji } },
      );
      return { action: 'add', emoji };
    } else {
      // Add new reaction
      await this.messageModel.updateOne(
        { _id: messageId },
        { $push: { reactions: { userId, emoji } } },
      );
      return { action: 'add', emoji };
    }
  }

  // ─── Delete for me ────────────────────────────────────────────────────────

  async deleteForMe(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyMember(conversationId, userId);

    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');

    await this.messageModel.updateOne(
      { _id: messageId },
      { $addToSet: { deletedFor: userId } },
    );
  }

  // ─── Forward message ──────────────────────────────────────────────────────

  async forwardMessage(
    messageId: string,
    senderId: string,
    targetConversationIds: string[],
  ): Promise<MessageDocument[]> {
    if (targetConversationIds.length > 10) {
      throw new BadRequestException('Maximum 10 conversations per forward');
    }

    const original = await this.messageModel.findById(messageId);
    if (!original) throw new NotFoundException('Message not found');

    // Verify sender is member of original conversation
    await this.verifyMember(original.conversationId, senderId);

    const forwarded: MessageDocument[] = [];

    for (const targetConvId of targetConversationIds) {
      // Verify sender is member of target
      await this.verifyMember(targetConvId, senderId);

      const content = `[Chuyển tiếp] ${original.content}`;
      const msg = await this.messageModel.create({
        conversationId: targetConvId,
        senderId,
        type: original.type,
        content,
        status: MessageStatus.SENT,
        mediaUrl: original.mediaUrl,
        mediaMimeType: original.mediaMimeType,
        mediaSize: original.mediaSize,
        deleted: false,
        clientMessageId: null,
      });

      const preview = this.buildPreview(content, original.type);
      await this.conversationsService.updateLastMessage(targetConvId, preview);
      await this.unreadService.incrementUnreadCount(targetConvId, [senderId]);

      forwarded.push(msg);
    }

    return forwarded;
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
      .populate('senderId', '_id phone email displayName avatar');
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
  ): Promise<{
    items: MessageDocument[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    // Get all conversation IDs the user is a member of
    const conversationIds =
      await this.conversationsService.getSharedConversationIds(userId);

    if (conversationIds.length === 0) {
      return { items: [], hasMore: false, nextCursor: null };
    }

    const sinceDate = new Date(since);
    let query: Record<string, unknown> = {
      conversationId: { $in: conversationIds },
      deleted: false,
      deletedFor: { $ne: userId },
      createdAt: { $gt: sinceDate },
    };

    if (cursor) {
      const cursorDoc = (await this.messageModel
        .findById(cursor)
        .select('createdAt')
        .lean()) as any;
      if (cursorDoc) {
        query = {
          conversationId: { $in: conversationIds },
          deleted: false,
          deletedFor: { $ne: userId },
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
      .populate('senderId', '_id phone email displayName avatar')
      .lean();

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor =
      hasMore && results.length > 0
        ? (results[results.length - 1] as any)._id.toString()
        : null;

    // Normalize readBy: ensure field is present on old documents
    const normalized = results.map((msg) => {
      const m = msg as any;
      if (!Array.isArray(m.readBy)) m.readBy = [];
      return m;
    });

    return { items: normalized as MessageDocument[], hasMore, nextCursor };
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

  /**
   * Full-text search across messages in conversations where the user is a
   * member. Uses MongoDB $text index on `content`. Excludes deleted messages.
   * Cursor is an opaque base64-encoded message _id; paginates by createdAt DESC.
   */
  async searchMessages(
    userId: string,
    q: string,
    limit: number,
    cursor?: string,
  ): Promise<{
    items: MessageDocument[];
    nextCursor: string | null;
    total: number;
  }> {
    const conversationIds =
      await this.membershipService.getUserConversationIds(userId);
    if (conversationIds.length === 0) {
      return { items: [], nextCursor: null, total: 0 };
    }

    const filter: Record<string, unknown> = {
      conversationId: { $in: conversationIds },
      deleted: { $ne: true },
      $text: { $search: q },
    };

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const cursorDoc = (await this.messageModel
          .findById(decoded)
          .select('createdAt')
          .lean()) as { createdAt?: Date } | null;
        if (cursorDoc?.createdAt) {
          filter.createdAt = { $lt: cursorDoc.createdAt };
        }
      } catch {
        // invalid cursor → ignore
      }
    }

    const [items, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .exec(),
      this.messageModel.countDocuments(filter),
    ]);

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && pageItems.length > 0
        ? Buffer.from(pageItems[pageItems.length - 1]._id.toString()).toString(
            'base64',
          )
        : null;

    return { items: pageItems, nextCursor, total };
  }
}
