/**
 * ChatScreen.failed-bubble.spec.tsx
 *
 * Unit tests for the dead-letter bubble handler logic.
 *
 * Full ChatScreen render is not feasible in the node test environment
 * (no jsdom, heavy native dependencies). Instead, we test the handler
 * functions directly by importing the repository modules and verifying
 * the correct calls are made.
 *
 * Test cases:
 *   1. failed bubble visual: message with status='failed' has isFailed=true
 *   2. tap → retry calls outboxRepository.markPendingForRetry + messageRepository.markPendingFromRetry
 *   3. long-press discard → calls outboxRepository.deleteRow + messageRepository.deleteById
 *   4. Discard removes both outbox row and message row
 *   5. Non-message ops (react/delete dead_letter) do NOT have message_id → no message row delete
 */

import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../../../services/db/connection';
import { runMigrations } from '../../../services/db/migrations';
import * as outboxRepo from '../../../services/db/outboxRepository';
import * as messageRepo from '../../../services/db/messageRepository';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// useCallback returns the function as-is so the hook can run in Node without a
// renderer (Strategy A — matches useMessagesFromDb.spec.ts precedent).
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useCallback: jest.fn((fn: unknown) => fn),
  };
});

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  InteractionManager: {
    runAfterInteractions: jest.fn(() => ({ cancel: jest.fn() })),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../../../services/sync/outboxProcessor', () => ({
  scheduleTick: jest.fn(),
  ensurePeriodicInterval: jest.fn(),
}));

import { useDeadLetterActions } from '../hooks/useDeadLetterActions';

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: ReturnType<typeof open>;

beforeEach(() => {
  db = open({ name: `test_failed_bubble_${Date.now()}` });
  _setDbForTesting(db as any);
  runMigrations();
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOutboxRow(id: string) {
  const result = (db as any).execute('SELECT * FROM outbox WHERE id = ? LIMIT 1', [id]);
  return result.rows._array.length > 0 ? result.rows._array[0] : null;
}

function getMessageRow(id: string) {
  const result = (db as any).execute('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
  return result.rows._array.length > 0 ? result.rows._array[0] : null;
}

// ─── Test 1: failed bubble visual ─────────────────────────────────────────────

describe('failed bubble visual', () => {
  it('a message with status=failed has isFailed=true (status field check)', () => {
    // Insert an optimistic message and mark it failed
    messageRepo.insertOptimistic({
      id: 'temp_cmi_fail',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_fail',
      type: 'text',
      content: 'hello',
      createdAt: Date.now(),
    });
    messageRepo.markFailed('temp_cmi_fail');

    const row = getMessageRow('temp_cmi_fail');
    expect(row).not.toBeNull();
    expect(row.status).toBe('failed');
    // isFailed in the UI is derived from msg.failed === true or status === 'failed'
    // The repository stores status='failed'; the UI maps this to isFailed
    const isFailed = row.status === 'failed';
    expect(isFailed).toBe(true);
  });

  it('a message with status=pending does NOT have isFailed=true', () => {
    messageRepo.insertOptimistic({
      id: 'temp_cmi_pending',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_pending',
      type: 'text',
      content: 'hello',
      createdAt: Date.now(),
    });

    const row = getMessageRow('temp_cmi_pending');
    expect(row).not.toBeNull();
    expect(row.status).toBe('pending');
    const isFailed = row.status === 'failed';
    expect(isFailed).toBe(false);
  });
});

// ─── Test 2: tap → retry calls correct repo functions ─────────────────────────

describe('retry handler', () => {
  it('markPendingForRetry resets the outbox row to pending', () => {
    const outboxId = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_retry',
      content: 'hi',
      type: 'text',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: 'NETWORK', status: null, hint: 'err' });

    expect(getOutboxRow(outboxId).state).toBe('dead_letter');

    outboxRepo.markPendingForRetry(outboxId);

    expect(getOutboxRow(outboxId).state).toBe('pending');
    expect(getOutboxRow(outboxId).retry_count).toBe(0);
    expect(getOutboxRow(outboxId).last_error).toBeNull();
  });

  it('markPendingFromRetry flips message row from failed to pending', () => {
    messageRepo.insertOptimistic({
      id: 'temp_cmi_retry',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_retry',
      type: 'text',
      content: 'hi',
      createdAt: Date.now(),
    });
    messageRepo.markFailed('temp_cmi_retry');
    expect(getMessageRow('temp_cmi_retry').status).toBe('failed');

    messageRepo.markPendingFromRetry('temp_cmi_retry');

    expect(getMessageRow('temp_cmi_retry').status).toBe('pending');
  });

  it('retry handler: outbox row goes to pending, message row goes to pending', () => {
    // Simulate the full retry flow
    const outboxId = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_full_retry',
      content: 'hi',
      type: 'text',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: '5XX', status: 500, hint: 'server err' });

    messageRepo.insertOptimistic({
      id: 'temp_cmi_full_retry',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_full_retry',
      type: 'text',
      content: 'hi',
      createdAt: Date.now(),
    });
    messageRepo.markFailed('temp_cmi_full_retry');

    // Simulate retry handler
    const rows = outboxRepo.getDeadLetterRows();
    const row = rows.find((r) => r.message_id === 'temp_cmi_full_retry' || r.id === outboxId);
    expect(row).toBeDefined();

    outboxRepo.markPendingForRetry(row!.id);
    messageRepo.markPendingFromRetry('temp_cmi_full_retry');

    expect(getOutboxRow(outboxId).state).toBe('pending');
    expect(getMessageRow('temp_cmi_full_retry').status).toBe('pending');
  });
});

// ─── Test 3 & 4: Discard removes both rows ────────────────────────────────────

describe('discard handler', () => {
  it('deleteRow removes the outbox row permanently', () => {
    const outboxId = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_discard',
      content: 'hi',
      type: 'text',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: 'NETWORK', status: null, hint: 'err' });

    expect(getOutboxRow(outboxId)).not.toBeNull();
    expect(outboxRepo.getDeadLetterRows().find((r) => r.id === outboxId)).toBeDefined();

    outboxRepo.deleteRow(outboxId);

    expect(getOutboxRow(outboxId)).toBeNull();
    expect(outboxRepo.getDeadLetterRows().find((r) => r.id === outboxId)).toBeUndefined();
  });

  it('deleteById removes the message row permanently', () => {
    messageRepo.insertOptimistic({
      id: 'temp_cmi_discard',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_discard',
      type: 'text',
      content: 'hi',
      createdAt: Date.now(),
    });
    expect(getMessageRow('temp_cmi_discard')).not.toBeNull();

    messageRepo.deleteById('temp_cmi_discard');

    expect(getMessageRow('temp_cmi_discard')).toBeNull();
  });

  it('discard handler removes both outbox row and message row', () => {
    const outboxId = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_both_discard',
      content: 'hi',
      type: 'text',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: 'NETWORK', status: null, hint: 'err' });

    messageRepo.insertOptimistic({
      id: 'temp_cmi_both_discard',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_both_discard',
      type: 'text',
      content: 'hi',
      createdAt: Date.now(),
    });
    messageRepo.markFailed('temp_cmi_both_discard');

    // Simulate discard handler
    const rows = outboxRepo.getDeadLetterRows();
    const row = rows.find((r) => r.message_id === 'temp_cmi_both_discard' || r.id === outboxId);
    expect(row).toBeDefined();

    outboxRepo.deleteRow(row!.id);
    messageRepo.deleteById('temp_cmi_both_discard');

    expect(getOutboxRow(outboxId)).toBeNull();
    expect(getMessageRow('temp_cmi_both_discard')).toBeNull();
  });
});

// ─── Test 5: Non-message ops do not render failure UI ─────────────────────────

describe('non-message ops dead_letter', () => {
  it('react dead_letter row has no message_id in messages table (no failure UI)', () => {
    // A react op dead_letter row has message_id = the target message, not a temp message
    // The failure UI (red border, retry) only applies to send_message ops with temp_ ids
    const outboxId = outboxRepo.enqueue('react', {
      conversationId: 'conv1',
      messageId: 'real_msg_id',
      userId: 'user1',
      emoji: '👍',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: 'NETWORK', status: null, hint: 'err' });

    const rows = outboxRepo.getDeadLetterRows();
    const row = rows.find((r) => r.id === outboxId);
    expect(row).toBeDefined();
    expect(row!.op_type).toBe('react');

    // The message_id for a react op is the real message id, not a temp_ id
    // So the failure UI should NOT render for this row (no temp_ prefix)
    const isTempMessage = row!.message_id?.startsWith('temp_') ?? false;
    expect(isTempMessage).toBe(false);
  });

  it('delete dead_letter row has no temp_ message_id (no failure UI)', () => {
    const outboxId = outboxRepo.enqueue('delete', {
      conversationId: 'conv1',
      messageId: 'real_msg_id_2',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: '403', status: 403, hint: 'too old' });

    const rows = outboxRepo.getDeadLetterRows();
    const row = rows.find((r) => r.id === outboxId);
    expect(row).toBeDefined();
    expect(row!.op_type).toBe('delete');

    const isTempMessage = row!.message_id?.startsWith('temp_') ?? false;
    expect(isTempMessage).toBe(false);
  });
});

// ─── Test 6: useDeadLetterActions hook drives the real handlers ───────────────
//
// As of the FIX-1 change, send_message outbox rows are enqueued with
// message_id = temp_<clientMessageId> (matching the optimistic messages-table
// row id), so the handler's `r.message_id === messageId` lookup matches failed
// text sends end-to-end — no manual setup needed.

describe('useDeadLetterActions hook', () => {
  it('handleRetryFailedMessage flips outbox + message rows back to pending', () => {
    const outboxId = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_hook_retry',
      content: 'hi',
      type: 'text',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: '5XX', status: 500, hint: 'err' });

    messageRepo.insertOptimistic({
      id: 'temp_cmi_hook_retry',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_hook_retry',
      type: 'text',
      content: 'hi',
      createdAt: Date.now(),
    });
    messageRepo.markFailed('temp_cmi_hook_retry');

    const { handleRetryFailedMessage } = useDeadLetterActions();
    handleRetryFailedMessage('temp_cmi_hook_retry');

    expect(getOutboxRow(outboxId).state).toBe('pending');
    expect(getMessageRow('temp_cmi_hook_retry').status).toBe('pending');
  });

  it('handleDiscardFailedMessage hard-deletes both rows', () => {
    const outboxId = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_hook_discard',
      content: 'hi',
      type: 'text',
    });
    outboxRepo.markInFlight(outboxId);
    outboxRepo.markDeadLetter(outboxId, { code: 'NETWORK', status: null, hint: 'err' });

    messageRepo.insertOptimistic({
      id: 'temp_cmi_hook_discard',
      conversationId: 'conv1',
      senderId: 'user1',
      clientMessageId: 'cmi_hook_discard',
      type: 'text',
      content: 'hi',
      createdAt: Date.now(),
    });
    messageRepo.markFailed('temp_cmi_hook_discard');

    const { handleDiscardFailedMessage } = useDeadLetterActions();
    handleDiscardFailedMessage('temp_cmi_hook_discard');

    expect(getOutboxRow(outboxId)).toBeNull();
    expect(getMessageRow('temp_cmi_hook_discard')).toBeNull();
  });

  it('handlers are no-ops (no throw) when the message id is unknown', () => {
    const { handleRetryFailedMessage, handleDiscardFailedMessage } =
      useDeadLetterActions();
    expect(() => handleRetryFailedMessage('temp_does_not_exist')).not.toThrow();
    expect(() => handleDiscardFailedMessage('temp_does_not_exist')).not.toThrow();
  });
});
