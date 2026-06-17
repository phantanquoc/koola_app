/**
 * useIsMounted.spec.ts
 *
 * Unit tests for the useIsMounted hook.
 *
 * Strategy: mock React's useRef/useEffect so the hook can be invoked directly
 * in Node without a renderer (matches useMessagesFromDb.spec.ts precedent).
 * We capture the effect + its cleanup to simulate mount/unmount transitions.
 */

// ─── React hook mocks (must come before any imports) ─────────────────────────

let capturedEffect: (() => void | (() => void)) | null = null;

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    // useRef: real-ish ref object so .current assignments persist
    useRef: jest.fn((init: unknown) => ({ current: init })),
    // useEffect: capture the effect so the test can run it on demand
    useEffect: jest.fn((fn: () => void | (() => void)) => {
      capturedEffect = fn;
    }),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { useIsMounted } from '../useIsMounted';

beforeEach(() => {
  capturedEffect = null;
});

describe('useIsMounted', () => {
  it('seeds true on first render before the effect runs', () => {
    const ref = useIsMounted();
    expect(ref.current).toBe(true);
  });

  it('stays true after the mount effect runs', () => {
    const ref = useIsMounted();
    expect(capturedEffect).not.toBeNull();
    capturedEffect!(); // run mount effect (no cleanup invoked yet)
    expect(ref.current).toBe(true);
  });

  it('flips to false when the cleanup runs (unmount)', () => {
    const ref = useIsMounted();
    const cleanup = capturedEffect!() as () => void;
    expect(typeof cleanup).toBe('function');
    cleanup();
    expect(ref.current).toBe(false);
  });

  it('re-affirms true on remount after an unmount', () => {
    const ref = useIsMounted();
    const cleanup = capturedEffect!() as () => void;
    cleanup();
    expect(ref.current).toBe(false);
    // Simulate a remount: effect runs again
    capturedEffect!();
    expect(ref.current).toBe(true);
  });
});
