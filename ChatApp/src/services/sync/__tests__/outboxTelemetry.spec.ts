/**
 * outboxTelemetry.spec.ts
 *
 * Verifies that all outbox state-transition paths emit the correct
 * [outbox.<event>] log namespaces.
 *
 * Uses console.log spy to capture log calls.
 */

import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../../db/connection';
import { runMigrations } from '../../db/migrations';
import * as repo from '../../db/outboxRepository';

let db: ReturnType<typeof open>;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  db = open({ name: `test_telemetry_${Date.now()}` });
  _setDbForTesting(db as any);
  runMigrations();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

function getLoggedEvents(): string[] {
  return logSpy.mock.calls
    .filter((args) => args[0] === '[outbox]')
    .map((args) => args[1] as string);
}

// ─── Repository-level telemetry ───────────────────────────────────────────────

describe('outbox telemetry — repository events', () => {
  it('emits "enqueued" on enqueue', () => {
    repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi1',
      content: 'hi',
      type: 'text',
    });
    expect(getLoggedEvents()).toContain('enqueued');
  });

  it('emits "in_flight" on markInFlight', () => {
    const id = repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi2',
      content: 'hi',
      type: 'text',
    });
    logSpy.mockClear();
    repo.markInFlight(id);
    expect(getLoggedEvents()).toContain('in_flight');
  });

  it('emits "done" on markDone', () => {
    const id = repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi3',
      content: 'hi',
      type: 'text',
    });
    repo.markInFlight(id);
    logSpy.mockClear();
    repo.markDone(id);
    expect(getLoggedEvents()).toContain('done');
  });

  it('emits "retry_scheduled" on markRetryable', () => {
    const id = repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi4',
      content: 'hi',
      type: 'text',
    });
    repo.markInFlight(id);
    logSpy.mockClear();
    repo.markRetryable(id, { code: 'NETWORK', status: null, hint: 'net' });
    expect(getLoggedEvents()).toContain('retry_scheduled');
  });

  it('emits "dead_letter" on markDeadLetter', () => {
    const id = repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi5',
      content: 'hi',
      type: 'text',
    });
    repo.markInFlight(id);
    logSpy.mockClear();
    repo.markDeadLetter(id, { code: 'NETWORK', status: null, hint: 'net' });
    expect(getLoggedEvents()).toContain('dead_letter');
  });

  it('emits "pending_for_retry" on markPendingForRetry', () => {
    const id = repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'cmi6',
      content: 'hi',
      type: 'text',
    });
    repo.markInFlight(id);
    repo.markDeadLetter(id, { code: 'NETWORK', status: null, hint: 'net' });
    logSpy.mockClear();
    repo.markPendingForRetry(id);
    expect(getLoggedEvents()).toContain('pending_for_retry');
  });

  it('emits "watchdog_reset" on watchdogReset', () => {
    logSpy.mockClear();
    repo.watchdogReset({ now: Date.now() });
    expect(getLoggedEvents()).toContain('watchdog_reset');
  });

  it('emits "dead_letter" for each cascaded child', () => {
    repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'parent1',
      content: 'parent',
      type: 'text',
    });
    repo.enqueue('send_message', {
      conversationId: 'conv1',
      clientMessageId: 'child1',
      content: 'child',
      type: 'text',
      replyTo: 'temp_parent1',
    });
    logSpy.mockClear();
    repo.cascadeDeadLetter('parent1');
    expect(getLoggedEvents()).toContain('dead_letter');
  });
});

// ─── Threshold suppression ────────────────────────────────────────────────────

describe('outbox telemetry — dead_letter_rate suppression', () => {
  it('getDeadLetterRate returns rate=0 when sample < 10', () => {
    for (let i = 0; i < 5; i++) repo.incrementMetric('done_total');
    for (let i = 0; i < 4; i++) repo.incrementMetric('dead_letter_total');
    // sample = 9 → suppressed
    const { rate, sample } = repo.getDeadLetterRate();
    expect(rate).toBe(0);
    expect(sample).toBe(9);
  });
});
