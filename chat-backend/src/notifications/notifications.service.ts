import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { forwardRef, Inject } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';
import { getMessaging } from './fcm-client';
import { MessageType } from '../messages/message.schema';
import { ConversationType } from '../conversations/conversation.schema';
import type { Messaging } from 'firebase-admin/messaging';

export interface SendPushNotificationParams {
  senderId: string;
  senderName: string;
  conversationId: string;
  conversationType: ConversationType;
  conversationName?: string | null;
  messageId: string;
  messageType: MessageType;
  messageContent: string;
  recipientIds: string[];
}

const DEDUP_TTL_SECONDS = 5;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {}

  // ─── Main Entry Point ───────────────────────────────────────────────────────

  async sendPushNotification(
    params: SendPushNotificationParams,
  ): Promise<void> {
    const {
      senderId,
      senderName,
      conversationId,
      conversationType,
      conversationName,
      messageId,
      messageType,
      messageContent,
      recipientIds,
    } = params;

    const preview = this.buildPreview(messageContent, messageType);

    // Batch-fetch all recipients in one query (eliminates N+1)
    const eligibleIds = recipientIds.filter((id) => id !== senderId);
    if (eligibleIds.length === 0) return;

    const users = await this.usersService.findByIds(eligibleIds);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    for (const recipientId of eligibleIds) {
      const user = userMap.get(recipientId);
      if (!user) continue;

      if (user.settings?.notificationsEnabled === false) {
        this.logger.debug(
          `[Notifications] Skipping ${recipientId} — notifications disabled`,
        );
        continue;
      }

      if (user.isOnline) {
        this.logger.debug(
          `[Notifications] Skipping ${recipientId} — user is online`,
        );
        continue;
      }

      if (!user.fcmTokens || user.fcmTokens.length === 0) {
        this.logger.debug(
          `[Notifications] Skipping ${recipientId} — no FCM tokens`,
        );
        continue;
      }

      // Redis deduplication check (still per-user, but cheap)
      const dedupKey = `notif:${recipientId}:${conversationId}`;
      const set = await this.redisService.setNXEX(
        dedupKey,
        new Date().toISOString(),
        DEDUP_TTL_SECONDS,
      );
      if (!set) {
        this.logger.debug(
          `[Notifications] Skipping ${recipientId} — dedup active (recent notification)`,
        );
        continue;
      }

      const payload = this.buildPayload({
        senderName,
        conversationId,
        conversationType,
        conversationName,
        messageId,
        preview,
        recipientId,
        recipientAccountType: (user.accountType as string) ?? 'personal',
      });

      const tokens = user.fcmTokens.map((t) => t.token);
      try {
        await this.sendMulticast(recipientId, tokens, payload);
      } catch (err) {
        this.logger.error(
          `[Notifications] Failed to send to ${recipientId}:`,
          err,
        );
      }
    }
  }

  // ─── FCM Send ───────────────────────────────────────────────────────────────

  /**
   * Send a story-mention push to a single user with a moments deep-link.
   * Reuses the same eligibility gates as message pushes (disabled / online /
   * no-token / dedup) and the same multicast + invalid-token cleanup path.
   * Privacy gating (public mentioner, or private+connected) is decided by the
   * caller; this method only handles delivery.
   */
  async sendMentionPush(params: {
    mentionedUserId: string;
    authorName: string;
    storyId: string;
    captionSnippet: string;
  }): Promise<void> {
    const { mentionedUserId, authorName, storyId, captionSnippet } = params;

    const user = await this.usersService.findById(mentionedUserId);
    if (!user) return;

    if (user.settings?.notificationsEnabled === false) return;
    if (user.isOnline) return; // in-app handled by the story.mention socket event
    if (!user.fcmTokens || user.fcmTokens.length === 0) return;

    // Dedup per (user, story) so re-processing a story doesn't double-push.
    const dedupKey = `notif:mention:${mentionedUserId}:${storyId}`;
    const set = await this.redisService.setNXEX(
      dedupKey,
      new Date().toISOString(),
      DEDUP_TTL_SECONDS,
    );
    if (!set) return;

    const body = captionSnippet
      ? `${authorName} đã nhắc đến bạn: ${captionSnippet}`
      : `${authorName} đã nhắc đến bạn trong một khoảnh khắc`;

    const payload: FirebaseMessagingPayload = {
      notification: { title: authorName, body },
      data: {
        type: 'story_mention',
        storyId,
        deepLink: `koola://moments/story/${storyId}`,
        accountId: mentionedUserId,
        accountType: (user.accountType as string) ?? 'personal',
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'messages',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', 'content-available': 1 } },
      },
    };

    const tokens = user.fcmTokens.map((t) => t.token);
    try {
      await this.sendMulticast(mentionedUserId, tokens, payload);
    } catch (err) {
      this.logger.error(
        `[Notifications] Failed to send mention push to ${mentionedUserId}:`,
        err,
      );
    }
  }

  // ─── Post Mention Push ────────────────────────────────────────────────────

  /**
   * Post variant of sendMentionPush: same eligibility gates (disabled /
   * online / no-token / dedup) with a `notif:mention:<user>:<postId>` dedup
   * key and a `koola://moments/post/:id` deep link.
   */
  async sendPostMentionPush(params: {
    mentionedUserId: string;
    authorName: string;
    postId: string;
    captionSnippet: string;
  }): Promise<void> {
    const { mentionedUserId, authorName, postId, captionSnippet } = params;

    const user = await this.usersService.findById(mentionedUserId);
    if (!user) return;

    if (user.settings?.notificationsEnabled === false) return;
    if (user.isOnline) return; // in-app handled by the post socket event
    if (!user.fcmTokens || user.fcmTokens.length === 0) return;

    // Dedup per (user, post) so re-processing a post doesn't double-push.
    const dedupKey = `notif:mention:${mentionedUserId}:${postId}`;
    const set = await this.redisService.setNXEX(
      dedupKey,
      new Date().toISOString(),
      DEDUP_TTL_SECONDS,
    );
    if (!set) return;

    const body = captionSnippet
      ? `${authorName} đã nhắc đến bạn: ${captionSnippet}`
      : `${authorName} đã nhắc đến bạn trong một bài viết`;

    const payload: FirebaseMessagingPayload = {
      notification: { title: authorName, body },
      data: {
        type: 'post_mention',
        postId,
        deepLink: `koola://moments/post/${postId}`,
        accountId: mentionedUserId,
        accountType: (user.accountType as string) ?? 'personal',
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'messages',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', 'content-available': 1 } },
      },
    };

    const tokens = user.fcmTokens.map((t) => t.token);
    try {
      await this.sendMulticast(mentionedUserId, tokens, payload);
    } catch (err) {
      this.logger.error(
        `[Notifications] Failed to send post mention push to ${mentionedUserId}:`,
        err,
      );
    }
  }

  // ─── Post Comment Push ────────────────────────────────────────────────────

  /**
   * Notify the post author of a new comment (unless author == commenter).
   * Same eligibility gates as mentions: disabled / online / no-token / dedup.
   */
  async sendCommentPush(params: {
    postId: string;
    authorId: string;
    commenterId: string;
    commenterName?: string;
  }): Promise<void> {
    const { postId, authorId, commenterId, commenterName } = params;
    if (authorId === commenterId) return;
    const user = await this.usersService.findById(authorId);
    if (!user) return;
    if ((user as any).settings?.notificationsEnabled === false) return;
    if ((user as any).isOnline) return;
    const tokens = ((user as any).fcmTokens ?? []).map((t: any) => t.token);
    if (!tokens || tokens.length === 0) return;
    const dedupKey = `notif:comment:${authorId}:${postId}:${commenterId}`;
    const set = await this.redisService.setNXEX(
      dedupKey,
      new Date().toISOString(),
      DEDUP_TTL_SECONDS,
    );
    if (!set) return;
    const payload: FirebaseMessagingPayload = {
      notification: {
        title: commenterName ?? 'Khoảnh khắc',
        body: 'Đã bình luận về bài viết của bạn',
      },
      data: {
        type: 'post_comment',
        postId,
        deepLink: `koola://moments/post/${postId}`,
        accountId: authorId,
        accountType: ((user as any).accountType as string) ?? 'personal',
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'messages',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', 'content-available': 1 } },
      },
    };
    try {
      await this.sendMulticast(authorId, tokens, payload);
    } catch (err) {
      this.logger.error(
        `[Notifications] Failed to send comment push to ${authorId}:`,
        err,
      );
    }
  }

  // ─── Order Update Push (commerce-orders D4) ─────────────────────────────────
  /** Dedup TTL for order pushes: one push per (user, order, status). */
  private static readonly ORDER_PUSH_DEDUP_TTL_SECONDS = 24 * 60 * 60;

  /**
   * Send an order-status push to a single user with a koola://orders deep-link.
   * Follows sendMentionPush: the same eligibility gates (disabled / online /
   * no-token / dedup) and the same multicast + invalid-token cleanup path.
   * Each transition pushes at most once thanks to the per-status dedup key.
   */
  async sendOrderPush(params: {
    recipientUserId: string;
    title: string;
    body: string;
    orderId: string;
    status: string;
    conversationId: string;
  }): Promise<void> {
    const { recipientUserId, title, body, orderId, status, conversationId } =
      params;

    const user = await this.usersService.findById(recipientUserId);
    if (!user) return;

    if (user.settings?.notificationsEnabled === false) return;
    if (user.isOnline) return; // in-app handled by the new_message socket event
    if (!user.fcmTokens || user.fcmTokens.length === 0) return;

    // Dedup per (user, order, status) so a retried transition never double-pushes.
    const dedupKey = `notif:order:${recipientUserId}:${orderId}:${status}`;
    const set = await this.redisService.setNXEX(
      dedupKey,
      new Date().toISOString(),
      NotificationsService.ORDER_PUSH_DEDUP_TTL_SECONDS,
    );
    if (!set) return;

    const payload: FirebaseMessagingPayload = {
      notification: { title, body },
      data: {
        type: 'order_update',
        orderId,
        status,
        conversationId,
        deepLink: `koola://orders/${orderId}`,
        accountId: recipientUserId,
        accountType: (user.accountType as string) ?? 'personal',
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'messages',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', 'content-available': 1 } },
      },
    };

    const tokens = user.fcmTokens.map((t) => t.token);
    try {
      await this.sendMulticast(recipientUserId, tokens, payload);
    } catch (err) {
      this.logger.error(
        `[Notifications] Failed to send order push to ${recipientUserId}:`,
        err,
      );
    }
  }

  private async sendMulticast(
    recipientId: string,
    tokens: string[],
    payload: FirebaseMessagingPayload,
  ): Promise<void> {
    let messaging: Messaging;
    try {
      messaging = getMessaging();
    } catch {
      throw new ServiceUnavailableException('Firebase not configured');
    }

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        ...payload,
      });

      // Log results
      this.logger.log(
        `[Notifications] Sent to ${recipientId}: ${response.successCount} success, ${response.failureCount} failed`,
      );

      // Remove invalid tokens
      for (const error of response.responses) {
        const err = error.error;
        if (!err) continue;

        const code = err.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          err.code === 'messaging/registration-token-not-registered'
        ) {
          // Remove the token that failed
          const failedIndex = response.responses.indexOf(error);
          if (failedIndex >= 0 && tokens[failedIndex]) {
            await this.removeInvalidToken(recipientId, tokens[failedIndex]);
          }
        }
      }
    } catch (err: unknown) {
      const errorCode = (err as { code?: string }).code ?? '';
      if (
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-argument'
      ) {
        // All tokens invalid — clear them
        await this.usersService.clearFcmTokens(recipientId);
      }
      throw err;
    }
  }

  async removeInvalidToken(userId: string, token: string): Promise<void> {
    await this.usersService.removeFcmToken(userId, token);
    this.logger.warn(
      `[Notifications] Removed invalid FCM token for user ${userId}`,
    );
  }

  // ─── Payload Builder ───────────────────────────────────────────────────────

  private buildPayload(params: {
    senderName: string;
    conversationId: string;
    conversationType: ConversationType;
    conversationName?: string | null;
    messageId: string;
    preview: string;
    /** The userId this push is addressed to — used as accountId on the client. */
    recipientId: string;
    /** The accountType of the recipient — forwarded so the client can badge per-account. */
    recipientAccountType: string;
  }): FirebaseMessagingPayload {
    const {
      senderName,
      conversationId,
      conversationType,
      conversationName,
      messageId,
      preview,
      recipientId,
      recipientAccountType,
    } = params;

    // Title: group name or sender name
    const title =
      conversationType === ConversationType.GROUP
        ? conversationName || 'Group Chat'
        : senderName;

    // Body: include sender prefix for group chats
    const body =
      conversationType === ConversationType.GROUP
        ? `${senderName}: ${preview}`
        : preview;

    return {
      notification: { title, body },
      data: {
        conversationId,
        messageId,
        type: 'new_message',
        // Account context — client uses these to badge per-account and
        // auto-switch on tap when the notification targets a non-active account.
        accountId: recipientId,
        accountType: recipientAccountType,
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'messages',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    };
  }

  // ─── Preview Builder ────────────────────────────────────────────────────────

  buildPreview(content: string, messageType: MessageType): string {
    switch (messageType) {
      case MessageType.IMAGE:
        return '📷 Photo';
      case MessageType.FILE:
        return '📎 File';
      case MessageType.VOICE:
        return '🎤 Voice message';
      case MessageType.SYSTEM:
        return content;
      default:
        return content.length > 100 ? content.slice(0, 100) + '…' : content;
    }
  }
}

// Firebase Admin payload type
interface FirebaseMessagingPayload {
  notification: { title: string; body: string };
  data: Record<string, string>;
  android: {
    priority: 'high';
    notification: { channelId: string; clickAction: string };
  };
  apns: {
    payload: { aps: { sound: string; 'content-available': number } };
  };
}
