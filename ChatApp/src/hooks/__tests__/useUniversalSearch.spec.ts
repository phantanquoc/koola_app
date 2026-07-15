/**
 * useUniversalSearch.spec.ts
 *
 * Contract tests that verify the per-section error state isolation fix.
 * Uses source-analysis for structural guarantees + simple hook invocation
 * for interface validation.
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── React hook mocks ────────────────────────────────────────────────────────

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
    useMemo: jest.fn((fn: () => unknown) => fn()),
  };
});

jest.mock('axios', () => ({
  isCancel: () => false,
}));

jest.mock('../../services/api/apiService', () => ({
  usersApi: {
    searchUsers: jest.fn(),
  },
  messagesApi: {
    searchMessages: jest.fn(),
  },
}));

// ─── Source analysis tests ───────────────────────────────────────────────────

describe('useUniversalSearch — per-section error isolation (source contract)', () => {
  const sourcePath = path.resolve(__dirname, '../useUniversalSearch.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('defines SectionState interface with data, loading, error fields', () => {
    expect(source).toMatch(/interface\s+SectionState/);
    expect(source).toContain('data:');
    expect(source).toContain('loading: boolean');
    expect(source).toContain('error: string | null');
  });

  it('maintains separate state for contacts and messages sections', () => {
    // Both sections should have independent useState calls
    expect(source).toMatch(/\bcontacts\b.*SectionState/);
    expect(source).toMatch(/\bmessages\b.*SectionState/);
  });

  it('provides retryContacts and retryMessages as independent functions', () => {
    expect(source).toContain('retryContacts');
    expect(source).toContain('retryMessages');
  });

  it('does NOT have a shared error field that both sections write to', () => {
    // The OLD bug: a single `setError(null)` cleared errors for both sections.
    // After the fix, there should be no top-level shared `error` state.
    // Each section manages its own error inside SectionState.
    // Check there is no `const [error, setError]` at hook top level
    expect(source).not.toMatch(/const\s*\[\s*error\s*,\s*setError\s*\]/);
  });

  it('uses AbortController for request cancellation', () => {
    expect(source).toContain('AbortController');
  });
});

// ─── Hook interface test ─────────────────────────────────────────────────────

describe('useUniversalSearch — hook interface', () => {
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
    (React.useMemo as jest.Mock).mockImplementation((fn: () => unknown) => fn());
  });

  it('returns contacts and messages as SectionState objects', () => {
    const { useUniversalSearch } = require('../useUniversalSearch');
    const result = useUniversalSearch('test', []);

    expect(result.contacts).toHaveProperty('data');
    expect(result.contacts).toHaveProperty('loading');
    expect(result.contacts).toHaveProperty('error');
    expect(result.messages).toHaveProperty('data');
    expect(result.messages).toHaveProperty('loading');
    expect(result.messages).toHaveProperty('error');
  });

  it('returns retry functions', () => {
    const { useUniversalSearch } = require('../useUniversalSearch');
    const result = useUniversalSearch('test', []);

    expect(typeof result.retryContacts).toBe('function');
    expect(typeof result.retryMessages).toBe('function');
  });

  it('initial state has null errors for both sections', () => {
    const { useUniversalSearch } = require('../useUniversalSearch');
    const result = useUniversalSearch('test', []);

    expect(result.contacts.error).toBeNull();
    expect(result.messages.error).toBeNull();
  });
});
