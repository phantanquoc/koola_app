import '@testing-library/react/dont-cleanup-after-each';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();

// The localStorage available in this toolchain is incomplete (no clear())
// — stub the subset tokenStorage uses, unconditionally.
vi.stubGlobal('localStorage', {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
} as Storage);

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  cleanup();
});
