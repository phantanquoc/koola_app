/**
 * Tiny subscribable store backing the tab-dock suppression API.
 *
 * WHY a store instead of React state in MainNavigator: holding the boolean in
 * MainNavigator state put it in the context value, so every conversation
 * open/close (ChatScreen suppresses the dock) re-rendered MainNavigator and the
 * whole Tab.Navigator. With a store the context value is stable; only the
 * component that reads the boolean (CustomKoolaTabBar) subscribes via
 * useSyncExternalStore and re-renders.
 */
export type TabDockSuppressionStore = {
  /** Registers a suppressor; returns an idempotent release function. */
  suppress: () => () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
};

export function createTabDockSuppressionStore(): TabDockSuppressionStore {
  const suppressionIds = new Set<symbol>();
  const listeners = new Set<() => void>();
  let isSuppressed = false;

  const sync = () => {
    const next = suppressionIds.size > 0;
    if (next === isSuppressed) {
      return;
    }
    isSuppressed = next;
    // Copy so a listener that unsubscribes during notify can't skip others.
    Array.from(listeners).forEach((listener) => listener());
  };

  return {
    suppress: () => {
      const id = Symbol('tab-dock-suppression');
      suppressionIds.add(id);
      sync();
      return () => {
        // Set#delete is a no-op for an already-released id → double release is safe.
        suppressionIds.delete(id);
        sync();
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => isSuppressed,
  };
}

/** Fallback used outside a MainNavigator provider: never suppressed, no-op. */
export const noopTabDockSuppressionStore: TabDockSuppressionStore = {
  suppress: () => () => {},
  subscribe: () => () => {},
  getSnapshot: () => false,
};
