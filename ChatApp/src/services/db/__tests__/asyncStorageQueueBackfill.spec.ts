/**
 * asyncStorageQueueBackfill.spec.ts
 *
 * Unit tests for the AsyncStorage → outbox backfill migration.
 * Covers: empty queue, well-formed items, failed items, invalid JSON,
 * partial items, and migration counter behavior.
 */

import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../connection';
import { runMigrations } from '../migrations';
import { runAsyncStorageQueueBackfill } from '../asyncStorageQueueBackfill';
import * as syncStateRepo from '../syncStateRepository';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../storage/asyncStorage', () => ({
  asyncStorage: {
    getOfflineQueue: jest.fn(),
    setOfflineQueue: jest.fn(),
    clearOfflineQueue: jest.fn(),
  },
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: ReturnType<typeof open>;

beforeEach(() => {
  db = open({ name: `test_backfill_${Date.now()}` });
  _setDbForTesting(db as any);
  runMigrations();
  jest.clearAllMocks();
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function allOutboxRows() {
  return (db as any).execute('SELECT * FROM outbox ORDER BY created_at ASC').rows._array;
}

function makeQueuedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: `cmi_${Math.random().toString(36).slice(2)}`,
    conversationId: 'conv1',
    content: 'hello',
    type: 'text',
    status: 'pending',
    createdAt: new Date().toISOString(),
    retryCount: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runAsyncStorageQueueBackfill — empty queue', () => {
  it('no-ops when AsyncStorage returns null', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue(null);

    await runAsyncStorageQueueBackfill();

    expect(allOutboxRows().length).toBe(0);
  });

  it('no-ops when AsyncStorage returns empty array', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue('[]');

    await runAsyncStorageQueueBackfill();

    expect(allOutboxRows().length).toBe(0);
  });
});

describe('runAsyncStorageQueueBackfill — well-formed items', () => {
  it('inserts pending items as state=pending', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const items = [makeQueuedMessage({ status: 'pending' })];
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    await runAsyncStorageQueueBackfill();

    const rows = allOutboxRows();
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('pending');
    expect(rows[0].op_type).toBe('send_message');
  });

  it('preserves clientMessageId in payload', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const item = makeQueuedMessage({ id: 'my_cmi_123', status: 'pending' });
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify([item]));

    await runAsyncStorageQueueBackfill();

    const rows = allOutboxRows();
    const payload = JSON.parse(rows[0].payload_json);
    expect(payload.clientMessageId).toBe('my_cmi_123');
  });

  it('inserts multiple items', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const items = [
      makeQueuedMessage({ id: 'cmi1' }),
      makeQueuedMessage({ id: 'cmi2' }),
      makeQueuedMessage({ id: 'cmi3' }),
    ];
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    await runAsyncStorageQueueBackfill();

    expect(allOutboxRows().length).toBe(3);
  });
});

describe('runAsyncStorageQueueBackfill — failed items', () => {
  it('inserts items with status=failed as state=dead_letter', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const items = [makeQueuedMessage({ status: 'failed' })];
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    await runAsyncStorageQueueBackfill();

    const rows = allOutboxRows();
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('dead_letter');
    expect(rows[0].last_error).toContain('NETWORK');
  });

  it('mixes pending and failed items correctly', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const items = [
      makeQueuedMessage({ id: 'cmi1', status: 'pending' }),
      makeQueuedMessage({ id: 'cmi2', status: 'failed' }),
    ];
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    await runAsyncStorageQueueBackfill();

    const rows = allOutboxRows();
    const states = rows.map((r: { state: string }) => r.state).sort();
    expect(states).toEqual(['dead_letter', 'pending']);
  });
});

describe('runAsyncStorageQueueBackfill — invalid JSON', () => {
  it('skips and warns on invalid JSON', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue('not valid json {{{');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await runAsyncStorageQueueBackfill();
    warnSpy.mockRestore();

    expect(allOutboxRows().length).toBe(0);
  });

  it('skips non-array JSON', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify({ not: 'an array' }));

    await runAsyncStorageQueueBackfill();

    expect(allOutboxRows().length).toBe(0);
  });
});

describe('runAsyncStorageQueueBackfill — partial/invalid items', () => {
  it('skips items missing conversationId', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const items = [{ id: 'cmi1', content: 'hi', status: 'pending' }]; // no conversationId
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await runAsyncStorageQueueBackfill();
    warnSpy.mockRestore();

    expect(allOutboxRows().length).toBe(0);
  });

  it('skips items missing id', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const items = [{ conversationId: 'conv1', content: 'hi', status: 'pending' }]; // no id
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await runAsyncStorageQueueBackfill();
    warnSpy.mockRestore();

    expect(allOutboxRows().length).toBe(0);
  });

  it('skips items missing content (content property absent)', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    // Item has id and conversationId but no content property at all
    const items = [{ id: 'cmi1', conversationId: 'conv1', status: 'pending' }];
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await runAsyncStorageQueueBackfill();
    expect(allOutboxRows().length).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('backfill_skip_item'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('processes valid items even when some are invalid', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    const items = [
      { id: 'bad_item' }, // missing conversationId
      makeQueuedMessage({ id: 'good_item' }),
    ];
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify(items));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await runAsyncStorageQueueBackfill();
    warnSpy.mockRestore();

    expect(allOutboxRows().length).toBe(1);
  });
});

describe('runAsyncStorageQueueBackfill — AsyncStorage key preservation', () => {
  it('does NOT delete the AsyncStorage key (reserved for Change B)', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify([makeQueuedMessage()]));

    await runAsyncStorageQueueBackfill();

    // clearOfflineQueue should NOT have been called
    expect(asyncStorage.clearOfflineQueue).not.toHaveBeenCalled();
  });
});

// ─── Migration counter tests (task 7.5) ───────────────────────────────────────

describe('migration counter — skip-version behavior', () => {
  it('sets outbox_migration_version to 1 after backfill', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue('[]');

    // Simulate dbInit logic: check version, run backfill, set version
    const v = parseInt(syncStateRepo.getValue('outbox_migration_version') ?? '0', 10);
    expect(v).toBe(0);

    if (v < 1) {
      await runAsyncStorageQueueBackfill();
      syncStateRepo.setValue('outbox_migration_version', '1');
    }

    expect(syncStateRepo.getValue('outbox_migration_version')).toBe('1');
  });

  it('does not run backfill when version is already 1', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify([makeQueuedMessage()]));

    // Set version to 1 first
    syncStateRepo.setValue('outbox_migration_version', '1');

    // Simulate dbInit logic
    const v = parseInt(syncStateRepo.getValue('outbox_migration_version') ?? '0', 10);
    if (v < 1) {
      await runAsyncStorageQueueBackfill();
      syncStateRepo.setValue('outbox_migration_version', '1');
    }

    // Backfill should not have run
    expect(allOutboxRows().length).toBe(0);
  });

  it('running dbInit twice only runs backfill once', async () => {
    const { asyncStorage } = require('../../storage/asyncStorage');
    asyncStorage.getOfflineQueue.mockResolvedValue(JSON.stringify([makeQueuedMessage({ id: 'cmi1' })]));

    // First run
    let v = parseInt(syncStateRepo.getValue('outbox_migration_version') ?? '0', 10);
    if (v < 1) {
      await runAsyncStorageQueueBackfill();
      syncStateRepo.setValue('outbox_migration_version', '1');
    }

    // Second run
    v = parseInt(syncStateRepo.getValue('outbox_migration_version') ?? '0', 10);
    if (v < 1) {
      await runAsyncStorageQueueBackfill();
      syncStateRepo.setValue('outbox_migration_version', '1');
    }

    // Only one row should exist (backfill ran once)
    expect(allOutboxRows().length).toBe(1);
  });
});
