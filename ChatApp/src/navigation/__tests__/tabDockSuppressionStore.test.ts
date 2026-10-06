import {
  createTabDockSuppressionStore,
  noopTabDockSuppressionStore,
} from '../tabDockSuppressionStore';

describe('createTabDockSuppressionStore', () => {
  it('starts unsuppressed', () => {
    expect(createTabDockSuppressionStore().getSnapshot()).toBe(false);
  });

  it('stays suppressed until every suppressor releases', () => {
    const store = createTabDockSuppressionStore();
    const releaseA = store.suppress();
    const releaseB = store.suppress();
    expect(store.getSnapshot()).toBe(true);

    releaseA();
    expect(store.getSnapshot()).toBe(true);

    releaseB();
    expect(store.getSnapshot()).toBe(false);
  });

  it('treats double release as idempotent', () => {
    const store = createTabDockSuppressionStore();
    const releaseA = store.suppress();
    const releaseB = store.suppress();

    releaseA();
    releaseA();
    expect(store.getSnapshot()).toBe(true);

    releaseB();
    releaseB();
    expect(store.getSnapshot()).toBe(false);

    // A fresh suppressor after stray releases still works.
    const releaseC = store.suppress();
    expect(store.getSnapshot()).toBe(true);
    releaseC();
    expect(store.getSnapshot()).toBe(false);
  });

  it('notifies subscribers only when the suppressed state flips', () => {
    const store = createTabDockSuppressionStore();
    const listener = jest.fn();
    store.subscribe(listener);

    const releaseA = store.suppress(); // false → true
    expect(listener).toHaveBeenCalledTimes(1);

    const releaseB = store.suppress(); // still true
    releaseA(); // still true
    expect(listener).toHaveBeenCalledTimes(1);

    releaseB(); // true → false
    expect(listener).toHaveBeenCalledTimes(2);

    releaseB(); // no-op
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createTabDockSuppressionStore();
    const kept = jest.fn();
    const dropped = jest.fn();
    store.subscribe(kept);
    const unsubscribe = store.subscribe(dropped);

    unsubscribe();
    store.suppress();

    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('isolates state between store instances', () => {
    const a = createTabDockSuppressionStore();
    const b = createTabDockSuppressionStore();
    a.suppress();
    expect(a.getSnapshot()).toBe(true);
    expect(b.getSnapshot()).toBe(false);
  });
});

describe('noopTabDockSuppressionStore', () => {
  it('never suppresses and returns callable no-op release/unsubscribe', () => {
    const release = noopTabDockSuppressionStore.suppress();
    const unsubscribe = noopTabDockSuppressionStore.subscribe(jest.fn());
    expect(noopTabDockSuppressionStore.getSnapshot()).toBe(false);
    expect(() => {
      release();
      unsubscribe();
    }).not.toThrow();
  });
});
