/**
 * useMessagesFromDb.firstPaint.spec.ts
 *
 * Safety-net tests for the synchronous first-paint read path in useMessagesFromDb.
 *
 * Key invariant: messages are loaded from SQLite in the useState lazy initializer
 * (synchronous, at mount time) — NOT after a useEffect resolves. This means the
 * first render already has data, and syncOnOpen is non-blocking.
 *
 * Run via: npm test (default jest.config.js)
 */

// ─── React hook mocks (must come before any imports) ─────────────────────────
//
// Reuses the exact mocking pattern from useMessagesFromDb.spec.ts:
//   - useState: runs the lazy initializer synchronously, returns [value, jest.fn()]
//   - useEffect: no-op (effects are deferred; first-paint tests don't need them)
//   - useCallback: returns the function as-is
//   - useRef: returns { current: null }

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn((init: unknown) => [
      typeof init === 'function' ? (init as () => unknown)() : init,
      jest.fn(),
    ]),
    useEffect: jest.fn(),
    useCallback: jest.fn((fn: unknown) => fn),
    useRef: jest.fn(() => ({ current: null })),
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../../services/db/outboxRepository', () => ({
  enqueue: jest.fn(() => 'mock-outbox-id'),
}));

jest.mock('../../../../services/db/messageRepository', () => ({
  list: jest.fn(() => []),
  listBefore: jest.fn(() => []),
  insertOptimistic: jest.fn(),
  markFailed: jest.fn(),
  subscribe: jest.fn(() => () => {}),
  applySocketEvent: jest.fn(),
  softDeleteForUser: jest.fn(),
  getById: jest.fn(() => null),
  upsertMany: jest.fn(),
}));

jest.mock('../../../../services/sync/syncOrchestrator', () => ({
  // syncOnOpen returns a never-resolving promise to prove first-paint
  // does not depend on it resolving.
  syncOnOpen: jest.fn(() => new Promise(() => {})),
}));

jest.mock('react-native-gifted-chat', () => ({}));
jest.mock('react-native-css-interop', () => ({}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import * as messageRepository from '../../../../services/db/messageRepository';
import { useMessagesFromDb } from '../useMessagesFromDb';

const mockList = messageRepository.list as jest.Mock;

const CONV_ID = 'conv-fp-1';
const USER_ID = 'user-fp-1';
const BASE_TS = 1_700_000_000_000;

// ─── Seed data ────────────────────────────────────────────────────────────────
//
// DbMessage-shaped rows as returned by messageRepository.list.
// Fields match MessageInput (camelCase) since list() returns MessageInput[].

function makeDbRow(overrides: { id: string; status?: string; createdAt?: number }) {
  return {
    id: overrides.id,
    conversationId: CONV_ID,
    senderId: USER_ID,
    clientMessageId: null,
    type: 'text',
    content: `Message ${overrides.id}`,
    mediaKey: null,
    mediaMimeType: null,
    mediaSize: null,
    mediaDuration: null,
    mediaThumbnailKey: null,
    imageWidth: null,
    imageHeight: null,
    blurhash: null,
    createdAt: overrides.createdAt ?? BASE_TS,
    updatedAt: BASE_TS,
    status: overrides.status ?? 'sent',
    deleted: false,
    deletedFor: [],
    readBy: [],
    reactions: [],
    replyTo: null,
    replyToPreview: null,
  };
}

// ─── beforeEach: re-apply mocks after clearAllMocks ──────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Re-apply React hook mocks (clearAllMocks resets mockImplementation)
  const React = require('react');
  (React.useState as jest.Mock).mockImplementation((init: unknown) => [
    typeof init === 'function' ? (init as () => unknown)() : init,
    jest.fn(),
  ]);
  (React.useEffect as jest.Mock).mockImplementation(() => {});
  (React.useCallback as jest.Mock).mockImplementation((fn: unknown) => fn);
  (React.useRef as jest.Mock).mockImplementation(() => ({ current: null }));

  // Default: list returns empty array; individual tests override as needed.
  mockList.mockReturnValue([]);
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('useMessagesFromDb — first paint', () => {
  it('returns messages synchronously from DB at mount (useState initializer)', () => {
    const seeded = [
      makeDbRow({ id: 'fp_1', createdAt: BASE_TS + 2000 }),
      makeDbRow({ id: 'fp_2', createdAt: BASE_TS + 1000 }),
      makeDbRow({ id: 'fp_3', createdAt: BASE_TS }),
    ];
    mockList.mockReturnValue(seeded);

    const { messages } = useMessagesFromDb(CONV_ID, USER_ID);

    // Messages are present immediately — no async wait needed.
    expect(messages).toHaveLength(seeded.length);

    // list() was called with the correct args during the useState initializer.
    expect(mockList).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      currentUserId: USER_ID,
      limit: 50,
    });
  });

  it('maps DB row with status=pending → pending:true, sent:true, failed:false', () => {
    mockList.mockReturnValue([makeDbRow({ id: 'pending_msg', status: 'pending' })]);

    const { messages } = useMessagesFromDb(CONV_ID, USER_ID);

    expect(messages).toHaveLength(1);
    const msg = messages[0] as unknown as Record<string, unknown>;
    expect(msg.pending).toBe(true);
    expect(msg.sent).toBe(true);    // sent = status !== 'failed'
    expect(msg.failed).toBe(false);
  });

  it('maps DB row with status=failed → failed:true, sent:false, pending:false', () => {
    mockList.mockReturnValue([makeDbRow({ id: 'failed_msg', status: 'failed' })]);

    const { messages } = useMessagesFromDb(CONV_ID, USER_ID);

    expect(messages).toHaveLength(1);
    const msg = messages[0] as unknown as Record<string, unknown>;
    expect(msg.failed).toBe(true);
    expect(msg.sent).toBe(false);   // sent = status !== 'failed'
    expect(msg.pending).toBe(false);
  });

  it('maps DB row with status=sent → pending:false, sent:true, failed:false', () => {
    mockList.mockReturnValue([makeDbRow({ id: 'sent_msg', status: 'sent' })]);

    const { messages } = useMessagesFromDb(CONV_ID, USER_ID);

    expect(messages).toHaveLength(1);
    const msg = messages[0] as unknown as Record<string, unknown>;
    expect(msg.pending).toBe(false);
    expect(msg.sent).toBe(true);
    expect(msg.failed).toBe(false);
  });

  it('maps DB row → correct GiftedChat shape (_id, text, user._id, createdAt as Date)', () => {
    const row = makeDbRow({ id: 'shape_msg', createdAt: BASE_TS + 5000 });
    mockList.mockReturnValue([row]);

    const { messages } = useMessagesFromDb(CONV_ID, USER_ID);

    expect(messages).toHaveLength(1);
    const msg = messages[0] as unknown as Record<string, unknown>;

    expect(msg._id).toBe('shape_msg');
    expect(msg.text).toBe(`Message shape_msg`);
    expect((msg.user as Record<string, unknown>)._id).toBe(USER_ID);
    expect(msg.createdAt).toBeInstanceOf(Date);
    expect((msg.createdAt as Date).getTime()).toBe(BASE_TS + 5000);
  });

  it('first paint does NOT depend on syncOnOpen resolving', () => {
    // syncOnOpen is mocked to return a never-resolving promise.
    // useEffect is a no-op in this harness, so syncOnOpen is never even called.
    // Messages must be present regardless.
    const seeded = [makeDbRow({ id: 'no_sync_needed' })];
    mockList.mockReturnValue(seeded);

    const { messages } = useMessagesFromDb(CONV_ID, USER_ID);

    // Messages are present synchronously — sync is deferred and non-blocking.
    expect(messages).toHaveLength(1);
    expect(messages[0]._id).toBe('no_sync_needed');
  });
});
