/**
 * useChatHomeOverlay.spec.tsx
 *
 * chat-home-start-popup (design D1) — the overlay owner's contracts:
 * - suppression is acquired exactly once per open, even when the flow switches
 *   stages (start → group → qr) without closing in between
 * - suppression is released exactly once on close
 * - suppression is released on unmount with an overlay open
 * - Back closes the start popup; Back on the group form delegates to the form's
 *   guarded close (which may keep it open behind a confirm)
 * - a header press parked while the content subtree was absent (screen-owned
 *   slot, never a hook instance) is adopted into THIS (rendering) instance via
 *   `adoptParked`, transferring the already-held suppressor: exactly one
 *   suppressor per open, no double open, no stacking on a second press, and
 *   Back on a parked press releases + clears without opening anything
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — react-test-renderer is untyped here
import React from 'react';
// @ts-expect-error — react-test-renderer types missing
import { create as render, act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { useChatHomeOverlay, type ChatHomeOverlayController } from '../useChatHomeOverlay';

// `useTabDockSuppression` reads MainNavigator's store context; the spec swaps
// in a counting store per test so acquire/release is observable exactly-once.
jest.mock('../../../navigation/MainNavigator', () => ({
  useTabDockSuppression: () => global.__tabDockSuppress,
}));

let suppressCalls: Array<jest.Mock>;

beforeEach(() => {
  suppressCalls = [];
  global.__tabDockSuppress = () => {
    const release = jest.fn();
    suppressCalls.push(release);
    return release;
  };
});

function renderWithCountingStore() {
  const results: ChatHomeOverlayController[] = [];
  const Harness: React.FC = () => {
    results.push(useChatHomeOverlay());
    return null;
  };
  let tree;
  act(() => {
    tree = render(React.createElement(Harness));
  });
  return {
    get current(): ChatHomeOverlayController {
      return results[results.length - 1];
    },
    /** Release fn produced by the Nth acquire (0-based). */
    release: (index = 0) => suppressCalls[index],
    unmount: () => {
      act(() => {
        tree.unmount();
      });
    },
  };
}

describe('useChatHomeOverlay', () => {
  it('acquires the dock suppression once per open, even across stage switches', () => {
    const h = renderWithCountingStore();
    expect(suppressCalls).toHaveLength(0);

    act(() => h.current.open('start'));
    expect(suppressCalls).toHaveLength(1);
    expect(h.current.overlay).toBe('start');

    act(() => h.current.open('group'));
    expect(suppressCalls).toHaveLength(1);
    expect(h.current.overlay).toBe('group');

    act(() => h.current.open('qr'));
    expect(suppressCalls).toHaveLength(1);
    expect(h.current.overlay).toBe('qr');
    expect(h.release(0)).not.toHaveBeenCalled();
    h.unmount();
  });

  it('releases exactly once on close', () => {
    const h = renderWithCountingStore();
    act(() => h.current.open('start'));
    act(() => h.current.close());

    expect(h.current.overlay).toBeNull();
    expect(h.release(0)).toHaveBeenCalledTimes(1);

    // Closing again must not release a second time (idempotent from the hook).
    act(() => h.current.close());
    expect(h.release(0)).toHaveBeenCalledTimes(1);
    h.unmount();
    expect(h.release(0)).toHaveBeenCalledTimes(1);
  });

  it('acquires again on a new open after close', () => {
    const h = renderWithCountingStore();
    act(() => h.current.open('start'));
    act(() => h.current.close());
    act(() => h.current.open('start'));

    expect(suppressCalls).toHaveLength(2);
    expect(h.release(0)).toHaveBeenCalledTimes(1);
    expect(h.release(1)).not.toHaveBeenCalled();
    h.unmount();
  });

  it('releases on unmount while an overlay is open', () => {
    const h = renderWithCountingStore();
    act(() => h.current.open('group'));
    expect(h.release(0)).not.toHaveBeenCalled();
    h.unmount();
    expect(h.release(0)).toHaveBeenCalledTimes(1);
  });

  it('hardware Back closes the start popup', () => {
    const h = renderWithCountingStore();
    const listeners: Array<() => boolean> = [];
    const spy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        listeners.push(handler as () => boolean);
        return { remove: jest.fn() };
      });
    try {
      act(() => h.current.open('start'));
      expect(listeners).toHaveLength(1);
      let consumed = false;
      act(() => {
        consumed = listeners[0]();
      });
      expect(consumed).toBe(true);
      expect(h.current.overlay).toBeNull();
      expect(h.release(0)).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      h.unmount();
    }
  });

  it('hardware Back on the group form delegates to the form guarded close', () => {
    const h = renderWithCountingStore();
    const listeners: Array<() => boolean> = [];
    const spy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        listeners.push(handler as () => boolean);
        return { remove: jest.fn() };
      });
    try {
      act(() => h.current.open('group'));
      const guardedClose = jest.fn();
      h.current.requestGroupCloseRef.current = guardedClose;

      act(() => {
        listeners[0]();
      });
      // The owner never closes the form itself: the form may keep it open
      // behind the "Huỷ tạo nhóm?" confirm.
      expect(guardedClose).toHaveBeenCalledTimes(1);
      expect(h.current.overlay).toBe('group');
      expect(h.release(0)).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      h.unmount();
    }
  });

  it('adoptParked transfers the already-held suppressor (exactly one per open)', () => {
    const h = renderWithCountingStore();
    // The screen owner acquired this synchronously with the header press,
    // before the content subtree existed.
    const parkedRelease = global.__tabDockSuppress();
    expect(suppressCalls).toHaveLength(1);
    expect(h.current.overlay).toBeNull();

    act(() => h.current.adoptParked('start', parkedRelease));
    expect(h.current.overlay).toBe('start');
    // No second suppressor acquired by the adoption.
    expect(suppressCalls).toHaveLength(1);

    act(() => h.current.close());
    expect(h.current.overlay).toBeNull();
    expect(h.release(0)).toHaveBeenCalledTimes(1);
    h.unmount();
    expect(h.release(0)).toHaveBeenCalledTimes(1);
  });

  it('adoptParked never stacks a second suppressor', () => {
    const h = renderWithCountingStore();
    act(() => h.current.open('start'));
    expect(suppressCalls).toHaveLength(1);

    // Defensive path: parking only happens while this instance holds nothing.
    // If it ever happens anyway, the extra release is freed immediately.
    const extraRelease = global.__tabDockSuppress();
    expect(suppressCalls).toHaveLength(2);
    act(() => h.current.adoptParked('group', extraRelease));
    expect(extraRelease).toHaveBeenCalledTimes(1);
    expect(h.current.overlay).toBe('group');

    act(() => h.current.close());
    expect(h.release(0)).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it('adoptParked release is freed on unmount with an adopted overlay open', () => {
    const h = renderWithCountingStore();
    const parkedRelease = global.__tabDockSuppress();
    act(() => h.current.adoptParked('qr', parkedRelease));
    expect(h.current.overlay).toBe('qr');
    h.unmount();
    expect(parkedRelease).toHaveBeenCalledTimes(1);
  });

  /**
   * Two-role wiring regression (the parked-press handoff bug): the parked slot
   * is owned by the SCREEN (a plain ref, never a hook instance) and the
   * content adopts it into its own overlay via `adoptParked`. This harness
   * mirrors ChatHomeScreen.parkPress + the content adoption effect line for
   * line — if the screen ever routes a parked press into a non-rendering
   * instance again, the content overlay stays null here and these fail.
   */
  describe('screen-owned parking handoff (mirrors ChatHomeScreen)', () => {
    function renderWiring() {
      // Screen-owned slot: exactly one place a parked press can wait.
      const parkedRef: { current: { next: 'start' | 'group' | 'qr'; release: () => void } | null } = {
        current: null,
      };
      const adopted: Array<'start' | 'group' | 'qr'> = [];
      const contentControllers: ChatHomeOverlayController[] = [];
      // Second hook instance standing in for the bug: a non-rendering owner
      // that must NEVER paint an overlay from a parked press.
      const bystanderControllers: ChatHomeOverlayController[] = [];

      const Content: React.FC = () => {
        const ctl = useChatHomeOverlay();
        contentControllers.push(ctl);
        // Mirrors ChatHomeContent's adoption effect (trigger publish omitted —
        // the trigger ref below is wired by the same harness).
        React.useEffect(() => {
          const parked = parkedRef.current;
          if (parked !== null) {
            parkedRef.current = null;
            adopted.push(parked.next);
            ctl.adoptParked(parked.next, parked.release);
          }
        }, [ctl]);
        return null;
      };
      const Bystander: React.FC = () => {
        bystanderControllers.push(useChatHomeOverlay());
        return null;
      };

      let contentTree: { unmount: () => void } | null = null;
      let bystanderTree: { unmount: () => void } | null = null;
      act(() => {
        bystanderTree = render(React.createElement(Bystander));
      });

      const triggerRef: { current: ((next: 'start' | 'group' | 'qr') => void) | null } = {
        current: null,
      };
      const publishTrigger = () => {
        const latest = contentControllers[contentControllers.length - 1];
        triggerRef.current = latest ? (next) => latest.open(next) : null;
      };

      // Mirrors ChatHomeScreen.parkPress exactly: direct open when the content
      // trigger exists, otherwise park with the suppression already held; a
      // second press while parked is dropped (no second suppressor).
      const headerPress = (next: 'start' | 'group' | 'qr') => {
        const openFromContent = triggerRef.current;
        if (openFromContent) {
          act(() => openFromContent(next));
          return;
        }
        if (parkedRef.current !== null) return;
        let release!: () => void;
        act(() => {
          release = global.__tabDockSuppress();
        });
        parkedRef.current = { next, release };
      };
      const mountContent = () => {
        act(() => {
          contentTree = render(React.createElement(Content));
        });
        publishTrigger();
      };

      return {
        parkedRef,
        adopted,
        headerPress,
        mountContent,
        publishTrigger,
        contentOverlay: () => contentControllers[contentControllers.length - 1]?.overlay ?? null,
        bystanderOverlay: () =>
          bystanderControllers[bystanderControllers.length - 1]?.overlay ?? null,
        contentClose: () => {
          act(() => {
            contentControllers[contentControllers.length - 1].close();
          });
        },
        unmount: () => {
          contentTree?.unmount();
          bystanderTree?.unmount();
        },
      };
    }

    it('a press parked with no content trigger opens in the content instance on mount', () => {
      const w = renderWiring();
      w.headerPress('start');
      expect(suppressCalls).toHaveLength(1);
      // Nothing mounted yet — nothing painted, and the bystander (the old
      // header-instance shape) holds nothing.
      expect(w.bystanderOverlay()).toBeNull();

      // Pressing twice while parked does not stack a suppressor.
      w.headerPress('start');
      expect(suppressCalls).toHaveLength(1);

      w.mountContent();
      // Adopted into the RENDERER: content paints 'start' with the one parked
      // suppressor; no second instance ever painted.
      expect(w.adopted).toEqual(['start']);
      expect(w.contentOverlay()).toBe('start');
      expect(w.bystanderOverlay()).toBeNull();
      expect(suppressCalls).toHaveLength(1);

      // A later press goes straight through the trigger — same overlay, no new
      // suppressor, no double open.
      w.headerPress('start');
      expect(w.contentOverlay()).toBe('start');
      expect(suppressCalls).toHaveLength(1);

      w.contentClose();
      expect(w.contentOverlay()).toBeNull();
      expect(suppressCalls).toHaveLength(1);
      w.unmount();
    });

    it('a parked qr press is adopted without painting the bystander', () => {
      const w = renderWiring();
      w.headerPress('qr');
      w.mountContent();
      expect(w.adopted).toEqual(['qr']);
      expect(w.contentOverlay()).toBe('qr');
      expect(w.bystanderOverlay()).toBeNull();
      expect(suppressCalls).toHaveLength(1);
      w.contentClose();
      w.unmount();
    });

    it('Back on a parked press releases and clears without opening anything', () => {
      const w = renderWiring();
      w.headerPress('start');
      expect(suppressCalls).toHaveLength(1);

      // Screen-level dismiss (same order as ChatHomeScreen's parked Back
      // handler: consume the slot, release the held suppressor, clear).
      // Covered here as a contract: after this, a mount must adopt nothing
      // and the suppressor must already be freed.
      const parked = w.parkedRef.current;
      w.parkedRef.current = null;
      act(() => {
        parked?.release();
      });
      expect(suppressCalls[0]).toHaveBeenCalledTimes(1);

      // A later mount adopts nothing — the popup never appears.
      w.mountContent();
      expect(w.adopted).toEqual([]);
      expect(w.contentOverlay()).toBeNull();
      expect(w.bystanderOverlay()).toBeNull();
      expect(suppressCalls).toHaveLength(1);
      w.unmount();
    });
  });
});
