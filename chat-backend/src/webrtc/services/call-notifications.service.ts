import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { getMessaging } from '../../notifications/fcm-client';

// ─── Public Interface ────────────────────────────────────────────────────────

export interface SendIncomingCallPushParams {
  recipientId: string;
  sessionId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  conversationId: string;
  /** Epoch milliseconds — when the grace window expires */
  expiresAt: number;
}

export interface SendIncomingCallPushResult {
  success: number;
  failure: number;
  totalTokens: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CallNotificationsService {
  private readonly logger = new Logger(CallNotificationsService.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Sends a high-priority FCM data-only message to every registered FCM token
   * for the recipient. Returns success/failure counts.
   *
   * This method NEVER throws — all errors are caught, logged, and reflected in
   * the returned failure count. The caller is responsible for deciding what to
   * do with a zero-success result.
   */
  async sendIncomingCallPush(
    params: SendIncomingCallPushParams,
  ): Promise<SendIncomingCallPushResult> {
    const { recipientId, sessionId } = params;

    // 1. Load recipient and check tokens
    const user = await this.usersService.findById(recipientId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      this.logger.debug(
        `[CallNotifications] No FCM tokens for user ${recipientId} (session ${sessionId}) — skipping push`,
      );
      return { success: 0, failure: 0, totalTokens: 0 };
    }

    const tokens = user.fcmTokens.map((t) => t.token);
    const totalTokens = tokens.length;

    // 2. Build one message per token
    const messages = tokens.map((token) =>
      this.buildIncomingCallMessage(params, token),
    );

    // 3. Send and collect results — never propagate exceptions
    try {
      const messaging = getMessaging();
      const response = await messaging.sendEach(messages);

      this.logger.log(
        `[CallNotifications] Push sent for session ${sessionId}: ` +
          `${response.successCount} success, ${response.failureCount} failed, ` +
          `${totalTokens} total tokens`,
      );

      return {
        success: response.successCount,
        failure: response.failureCount,
        totalTokens,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[CallNotifications] FCM error for session ${sessionId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      return { success: 0, failure: totalTokens, totalTokens };
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Builds a firebase-admin Message for a single device token.
   * Data-only (no notification field) so the mobile FCM background handler
   * can wake the app and trigger CallKit / ConnectionService.
   * All data values are strings as required by the FCM protocol.
   */
  private buildIncomingCallMessage(
    params: SendIncomingCallPushParams,
    token: string,
  ): import('firebase-admin/messaging').Message {
    return {
      token,
      // NO notification field — data-only for background wake-up
      data: {
        type: 'incoming_call',
        sessionId: params.sessionId,
        callerId: params.callerId,
        callerName: params.callerName,
        callerAvatar: params.callerAvatar ?? '',
        callType: params.callType,
        conversationId: params.conversationId,
        expiresAt: String(params.expiresAt),
      },
      android: {
        priority: 'high' as const,
        ttl: 20 * 1000, // 20 seconds in milliseconds (firebase-admin SDK accepts numeric ms)
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'background',
        },
        payload: {
          aps: {
            'content-available': 1,
          },
        },
      },
    };
  }
}
