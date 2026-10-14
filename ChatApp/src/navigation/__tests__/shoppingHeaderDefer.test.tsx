/**
 * Deferred header commit — regression test for the Fabric
 * "Cannot remove child at index 0" redbox when popping ShoppingProductDetail.
 *
 * Scenario: ProductDetail blurs (useFocusEffect cleanup sets headerConfig null)
 * at transitionStart. The stack must NOT immediately clear displayedHeaderConfig
 * (that would unmount ShoppingNotchHeader inside the same MountItem batch where
 * native-stack removes the Detail screen). Instead it queues the null and
 * commits it AFTER transitionEnd via a timer.
 *
 * The reducer below is a 1:1 mirror of the queue/defer/transition state machine
 * in ShoppingTabStack.tsx — if the state machine changes, this test must be
 * updated alongside it.
 */
import { act, create } from 'react-test-renderer';
import React from 'react';

type Config = { variant: 'product'; title: string } | null;

// ── Mirror of ShoppingTabStack's deferred-commit state machine ──────────────
function useDeferredHeaderCommit() {
  const [displayed, setDisplayed] = React.useState<Config>(null);
  const transitioningRef = React.useRef(false);
  const pendingRef = React.useRef<Config>(null);
  const hasPendingRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onHeaderConfig = React.useCallback((next: Config) => {
    if (transitioningRef.current) {
      pendingRef.current = next;
      hasPendingRef.current = true;
    } else {
      setDisplayed(next);
    }
  }, []);

  const commit = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      transitioningRef.current = false;
      if (hasPendingRef.current) {
        setDisplayed(pendingRef.current);
        hasPendingRef.current = false;
      } else {
        setDisplayed(null);
      }
    }, 0);
  }, []);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onTransitionStart = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    transitioningRef.current = true;
  }, []);

  const onTransitionEnd = React.useCallback(() => {
    commit();
  }, [commit]);

  return { displayed, onHeaderConfig, onTransitionStart, onTransitionEnd };
}

const Probe: React.FC<{
  api: React.MutableRefObject<ReturnType<typeof useDeferredHeaderCommit> | null>;
}> = ({ api }) => {
  const state = useDeferredHeaderCommit();
  api.current = state;
  return null;
};

describe('ShoppingTabStack deferred header commit', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps the product header mounted during pop, clears it after the deferred commit', () => {
    const api: React.MutableRefObject<ReturnType<typeof useDeferredHeaderCommit> | null> =
      React.createRef() as never;
    act(() => {
      create(<Probe api={api} />);
    });
    const product: Config = { variant: 'product', title: 'Chi tiết sản phẩm' };

    // Detail focused: header set synchronously.
    act(() => {
      api.current!.onHeaderConfig(product);
    });
    expect(api.current!.displayed).toEqual(product);

    // Pop starts: transitionStart, then blur cleanup sets config null.
    act(() => {
      api.current!.onTransitionStart();
      api.current!.onHeaderConfig(null);
    });
    // Header must STILL be mounted (queued, not committed).
    expect(api.current!.displayed).toEqual(product);

    // transitionEnd fires: commit is deferred, still mounted this frame.
    act(() => {
      api.current!.onTransitionEnd();
    });
    expect(api.current!.displayed).toEqual(product);

    // Deferred timer fires: header finally clears, one batch later.
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(api.current!.displayed).toBeNull();
  });

  it('flushes the queue on the next transitionEnd when a transition is interrupted (transitionStart fired twice)', () => {
    const api: React.MutableRefObject<ReturnType<typeof useDeferredHeaderCommit> | null> =
      React.createRef() as never;
    act(() => {
      create(<Probe api={api} />);
    });
    const product: Config = { variant: 'product', title: 'Chi tiết sản phẩm' };

    // First pop: Detail → Home with a timer pending.
    act(() => {
      api.current!.onHeaderConfig(product);
      api.current!.onTransitionStart();
      api.current!.onHeaderConfig(null);
      api.current!.onTransitionEnd();
    });
    // Before the timer fires, another transition starts (gesture) — cancel old timer.
    act(() => {
      api.current!.onTransitionStart();
    });
    // Header stays mounted until the next transitionEnd + timer.
    expect(api.current!.displayed).toEqual(product);
    act(() => {
      api.current!.onTransitionEnd();
      jest.runOnlyPendingTimers();
    });
    expect(api.current!.displayed).toBeNull();

    // Next push: transition starts first, so the product header is queued.
    act(() => {
      api.current!.onTransitionStart();
      api.current!.onHeaderConfig(product);
    });
    // Queued during transition → not yet visible.
    expect(api.current!.displayed).toBeNull();
    act(() => {
      api.current!.onTransitionEnd();
    });
    expect(api.current!.displayed).toBeNull(); // still deferred
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(api.current!.displayed).toEqual(product);
  });
});
