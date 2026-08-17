/**
 * storageMaintenance.spec.ts
 *
 * Orchestrates prune → reap → bounded vacuum, gated on AppState and debounced.
 * Tests here mock the underlying repositories + db so we verify orchestration
 * without needing a real SQLite instance (the per-repo behavior is covered by
 * messageRepository.spec.ts / outboxRepository.spec.ts).
 */

import { AppState, InteractionManager } from 'react-native';

// Hoisted mocks — must be defined before the module under test imports them.
// Jest allows only identifiers prefixed with `mock` in jest.mock() factories.
const mockPrune = jest.fn();
const mockDeleteDone = jest.fn();
const mockDbExecute = jest.fn();
const mockDbHandle = { execute: mockDbExecute, transaction: jest.fn(), close: jest.fn() };
const mockRunAfterInteractions = jest.fn();

jest.mock('../messageRepository', () => ({
  pruneOldMessages: (...args: unknown[]) => mockPrune(...args),
}));

jest.mock('../outboxRepository', () => ({
  deleteDoneOlderThan: (...args: unknown[]) => mockDeleteDone(...args),
}));

jest.mock('../connection', () => ({
  getDb: () => mockDbHandle,
}));

import {
  runMaintenance,
  scheduleMaintenance,
  _resetForTesting,
} from '../storageMaintenance';

describe('storageMaintenance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    _resetForTesting();

    // Default AppState to active; tests override as needed.
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });

    // By default, InteractionManager.runAfterInteractions invokes immediately.
    mockRunAfterInteractions.mockImplementation((cb: () => void) => {
      cb();
      return { cancel: jest.fn() };
    });
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(mockRunAfterInteractions);

    // Default db.execute behaviour for account_state reads/writes used by
    // incrementalVacuumIfStale. Tests override per case.
    mockDbExecute.mockImplementation((sql: string) => {
      if (/SELECT value FROM account_state/i.test(sql)) {
        // No marker yet → triggers vacuum.
        return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
      }
      if (/INSERT INTO account_state/i.test(sql)) {
        return { rows: { _array: [], length: 0 }, rowsAffected: 1 };
      }
      if (/PRAGMA incremental_vacuum/i.test(sql)) {
        return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
      }
      return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    _resetForTesting();
  });

  describe('runMaintenance ordering', () => {
    it('calls prune then reap then vacuum in order when active', () => {
      const calls: string[] = [];
      mockPrune.mockImplementation(() => { calls.push('prune'); });
      mockDeleteDone.mockImplementation(() => { calls.push('reap'); });
      mockDbExecute.mockImplementation((sql: string) => {
        if (/PRAGMA incremental_vacuum/i.test(sql)) {
          calls.push('vacuum');
        }
        if (/SELECT value FROM account_state/i.test(sql)) {
          return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
        }
        if (/INSERT INTO account_state/i.test(sql)) {
          return { rows: { _array: [], length: 0 }, rowsAffected: 1 };
        }
        return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
      });

      runMaintenance();

      expect(calls).toEqual(['prune', 'reap', 'vacuum']);
    });

    it('skips entirely when AppState is not active', () => {
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        value: 'background',
      });

      runMaintenance();

      expect(mockPrune).not.toHaveBeenCalled();
      expect(mockDeleteDone).not.toHaveBeenCalled();
    });

    it('aborts mid-pass when app backgrounds between steps', () => {
      let state: string = 'active';
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        get: () => state,
      });

      mockPrune.mockImplementation(() => {
        // Background right after prune completes.
        state = 'background';
      });

      runMaintenance();

      expect(mockPrune).toHaveBeenCalledTimes(1);
      expect(mockDeleteDone).not.toHaveBeenCalled();
    });
  });

  describe('incremental vacuum once-per-day gate', () => {
    it('skips vacuum when marker was written less than 24h ago', () => {
      const recentMs = Date.now() - 60_000; // 1 minute ago
      mockDbExecute.mockImplementation((sql: string) => {
        if (/SELECT value FROM account_state/i.test(sql)) {
          return {
            rows: { _array: [{ value: String(recentMs) }], length: 1 },
            rowsAffected: 0,
          };
        }
        return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
      });

      runMaintenance();

      expect(mockDbExecute).not.toHaveBeenCalledWith(
        expect.stringMatching(/PRAGMA incremental_vacuum/i),
      );
    });

    it('runs vacuum and updates marker when stale (> 24h)', () => {
      const oldMs = Date.now() - 25 * 60 * 60 * 1000;
      let wroteMarker = false;
      mockDbExecute.mockImplementation((sql: string, params?: unknown[]) => {
        if (/SELECT value FROM account_state/i.test(sql)) {
          return {
            rows: { _array: [{ value: String(oldMs) }], length: 1 },
            rowsAffected: 0,
          };
        }
        if (/PRAGMA incremental_vacuum/i.test(sql)) {
          return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
        }
        if (/INSERT INTO account_state/i.test(sql)) {
          wroteMarker = true;
          // Marker value should be "now-ish" (within a few seconds).
          const val = Number((params as unknown[])[1]);
          expect(val).toBeGreaterThan(Date.now() - 5_000);
          expect(val).toBeLessThanOrEqual(Date.now());
          return { rows: { _array: [], length: 0 }, rowsAffected: 1 };
        }
        return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
      });

      runMaintenance();

      expect(wroteMarker).toBe(true);
    });

    it('swallows vacuum errors and still reports prune/reap completed', () => {
      mockDbExecute.mockImplementation((sql: string) => {
        if (/SELECT value FROM account_state/i.test(sql)) {
          return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
        }
        if (/PRAGMA incremental_vacuum/i.test(sql)) {
          throw new Error('disk I/O error');
        }
        return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => runMaintenance()).not.toThrow();
      expect(mockPrune).toHaveBeenCalledTimes(1);
      expect(mockDeleteDone).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[storageMaintenance]'),
        expect.any(Error),
      );

      warnSpy.mockRestore();
    });
  });

  describe('scheduleMaintenance debounce and foreground guard', () => {
    it('defers execution through InteractionManager after the debounce window', () => {
      const imCallback = jest.fn();
      mockRunAfterInteractions.mockImplementation((cb: () => void) => {
        imCallback.mockImplementation(cb);
        return { cancel: jest.fn() };
      });

      scheduleMaintenance();
      expect(mockPrune).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5_000);
      // IM callback captured but not yet invoked (we control that above).
      expect(imCallback).toBeDefined();
      expect(mockPrune).not.toHaveBeenCalled();

      imCallback();
      expect(mockPrune).toHaveBeenCalledTimes(1);
    });

    it('cancels pending timer when app backgrounds before debounce elapses', () => {
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        value: 'background',
      });

      scheduleMaintenance();
      jest.advanceTimersByTime(10_000);

      expect(mockPrune).not.toHaveBeenCalled();
      expect(mockRunAfterInteractions).not.toHaveBeenCalled();
    });

    it('debounces rapid calls into a single pass', () => {
      scheduleMaintenance();
      scheduleMaintenance();
      scheduleMaintenance();

      jest.advanceTimersByTime(5_000);

      expect(mockPrune).toHaveBeenCalledTimes(1);
    });
  });
});
