/**
 * socketEventRouter.ts
 *
 * Routes socket events from SocketService into messageRepository.applySocketEvent.
 * This is the persistence layer for real-time events — the repository handles
 * idempotent upserts and fires invalidation notifications that drive UI subscriptions.
 *
 * Usage (task 4.6 / Phase 3):
 *   Call wireSocketEvents() once after login when LOCAL_FIRST_SQLITE flag is on.
 *   Returns an unwire function for logout cleanup.
 *
 * The legacy socket handlers in useMessages.ts remain active on the legacy path.
 * When the flag is on, both paths run in parallel during the transition period —
 * the repository write is additive and idempotent.
 */

import { socketService } from '../socket/SocketService';
import { webrtcService } from '../webrtc/WebRTCService';
import * as messageRepository from '../db/messageRepository';
import * as conversationRepository from '../db/conversationRepository';
import * as callLogRepository from '../db/callLogRepository';
import type { CallLogInput } from '../db/callLogRepository';
import type { SocketEvent } from '../db/messageRepository';
import { momentsService, type MomentsEvent } from '../moments/momentsService';

type EventCallback = (...args: unknown[]) => void;

// ─── Current user tracking ────────────────────────────────────────────────────
// Set by AuthContext after login/restore/verifyOtp; cleared on logout.
// Used to determine fromOtherUser when bumping conversation unread count.

let _currentUserId: string | null = null;

/**
 * Set the current authenticated user id.
 * Called by AuthContext after setUser() and cleared on logout.
 */
export function setCurrentUserId(userId: string | null): void {
  _currentUserId = userId;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function makeHandler(type: SocketEvent['type']): EventCallback {
  return (data: unknown) => {
    try {
      messageRepository.applySocketEvent({
        type,
        payload: (data as Record<string, unknown>) ?? {},
      });
    } catch (err) {
      console.warn(`[socketEventRouter] applySocketEvent(${type}) error:`, err);
    }
  };
}

/**
 * Handler for new_message that also bumps the conversation row in SQLite.
 * Runs after the message is persisted so the conversation list stays in sync.
 */
function makeNewMessageHandler(): EventCallback {
  const msgHandler = makeHandler('new_message');
  return (data: unknown) => {
    // Persist the message first
    msgHandler(data);

    // Bump the conversation row for the list UI
    try {
      const payload = (data as Record<string, unknown>) ?? {};
      const msg = (payload.message ?? payload) as Record<string, unknown>;
      const conversationId = String(msg.conversationId ?? '');
      if (!conversationId) return;

      const content = String(msg.content ?? '');
      const createdAt = msg.createdAt as string | number | undefined;
      const senderId = String(msg.senderId ?? '');
      const fromOtherUser = !!senderId && senderId !== _currentUserId;

      conversationRepository.bumpFromMessage({
        conversationId,
        preview: content,
        messageAt: createdAt ?? Date.now(),
        fromOtherUser,
      });
    } catch (err) {
      console.warn('[socketEventRouter] bumpFromMessage error:', err);
    }
  };
}


function normalizeCallLog(payload: unknown): CallLogInput | null {
  const r =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const id = String((r._id ?? r.id ?? r.sessionId ?? '') as string);
  if (!id) return null;
  return {
    id,
    sessionId: String((r.sessionId ?? id) as string),
    conversationId: String((r.conversationId ?? '') as string),
    initiatorId: String((r.initiatorId ?? r.fromUserId ?? '') as string),
    targetUserId: String((r.targetUserId ?? '') as string),
    callType: ((r.callType as string) ?? 'audio') as CallLogInput['callType'],
    status: ((r.status as string) ?? 'ended') as CallLogInput['status'],
    startedAt: (r.startedAt ?? r.createdAt ?? Date.now()) as string | number | Date,
    answeredAt: (r.answeredAt ?? null) as string | null,
    endedAt: (r.endedAt ?? null) as string | null,
    duration: Number((r.duration as number) ?? 0),
  };
}

function makeCallLogHandler(): EventCallback {
  return (data: unknown) => {
    try {
      const raw = data as Record<string, unknown> | null;
      const payload =
        raw && typeof raw === 'object' && 'callLog' in raw
          ? (raw as Record<string, unknown>).callLog
          : raw;
      const input = normalizeCallLog(payload);
      if (!input || !input.conversationId) return;
      callLogRepository.upsertMany([input]);
    } catch (err) {
      console.warn('[socketEventRouter] call_log error:', err);
    }
  };
}

// Bridge /webrtc namespace call-log events into SQLite.
// SocketService is on /chat; webrtcService is on /webrtc — socketEventRouter
// only listens on /chat, so we also subscribe to webrtcService.
let _webrtcUnwire: (() => void) | null = null;

function wireWebrtcCallLogs(): void {
  if (_webrtcUnwire) return;
  const h = makeCallLogHandler();
  webrtcService.on('call_log_created', h);
  webrtcService.on('call_log_updated', h);
  _webrtcUnwire = () => {
    webrtcService.off('call_log_created', h);
    webrtcService.off('call_log_updated', h);
    _webrtcUnwire = null;
  };
}

function unwireWebrtcCallLogs(): void {
  _webrtcUnwire?.();
  _webrtcUnwire = null;
}

let _handlers: Array<{ event: string; handler: EventCallback }> | null = null;

// ─── Moments Event Handler ────────────────────────────────────────────────────

function makeMomentsHandler(type: MomentsEvent['type']): EventCallback {
  return (data: unknown) => {
    try {
      momentsService.handleEvent({ type, ...(data as object) } as MomentsEvent);
    } catch (err) {
      console.warn(`[socketEventRouter] momentsService.handleEvent(${type}) error:`, err);
    }
  };
}

/**
 * Wire all message-related socket events into the repository.
 * Safe to call multiple times — subsequent calls are no-ops until unwired.
 * Returns an unwire function.
 */
export function wireSocketEvents(): () => void {
  if (_handlers) {
    // Already wired — return a no-op unwire
    return () => {};
  }

  _handlers = [
    { event: 'new_message', handler: makeNewMessageHandler() },
    { event: 'message_ack', handler: makeHandler('message_ack') },
    { event: 'message_deleted', handler: makeHandler('message_deleted') },
    { event: 'message_reaction', handler: makeHandler('message_reaction') },
    { event: 'message_updated', handler: makeHandler('message_updated') },
    // Moments story events — routed to momentsService
    { event: 'story.new', handler: makeMomentsHandler('story.new') },
    { event: 'story.deleted', handler: makeMomentsHandler('story.deleted') },
    { event: 'story.mention', handler: makeMomentsHandler('story.mention') },
    { event: 'story.reaction', handler: makeMomentsHandler('story.reaction') },
    { event: 'call_log_created', handler: makeCallLogHandler() },
    { event: 'call_log_updated', handler: makeCallLogHandler() },
  ];

  for (const { event, handler } of _handlers) {
    socketService.on(event, handler);
  }

  // Also bridge /webrtc call-log events (different namespace from /chat)
  wireWebrtcCallLogs();

  return () => {
    if (!_handlers) return;
    for (const { event, handler } of _handlers) {
      socketService.off(event, handler);
    }
    _handlers = null;
    unwireWebrtcCallLogs();
  };
}
