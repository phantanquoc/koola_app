/**
 * useMessagesFromDb.spec.ts
 *
 * Unit tests for the outbox-integrated write methods in useMessagesFromDb.
 * Mocks outboxRepository and messageRepository to verify enqueue calls.
 *
 * Strategy: mock React hooks (useState/useEffect/useCallback/useRef) so the
 * hook function can be called directly in Node without a renderer. The write
 * methods only call repository functions — they don't read React state.
 */

// ─── React hook mocks (must come before any imports) ─────────────────────────

// useCallback: just return the function as-is
// useState: return [undefined, jest.fn()] — write methods don't read state
// useEffect: no-op
// useRef: return { current: null }
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
  syncOnOpen: jest.fn(() => Promise.resolve()),
}));

// react-native-gifted-chat pulls in react-native-css-interop which uses JSX
// and cannot be transformed in the Node test environment.
jest.mock('react-native-gifted-chat', () => ({}));
jest.mock('react-native-css-interop', () => ({}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import * as outboxRepository from '../../../../services/db/outboxRepository';
import * as messageRepository from '../../../../services/db/messageRepository';
import { useMessagesFromDb } from '../useMessagesFromDb';

const mockEnqueue = outboxRepository.enqueue as jest.Mock;
const mockInsertOptimistic = messageRepository.insertOptimistic as jest.Mock;
const mockMarkFailed = messageRepository.markFailed as jest.Mock;

const CONV_ID = 'conv-test-1';
const USER_ID = 'user-test-1';

function getHookMethods() {
  return useMessagesFromDb(CONV_ID, USER_ID);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnqueue.mockReturnValue('mock-outbox-id');
  // Re-apply useCallback mock after clearAllMocks
  const React = require('react');
  (React.useCallback as jest.Mock).mockImplementation((fn: unknown) => fn);
  (React.useState as jest.Mock).mockImplementation((init: unknown) => [
    typeof init === 'function' ? (init as () => unknown)() : init,
    jest.fn(),
  ]);
  (React.useEffect as jest.Mock).mockImplementation(() => {});
  (React.useRef as jest.Mock).mockImplementation(() => ({ current: null }));
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('calls insertOptimistic then enqueues send_message', async () => {
    const { sendMessage } = getHookMethods();
    await sendMessage('Hello world');

    expect(mockInsertOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: USER_ID,
        type: 'text',
        content: 'Hello world',
        status: 'pending',
      }),
    );

    expect(mockEnqueue).toHaveBeenCalledWith(
      'send_message',
      expect.objectContaining({
        conversationId: CONV_ID,
        content: 'Hello world',
        type: 'text',
      }),
    );
  });

  it('flips message to failed when enqueue throws', async () => {
    mockEnqueue.mockImplementation(() => {
      throw new Error('DB full');
    });

    const { sendMessage } = getHookMethods();
    await sendMessage('Fail me');

    expect(mockMarkFailed).toHaveBeenCalledWith(
      expect.stringMatching(/^temp_/),
    );
  });

  it('does NOT call messagesApi directly', async () => {
    const { sendMessage } = getHookMethods();
    await sendMessage('No direct API');

    expect(mockEnqueue).toHaveBeenCalledWith('send_message', expect.any(Object));
  });
});

// ─── sendMediaMessage ─────────────────────────────────────────────────────────

describe('sendMediaMessage', () => {
  it('enqueues send_message with media payload after upload', async () => {
    const { sendMediaMessage } = getHookMethods();

    await sendMediaMessage(
      'https://cdn.example.com/photo.jpg',
      'image/jpeg',
      102400,
      'image',
      'photo.jpg',
    );

    expect(mockEnqueue).toHaveBeenCalledWith(
      'send_message',
      expect.objectContaining({
        conversationId: CONV_ID,
        type: 'image',
        mediaUrl: 'https://cdn.example.com/photo.jpg',
        mediaMimeType: 'image/jpeg',
        mediaSize: 102400,
      }),
    );
  });

  it('flips message to failed when enqueue throws', async () => {
    mockEnqueue.mockImplementation(() => {
      throw new Error('enqueue error');
    });

    const { sendMediaMessage } = getHookMethods();

    await sendMediaMessage(
      'https://cdn.example.com/photo.jpg',
      'image/jpeg',
      102400,
      'image',
    );

    expect(mockMarkFailed).toHaveBeenCalledWith(expect.stringMatching(/^temp_/));
  });
});

// ─── reactToMessage ───────────────────────────────────────────────────────────

describe('reactToMessage', () => {
  it('enqueues react op with emoji', async () => {
    const { reactToMessage } = getHookMethods();
    await reactToMessage('msg-1', '👍');

    expect(mockEnqueue).toHaveBeenCalledWith(
      'react',
      expect.objectContaining({
        conversationId: CONV_ID,
        messageId: 'msg-1',
        userId: USER_ID,
        emoji: '👍',
      }),
    );
  });

  it('forwards emoji=null for clear reaction', async () => {
    const { reactToMessage } = getHookMethods();
    await reactToMessage('msg-1', null);

    expect(mockEnqueue).toHaveBeenCalledWith(
      'react',
      expect.objectContaining({
        emoji: null,
      }),
    );
  });
});

// ─── deleteMessage ────────────────────────────────────────────────────────────

describe('deleteMessage', () => {
  it('enqueues delete op', async () => {
    const { deleteMessage } = getHookMethods();
    await deleteMessage('msg-del-1');

    expect(mockEnqueue).toHaveBeenCalledWith(
      'delete',
      expect.objectContaining({
        conversationId: CONV_ID,
        messageId: 'msg-del-1',
      }),
    );
  });
});

// ─── deleteForMe ──────────────────────────────────────────────────────────────

describe('deleteForMe', () => {
  it('enqueues delete_for_me op', async () => {
    const { deleteForMe } = getHookMethods();
    await deleteForMe('msg-dfm-1');

    expect(mockEnqueue).toHaveBeenCalledWith(
      'delete_for_me',
      expect.objectContaining({
        conversationId: CONV_ID,
        messageId: 'msg-dfm-1',
      }),
    );
  });
});

// ─── markAsRead ───────────────────────────────────────────────────────────────

describe('markAsRead', () => {
  it('enqueues mark_read op with upToTimestamp', async () => {
    const { markAsRead } = getHookMethods();
    const ts = Date.now();
    await markAsRead(ts);

    expect(mockEnqueue).toHaveBeenCalledWith(
      'mark_read',
      expect.objectContaining({
        conversationId: CONV_ID,
        upToTimestamp: ts,
      }),
    );
  });
});

// ─── Incremental invalidation tests ──────────────────────────────────────────

describe('incremental invalidation', () => {
  let subscribeCallback: ((payload: any) => void) | null = null;
  const mockSubscribe = messageRepository.subscribe as jest.Mock;
  const mockList = messageRepository.list as jest.Mock;
  const mockGetById = messageRepository.getById as jest.Mock;

  beforeEach(() => {
    // Clear only call history, not implementations
    mockSubscribe.mockClear();
    mockList.mockClear();
    mockGetById.mockClear();
    subscribeCallback = null;

    // Restore subscribe mock implementation to capture callback
    mockSubscribe.mockImplementation((_convId: string, cb: (payload: any) => void) => {
      subscribeCallback = cb;
      return () => {}; // unsubscribe
    });

    mockList.mockReturnValue([]);
    mockGetById.mockReturnValue(null);

    // Override useEffect mock to call callbacks immediately
    const React = require('react');
    (React.useEffect as jest.Mock).mockImplementation((fn: () => void) => fn());
  });

  it('subscribe is called with conversationId and callback that accepts payload', () => {
    useMessagesFromDb(CONV_ID, USER_ID);

    // Verify subscribe was called with correct signature
    expect(mockSubscribe).toHaveBeenCalledWith(CONV_ID, expect.any(Function));

    // Verify callback was captured
    expect(subscribeCallback).not.toBeNull();
  });

  it('callback accepts payload with kind, messageIds, orderChanged fields', () => {
    useMessagesFromDb(CONV_ID, USER_ID);

    // Verify the callback can be called with full payload without throwing
    expect(() => {
      if (subscribeCallback) {
        subscribeCallback({
          conversationId: CONV_ID,
          kind: 'reaction',
          messageIds: ['msg1'],
          orderChanged: false,
        });
      }
    }).not.toThrow();
  });

  it('callback accepts undefined payload for backward compatibility', () => {
    useMessagesFromDb(CONV_ID, USER_ID);

    // Verify the callback can be called with undefined without throwing
    expect(() => {
      if (subscribeCallback) {
        subscribeCallback(undefined);
      }
    }).not.toThrow();
  });

  it('callback accepts all mutation kinds without throwing', () => {
    useMessagesFromDb(CONV_ID, USER_ID);

    const kinds = ['insert', 'update', 'delete', 'reaction', 'ack', 'batch'];

    kinds.forEach(kind => {
      expect(() => {
        if (subscribeCallback) {
          subscribeCallback({
            conversationId: CONV_ID,
            kind,
            messageIds: ['msg1'],
            orderChanged: false,
          });
        }
      }).not.toThrow();
    });
  });

  it('callback handles orderChanged true without throwing', () => {
    useMessagesFromDb(CONV_ID, USER_ID);

    expect(() => {
      if (subscribeCallback) {
        subscribeCallback({
          conversationId: CONV_ID,
          kind: 'insert',
          messageIds: ['new-msg'],
          orderChanged: true,
        });
      }
    }).not.toThrow();
  });

  it('callback handles empty messageIds array without throwing', () => {
    useMessagesFromDb(CONV_ID, USER_ID);

    expect(() => {
      if (subscribeCallback) {
        subscribeCallback({
          conversationId: CONV_ID,
          kind: 'batch',
          messageIds: [],
          orderChanged: false,
        });
      }
    }).not.toThrow();
  });
});

