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
import * as messageRepository from '../db/messageRepository';
import * as conversationRepository from '../db/conversationRepository';
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
  ];

  for (const { event, handler } of _handlers) {
    socketService.on(event, handler);
  }

  return () => {
    if (!_handlers) return;
    for (const { event, handler } of _handlers) {
      socketService.off(event, handler);
    }
    _handlers = null;
  };
}
