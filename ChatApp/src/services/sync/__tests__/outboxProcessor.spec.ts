/**
 * outboxProcessor.spec.ts
 *
 * Unit tests for outboxProcessor.
 * Mocks messagesApi, NetInfo, AppState, InteractionManager.
 * Target: ≥ 30 tests.
 */

import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../../db/connection';
import { runMigrations } from '../../db/migrations';
import * as outboxRepo from '../../db/outboxRepository';
import { classifyError, _resetStateForTesting } from '../outboxProcessor';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  InteractionManager: {
    // Do NOT call cb() immediately — let tests control when tick() runs
    runAfterInteractions: jest.fn(() => ({ cancel: jest.fn() })),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../../api/apiService', () => ({
  messagesApi: {
    send: jest.fn(),
    setReaction: jest.fn(),
    deleteMessage: jest.fn(),
    deleteForMe: jest.fn(),
    markRead: jest.fn(),
  },
}));

jest.mock('../../db/messageRepository', () => ({
  getById: jest.fn(() => null),
  markFailed: jest.fn(),
  confirmSend: jest.fn(),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: ReturnType<typeof open>;

beforeEach(() => {
  db = open({ name: `test_processor_${Date.now()}` });
  _setDbForTesting(db as any);
  runMigrations();
  jest.clearAllMocks();
  _resetStateForTesting();
});

afterEach(() => {
  _resetStateForTesting();
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

// ─── classifyError ────────────────────────────────────────────────────────────

describe('classifyError', () => {
  it('classifies AbortError as TIMEOUT (retryable)', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const result = classifyError(err);
    expect(result.code).toBe('TIMEOUT');
    expect(result.retryable).toBe(true);
  });

  it('classifies network error as NETWORK (retryable)', () => {
    const err = new Error('Network Error');
    const result = classifyError(err);
    expect(result.code).toBe('NETWORK');
    expect(result.retryable).toBe(true);
  });

  it('classifies 401 as retryable', () => {
    const err = { response: { status: 401 } };
    const result = classifyError(err);
    expect(result.code).toBe('401');
    expect(result.retryable).toBe(true);
  });

  it('classifies 403 as terminal', () => {
    const err = { response: { status: 403 } };
    const result = classifyError(err);
    expect(result.code).toBe('403');
    expect(result.retryable).toBe(false);
  });

  it('classifies 404 as terminal', () => {
    const err = { response: { status: 404 } };
    const result = classifyError(err);
    expect(result.code).toBe('404');
    expect(result.retryable).toBe(false);
  });

  it('classifies 429 as retryable', () => {
    const err = { response: { status: 429 } };
    const result = classifyError(err);
    expect(result.code).toBe('429');
    expect(result.retryable).toBe(true);
  });

  it('classifies 400 as terminal 4XX', () => {
    const err = { response: { status: 400 } };
    const result = classifyError(err);
    expect(result.code).toBe('4XX');
    expect(result.retryable).toBe(false);
  });

  it('classifies 500 as retryable 5XX', () => {
    const err = { response: { status: 500 } };
    const result = classifyError(err);
    expect(result.code).toBe('5XX');
    expect(result.retryable).toBe(true);
  });

  it('classifies SyntaxError as PARSE (terminal)', () => {
    const err = new SyntaxError('Unexpected token');
    const result = classifyError(err);
    expect(result.code).toBe('PARSE');
    expect(result.retryable).toBe(false);
  });

  it('classifies unknown error as NETWORK (retryable)', () => {
    const err = new Error('something weird');
    const result = classifyError(err);
    expect(result.code).toBe('NETWORK');
    expect(result.retryable).toBe(true);
  });
});

// ─── tick — single-flight ─────────────────────────────────────────────────────

describe('tick — single-flight', () => {
  it('does not double-process when called concurrently', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');

    // Fire two ticks concurrently
    const [r1, r2] = await Promise.all([tick(), tick()]);

    // messagesApi.send should be called at most once
    expect(messagesApi.send.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

// ─── tick — handler routing ───────────────────────────────────────────────────

describe('tick — handler routing', () => {
  it('routes send_message to messagesApi.send', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hello',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    expect(messagesApi.send).toHaveBeenCalledWith('conv1', expect.objectContaining({
      content: 'hello',
      clientMessageId: 'cmi1',
    }));
  });

  it('routes react to messagesApi.setReaction', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.setReaction.mockResolvedValue({});

    outboxRepo.enqueue('react', {
      conversationId: 'conv1',
      messageId: 'msg1',
      userId: 'user1',
      emoji: '👍',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    expect(messagesApi.setReaction).toHaveBeenCalledWith('conv1', 'msg1', '👍');
  });

  it('routes delete to messagesApi.deleteMessage', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.deleteMessage.mockResolvedValue({});

    outboxRepo.enqueue('delete', { conversationId: 'conv1', messageId: 'msg1' });

    const { tick } = require('../outboxProcessor');
    await tick();

    expect(messagesApi.deleteMessage).toHaveBeenCalledWith('conv1', 'msg1');
  });

  it('routes delete_for_me to messagesApi.deleteForMe', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.deleteForMe.mockResolvedValue({});

    outboxRepo.enqueue('delete_for_me', { conversationId: 'conv1', messageId: 'msg1' });

    const { tick } = require('../outboxProcessor');
    await tick();

    expect(messagesApi.deleteForMe).toHaveBeenCalledWith('conv1', 'msg1');
  });

  it('routes mark_read to messagesApi.markRead', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.markRead.mockResolvedValue({});

    outboxRepo.enqueue('mark_read', { conversationId: 'conv1', upToTimestamp: 1_700_000_000_000 });

    const { tick } = require('../outboxProcessor');
    await tick();

    expect(messagesApi.markRead).toHaveBeenCalledWith('conv1', expect.any(String));
  });
});

// ─── tick — error handling ────────────────────────────────────────────────────

describe('tick — error handling', () => {
  it('marks row retryable on NETWORK error', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockRejectedValue(new Error('Network Error'));

    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('pending');
    expect(row.retry_count).toBe(1);
  });

  it('marks row dead_letter on 403 error', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockRejectedValue({ response: { status: 403 } });

    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('dead_letter');
  });

  it('marks row done on success', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('done');
  });

  it('cascades dead_letter to reply when send_message fails terminally', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockRejectedValue({ response: { status: 403 } });

    // Parent
    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'parent_cmi',
      content: 'parent',
      type: 'text',
    });
    // Reply
    const replyId = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'reply_cmi',
      content: 'reply',
      type: 'text',
      replyTo: 'parent_cmi',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    const replyRow = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [replyId]).rows._array[0];
    expect(replyRow.state).toBe('dead_letter');
  });

  it('silently terminates 404 on non-send ops', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.deleteMessage.mockRejectedValue({ response: { status: 404 } });

    const id = outboxRepo.enqueue('delete', { conversationId: 'conv1', messageId: 'msg1' });

    const { tick } = require('../outboxProcessor');
    await tick();

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('dead_letter');
  });
});

// ─── tick — foreground-only gate ──────────────────────────────────────────────

describe('tick — foreground-only gate', () => {
  it('does not process when AppState is background', async () => {
    const { AppState } = require('react-native');
    AppState.currentState = 'background';

    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({});

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    expect(messagesApi.send).not.toHaveBeenCalled();

    // Restore
    AppState.currentState = 'active';
  });
});

// ─── pause / resume ───────────────────────────────────────────────────────────

describe('pause / resume', () => {
  it('pause prevents tick from processing', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({});

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { pause, tick } = require('../outboxProcessor');
    pause();
    await tick();

    expect(messagesApi.send).not.toHaveBeenCalled();
  });

  it('resume allows tick to process again', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({});

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { pause, resume, tick } = require('../outboxProcessor');
    pause();
    resume();
    await tick();

    expect(messagesApi.send).toHaveBeenCalled();
  });

  it('pause is idempotent', () => {
    const { pause } = require('../outboxProcessor');
    expect(() => { pause(); pause(); }).not.toThrow();
  });
});

// ─── tick — UNSUPPORTED_VERSION handler ───────────────────────────────────────

describe('tick — UNSUPPORTED_VERSION handler', () => {
  it('marks row dead_letter when no handler exists for payload_version', async () => {
    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    }, { payloadVersion: 99 }); // version 99 has no handler

    const { tick } = require('../outboxProcessor');
    await tick();

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('dead_letter');
    expect(row.last_error).toContain('UNSUPPORTED_VERSION');
  });
});

// ─── tick — 429 retryable ─────────────────────────────────────────────────────

describe('tick — 429 retryable', () => {
  it('marks row pending (retryable) on 429 response', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockRejectedValue({ response: { status: 429 } });

    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('pending');
    expect(row.last_error).toContain('429');
  });
});

// ─── tick — 401 retryable, no retry_count increment ──────────────────────────

describe('tick — 401 retryable, no retry_count increment', () => {
  it('marks row pending on 401 without incrementing retry_count', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockRejectedValue({ response: { status: 401 } });

    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('pending');
    expect(row.retry_count).toBe(0);
  });
});

// ─── tick — send_message 404 terminal ────────────────────────────────────────

describe('tick — send_message 404 terminal', () => {
  it('marks send_message row dead_letter on 404 (not silently terminal like other ops)', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockRejectedValue({ response: { status: 404 } });

    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    // 404 on send_message is NOT the silent-terminal path (that's only for non-send ops)
    // It falls through to the generic terminal path via classifyError → 404 → retryable=false
    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('dead_letter');
  });
});

// ─── tick — send_message passes replyTo to messagesApi.send ──────────────────

describe('tick — send_message with resolved replyTo', () => {
  it('passes replyTo to messagesApi.send when replyTo is a real id', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'reply msg',
      type: 'text',
      replyTo: 'real_parent_id',
    });

    const { tick } = require('../outboxProcessor');
    await tick();

    expect(messagesApi.send).toHaveBeenCalledWith('conv1', expect.objectContaining({
      replyTo: 'real_parent_id',
    }));
  });
});

// ─── pause / resume / isPaused ────────────────────────────────────────────────

describe('pause / resume / isPaused', () => {
  it('isPaused returns false by default', () => {
    const { isPaused } = require('../outboxProcessor');
    expect(isPaused()).toBe(false);
  });

  it('isPaused returns true after pause()', () => {
    const { pause, isPaused } = require('../outboxProcessor');
    pause();
    expect(isPaused()).toBe(true);
  });

  it('isPaused returns false after resume()', () => {
    const { pause, resume, isPaused } = require('../outboxProcessor');
    pause();
    resume();
    expect(isPaused()).toBe(false);
  });

  it('tick is a no-op when paused', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_paused',
      content: 'hi',
      type: 'text',
    });

    const { pause, tick } = require('../outboxProcessor');
    pause();
    await tick();

    expect(messagesApi.send).not.toHaveBeenCalled();
  });

  it('tick processes rows after resume()', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_resume',
      content: 'hi',
      type: 'text',
    });

    const { pause, resume, tick } = require('../outboxProcessor');
    pause();
    await tick(); // no-op
    expect(messagesApi.send).not.toHaveBeenCalled();

    resume();
    await tick();
    expect(messagesApi.send).toHaveBeenCalledTimes(1);
  });

  it('enqueue still works when paused (rows accumulate)', () => {
    const { pause } = require('../outboxProcessor');
    pause();

    const id = outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_acc',
      content: 'hi',
      type: 'text',
    });

    const row = (db as any).execute('SELECT * FROM outbox WHERE id = ?', [id]).rows._array[0];
    expect(row.state).toBe('pending');
  });
});

// ─── threshold logic ──────────────────────────────────────────────────────────

describe('threshold — sample < 10 suppresses logs', () => {
  it('does not pause when sample < 10 even if rate would be high', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    // 3 done + 5 dead_letter = 8 sample (< 10).
    // After tick processes 1 row successfully, done becomes 4, sample=9 → still < 10.
    for (let i = 0; i < 3; i++) outboxRepo.incrementMetric('done_total');
    for (let i = 0; i < 5; i++) outboxRepo.incrementMetric('dead_letter_total');
    // sample = 8 → suppressed even after tick adds 1 done (sample=9)

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_thresh',
      content: 'hi',
      type: 'text',
    });

    const { tick, isPaused } = require('../outboxProcessor');
    await tick();

    // Should NOT have paused (sample < 10 even after tick)
    expect(isPaused()).toBe(false);
  });
});

describe('threshold — auto-pause at 5%', () => {
  it('pauses processor when dead_letter_rate >= 5%', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    // 90 done + 10 dead_letter = 100 sample, rate = 10% → triggers pause
    for (let i = 0; i < 90; i++) outboxRepo.incrementMetric('done_total');
    for (let i = 0; i < 10; i++) outboxRepo.incrementMetric('dead_letter_total');

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_autopause',
      content: 'hi',
      type: 'text',
    });

    const { tick, isPaused } = require('../outboxProcessor');
    await tick();

    expect(isPaused()).toBe(true);
  });

  it('emits only rollback log at 5% (not threshold:error)', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    // 90 done + 10 dead_letter = 100 sample, rate = 10% → rollback only (>= 5%)
    // After tick adds 1 done: 91/101 ≈ 9.9% — still >= 5%, rollback fires
    for (let i = 0; i < 90; i++) outboxRepo.incrementMetric('done_total');
    for (let i = 0; i < 10; i++) outboxRepo.incrementMetric('dead_letter_total');

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_rollback_only',
      content: 'hi',
      type: 'text',
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { tick } = require('../outboxProcessor');
    await tick();

    // Capture calls before restoring
    const loggedEvents = consoleSpy.mock.calls
      .filter((args) => args[0] === '[outbox]')
      .map((args) => args[1] as string);

    consoleSpy.mockRestore();

    // rollback should fire
    expect(loggedEvents).toContain('rollback');
    // threshold:error should NOT fire at >= 5% (only fires at 3-5%)
    expect(loggedEvents).not.toContain('threshold:error');
  });
});

describe('threshold — info log at 2%, error log at 3%', () => {
  it('does not pause at 2% (only info log)', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    // 98 done + 2 dead_letter = 100 sample, rate = 2%
    for (let i = 0; i < 98; i++) outboxRepo.incrementMetric('done_total');
    for (let i = 0; i < 2; i++) outboxRepo.incrementMetric('dead_letter_total');

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_info',
      content: 'hi',
      type: 'text',
    });

    const { tick, isPaused } = require('../outboxProcessor');
    await tick();

    expect(isPaused()).toBe(false);
  });

  it('does not pause at 3% (only error log)', async () => {
    const { messagesApi } = require('../../api/apiService');
    messagesApi.send.mockResolvedValue({ _id: 'real1' });

    // 97 done + 3 dead_letter = 100 sample, rate = 3%
    for (let i = 0; i < 97; i++) outboxRepo.incrementMetric('done_total');
    for (let i = 0; i < 3; i++) outboxRepo.incrementMetric('dead_letter_total');

    outboxRepo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi_error',
      content: 'hi',
      type: 'text',
    });

    const { tick, isPaused } = require('../outboxProcessor');
    await tick();

    expect(isPaused()).toBe(false);
  });
});
