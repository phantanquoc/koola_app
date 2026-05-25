/**
 * socketEventRouter.test.ts
 *
 * Verifies that wireSocketEvents() correctly routes socket events into
 * messageRepository.applySocketEvent, and that the returned unwire function
 * removes the listeners so subsequent events are ignored.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock SocketService with a simple EventEmitter-like interface
const _listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

jest.mock('../../socket/SocketService', () => ({
  socketService: {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(handler);
    }),
    off: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (_listeners[event]) {
        _listeners[event] = _listeners[event].filter((h) => h !== handler);
      }
    }),
  },
}));

const mockApplySocketEvent = jest.fn();

jest.mock('../../db/messageRepository', () => ({
  applySocketEvent: (...args: unknown[]) => mockApplySocketEvent(...args),
}));

// ─── Helper: emit a fake socket event ─────────────────────────────────────────

function emit(event: string, data: unknown): void {
  (_listeners[event] ?? []).forEach((h) => h(data));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Re-import after mocks are set up
import { wireSocketEvents } from '../socketEventRouter';

beforeEach(() => {
  // Clear listener registry and mock call history
  Object.keys(_listeners).forEach((k) => { _listeners[k] = []; });
  mockApplySocketEvent.mockClear();
  // Reset the module-level _handlers guard so each test starts fresh
  jest.resetModules();
});

describe('wireSocketEvents', () => {
  it('routes new_message to applySocketEvent', () => {
    const unwire = wireSocketEvents();

    const payload = {
      message: {
        _id: 'msg_1',
        conversationId: 'conv_1',
        senderId: 'user_2',
        type: 'text',
        content: 'Hello',
        createdAt: new Date().toISOString(),
        status: 'sent',
      },
    };

    emit('new_message', payload);

    expect(mockApplySocketEvent).toHaveBeenCalledWith({
      type: 'new_message',
      payload,
    });

    unwire();
  });

  it('routes message_reaction to applySocketEvent', () => {
    const unwire = wireSocketEvents();

    const payload = {
      messageId: 'msg_2',
      conversationId: 'conv_1',
      userId: 'user_3',
      emoji: '👍',
      action: 'add',
    };

    emit('message_reaction', payload);

    expect(mockApplySocketEvent).toHaveBeenCalledWith({
      type: 'message_reaction',
      payload,
    });

    unwire();
  });

  it('stops routing after unwire is called', () => {
    const unwire = wireSocketEvents();
    unwire();

    emit('new_message', { message: { _id: 'msg_3' } });

    expect(mockApplySocketEvent).not.toHaveBeenCalled();
  });

  it('is idempotent — calling wireSocketEvents twice does not double-register', () => {
    const unwire1 = wireSocketEvents();
    // Second call while already wired — should be a no-op
    const unwire2 = wireSocketEvents();

    const payload = { message: { _id: 'msg_4', conversationId: 'conv_1' } };
    emit('new_message', payload);

    // applySocketEvent should be called exactly once, not twice
    expect(mockApplySocketEvent).toHaveBeenCalledTimes(1);

    unwire1();
    unwire2();
  });
});
