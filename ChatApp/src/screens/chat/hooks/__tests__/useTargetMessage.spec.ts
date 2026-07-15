/**
 * useTargetMessage.spec.ts
 *
 * Contract tests for the useTargetMessage hook.
 * Uses source-analysis for structural guarantees + simple hook invocation
 * for interface validation (same pattern as useUniversalSearch.spec.ts).
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── React hook mocks (simple, no external variables) ────────────────────────

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
    useRef: jest.fn((init: unknown) => ({ current: init })),
  };
});

// react-native-gifted-chat pulls in native modules
jest.mock('react-native-gifted-chat', () => ({}));
jest.mock('react-native-css-interop', () => ({}));

jest.mock('../../../../services/api/apiService', () => ({
  messagesApi: {
    getMessagesAround: jest.fn(),
  },
}));

// ─── Source analysis tests ───────────────────────────────────────────────────

describe('useTargetMessage — source contract', () => {
  const sourcePath = path.resolve(__dirname, '../useTargetMessage.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('exports TargetMessageState interface with all required fields', () => {
    expect(source).toContain('export interface TargetMessageState');
    expect(source).toContain('contextMessages:');
    expect(source).toContain('highlightId:');
    expect(source).toContain('isLoading:');
    expect(source).toContain('error:');
    expect(source).toContain('hasBefore:');
    expect(source).toContain('hasAfter:');
    expect(source).toContain('clearHighlight:');
  });

  it('calls getMessagesAround with conversationId, targetMessageId, 30', () => {
    expect(source).toMatch(/getMessagesAround\(conversationId,\s*targetMessageId,\s*30\)/);
  });

  it('uses fetchedRef to prevent re-fetching same target', () => {
    expect(source).toContain('fetchedRef.current === targetMessageId');
    expect(source).toContain('fetchedRef.current = targetMessageId');
  });

  it('sets Vietnamese error message on catch', () => {
    expect(source).toContain('Không thể tải tin nhắn đã chọn');
  });

  it('sorts messages newest-first for GiftedChat', () => {
    // GiftedChat expects descending createdAt
    expect(source).toMatch(/sort\(\s*\(a,\s*b\)\s*=>/);
    expect(source).toMatch(/b\.createdAt.*-.*a\.createdAt/);
  });

  it('filters out deletedFor messages for current user', () => {
    expect(source).toMatch(/deletedFor\?\.includes\(currentUserId\)/);
  });

  it('has cancellation logic with cancelled flag', () => {
    expect(source).toContain('let cancelled = false');
    expect(source).toContain('if (cancelled) return');
    expect(source).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*cancelled\s*=\s*true/);
  });

  it('returns early when no targetMessageId', () => {
    expect(source).toMatch(/if\s*\(!targetMessageId\)\s*return/);
  });
});

// ─── Hook interface test ─────────────────────────────────────────────────────

describe('useTargetMessage — hook interface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const React = require('react');
    (React.useState as jest.Mock).mockImplementation((init: unknown) => [
      typeof init === 'function' ? (init as () => unknown)() : init,
      jest.fn(),
    ]);
    (React.useEffect as jest.Mock).mockImplementation(() => {});
    (React.useCallback as jest.Mock).mockImplementation((fn: unknown) => fn);
    (React.useRef as jest.Mock).mockImplementation((init: unknown) => ({ current: init }));
  });

  it('returns null state when no targetMessageId', () => {
    const { useTargetMessage } = require('../useTargetMessage');
    const result = useTargetMessage('conv1', 'user1', undefined);

    expect(result.contextMessages).toBeNull();
    expect(result.highlightId).toBeNull();
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeNull();
    expect(result.hasBefore).toBe(false);
    expect(result.hasAfter).toBe(false);
  });

  it('provides clearHighlight as a callable function', () => {
    const { useTargetMessage } = require('../useTargetMessage');
    const result = useTargetMessage('conv1', 'user1', undefined);

    expect(typeof result.clearHighlight).toBe('function');
    // Should not throw when called
    expect(() => result.clearHighlight()).not.toThrow();
  });

  it('has complete interface shape', () => {
    const { useTargetMessage } = require('../useTargetMessage');
    const result = useTargetMessage('conv1', 'user1', 'target1');

    expect(result).toHaveProperty('contextMessages');
    expect(result).toHaveProperty('highlightId');
    expect(result).toHaveProperty('isLoading');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('hasBefore');
    expect(result).toHaveProperty('hasAfter');
    expect(result).toHaveProperty('clearHighlight');
  });
});
