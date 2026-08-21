/**
 * useInlineCallLogs.spec.ts — SQLite-first harness
 *
 * Hook now reads from callLogRepository.list() synchronously on mount
 * (instant first paint) and subscribes to SQLite invalidations; background
 * sync via syncCallLogsOnOpen runs off the critical path. Tests use the
 * in-memory op-sqlite mock so no REST mock is needed on the mount path.
 */

import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import { open } from '@op-engineering/op-sqlite';
import { _setDbForTesting } from '../../../../services/db/connection';
import { runMigrations } from '../../../../services/db/migrations';
import * as callLogRepository from '../../../../services/db/callLogRepository';
import { clearAll as clearBroadcaster } from '../../../../services/db/invalidationBroadcaster';
import type { CallLogInput } from '../../../../services/db/callLogRepository';

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void | undefined)) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      ReactActual.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [cb]);
    },
  };
});

// Sync is triggered fire-and-forget from the hook; mock it so tests control it.
const mockSync = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../services/sync/syncOrchestrator', () => ({
  syncCallLogsOnOpen: (...args: unknown[]) => mockSync(...args),
}));

import { useInlineCallLogs } from '../useInlineCallLogs';
import type { UseInlineCallLogsResult } from '../useInlineCallLogs';

// ─── Helpers ───────────────────────────────────────────────────────────────
function makeInput(id: string, overrides: Partial<CallLogInput> = {}): CallLogInput {
  const now = Date.now();
  return {
    id,
    sessionId: 'sess-' + id,
    conversationId: 'conv-1',
    initiatorId: 'user-A',
    targetUserId: 'user-B',
    callType: 'audio',
    status: 'ended',
    startedAt: now,
    duration: 60,
    ...overrides,
  };
}

function renderHook(conversationId: string) {
  const results: UseInlineCallLogsResult[] = [];
  const Harness: React.FC<{ cid: string }> = ({ cid }) => {
    results.push(useInlineCallLogs(cid, true));
    return null;
  };
  let tree!: { update: (el: React.ReactElement) => void; unmount: () => void };
  act(() => {
    tree = render(React.createElement(Harness, { cid: conversationId })) as typeof tree;
  });
  return {
    get current(): UseInlineCallLogsResult {
      return results[results.length - 1];
    },
    rerender(nextId: string) {
      act(() => {
        tree.update(React.createElement(Harness, { cid: nextId }));
      });
    },
    unmount() { act(() => tree.unmount()); },
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
  // Broadcaster flushes in a microtask
  await new Promise((r) => setTimeout(r, 0));
  await act(async () => { await Promise.resolve(); });
}

// ─── Setup in-memory DB ─────────────────────────────────────────────────
let db: ReturnType<typeof open>;

beforeEach(() => {
  db = open({ name: `test_inline_${Date.now()}_${Math.random()}` }) as ReturnType<typeof open>;
  _setDbForTesting(db as unknown as Parameters<typeof _setDbForTesting>[0]);
  runMigrations();
  clearBroadcaster();
  jest.clearAllMocks();
});

afterEach(() => {
  _setDbForTesting(null);
  try { (db as unknown as { close?: () => void }).close?.(); } catch {}
});

// ─── Tests ───────────────────────────────────────────────────────────────
describe('useInlineCallLogs — mount instant read (SQLite)', () => {
  it('reads from SQLite synchronously on mount (no REST)', async () => {
    callLogRepository.upsertMany([makeInput('log1')]);
    // Flush the pending notify microtask before mounting so list() sees the row
    await new Promise((r) => setTimeout(r, 0));
    const hook = renderHook('conv-1');
    // First render already has the row — no async fetch needed
    expect(hook.current.callLogs.length).toBe(1);
    expect(hook.current.callLogs[0]._id).toBe('log1');
    // Background sync was triggered off the critical path
    await flushMicrotasks();
    expect(mockSync).toHaveBeenCalledWith('conv-1');
  });

  it('shows empty when no rows yet, sync will populate', async () => {
    const hook = renderHook('conv-1');
    expect(hook.current.callLogs.length).toBe(0);
    await flushMicrotasks();
    expect(mockSync).toHaveBeenCalledWith('conv-1');
  });

  it('updates via subscription when a new log is upserted', async () => {
    const hook = renderHook('conv-1');
    await flushMicrotasks();
    expect(hook.current.callLogs.length).toBe(0);
    callLogRepository.upsertMany([makeInput('late')]);
    await flushMicrotasks();
    expect(hook.current.callLogs.length).toBe(1);
    expect(hook.current.callLogs[0]._id).toBe('late');
  });

  it('does not update for unrelated conversation', async () => {
    const hook = renderHook('conv-1');
    await flushMicrotasks();
    callLogRepository.upsertMany([makeInput('other', { conversationId: 'conv-other' })]);
    await flushMicrotasks();
    expect(hook.current.callLogs.length).toBe(0);
  });
});

describe('useInlineCallLogs — conversation change', () => {
  it('re-reads synchronously when conversationId changes', async () => {
    callLogRepository.upsertMany([makeInput('c1log', { conversationId: 'conv-1' })]);
    callLogRepository.upsertMany([makeInput('c2log', { conversationId: 'conv-2' })]);
    await new Promise((r) => setTimeout(r, 0));
    const hook = renderHook('conv-1');
    expect(hook.current.callLogs[0]._id).toBe('c1log');
    hook.rerender('conv-2');
    await flushMicrotasks();
    expect(hook.current.callLogs[0]._id).toBe('c2log');
  });
});

describe('useInlineCallLogs — loadMore and refresh', () => {
  it('loadMore paginates via SQLite cursor', async () => {
    const base = Date.now();
    const many = Array.from({ length: 60 }, (_, i) =>
      makeInput(`l${i}`, { startedAt: base + i * 1000 }),
    );
    callLogRepository.upsertMany(many);
    await new Promise((r) => setTimeout(r, 0));
    const hook = renderHook('conv-1');
    // First page is LIMIT (50)
    expect(hook.current.callLogs.length).toBe(50);
    expect(hook.current.hasMore).toBe(true);
    await act(async () => { await hook.current.loadMore(); });
    await flushMicrotasks();
    expect(hook.current.callLogs.length).toBe(60);
  });

  it('refresh forces background sync', async () => {
    const hook = renderHook('conv-1');
    await flushMicrotasks();
    jest.clearAllMocks();
    await act(async () => { await hook.current.refresh(); });
    expect(mockSync).toHaveBeenCalledWith('conv-1', { force: true });
  });
});
