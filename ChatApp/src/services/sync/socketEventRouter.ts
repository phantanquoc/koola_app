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
import type { SocketEvent } from '../db/messageRepository';

type EventCallback = (...args: unknown[]) => void;

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

let _handlers: Array<{ event: string; handler: EventCallback }> | null = null;

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
    { event: 'new_message', handler: makeHandler('new_message') },
    { event: 'message_ack', handler: makeHandler('message_ack') },
    { event: 'message_deleted', handler: makeHandler('message_deleted') },
    { event: 'message_reaction', handler: makeHandler('message_reaction') },
    { event: 'message_updated', handler: makeHandler('message_updated') },
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
