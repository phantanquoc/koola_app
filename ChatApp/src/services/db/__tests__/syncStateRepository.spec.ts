/**
 * syncStateRepository.spec.ts
 *
 * Unit tests for syncStateRepository.
 */

import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../connection';
import { runMigrations } from '../migrations';
import * as repo from '../syncStateRepository';

let db: ReturnType<typeof open>;

beforeEach(() => {
  db = open({ name: `test_sync_${Date.now()}` });
  _setDbForTesting(db as any);
  runMigrations();
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as any).close?.(); } catch {}
});

describe('syncStateRepository.getCursor / setCursor', () => {
  it('returns null when no cursor exists', () => {
    expect(repo.getCursor('global')).toBeNull();
  });

  it('stores and retrieves a cursor', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    repo.setCursor('global', iso);
    expect(repo.getCursor('global')).toBe(iso);
  });

  it('updates an existing cursor', () => {
    repo.setCursor('global', '2026-01-01T00:00:00.000Z');
    repo.setCursor('global', '2026-06-01T00:00:00.000Z');
    expect(repo.getCursor('global')).toBe('2026-06-01T00:00:00.000Z');
  });

  it('supports multiple keys independently', () => {
    repo.setCursor('global', 'ts_global');
    repo.setCursor('other', 'ts_other');
    expect(repo.getCursor('global')).toBe('ts_global');
    expect(repo.getCursor('other')).toBe('ts_other');
  });
});

describe('syncStateRepository.getValue / setValue', () => {
  it('stores and retrieves a generic value', () => {
    repo.setValue('backfill_done', 'true');
    expect(repo.getValue('backfill_done')).toBe('true');
  });
});

describe('syncStateRepository.clearAll', () => {
  it('removes all rows', () => {
    repo.setCursor('global', '2026-01-01T00:00:00.000Z');
    repo.setValue('backfill_done', 'true');
    repo.clearAll();
    expect(repo.getCursor('global')).toBeNull();
    expect(repo.getValue('backfill_done')).toBeNull();
  });
});
