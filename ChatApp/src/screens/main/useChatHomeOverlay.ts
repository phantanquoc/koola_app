/**
 * useChatHomeOverlay.ts
 *
 * Single overlay owner for Chat Home. Exactly one overlay is open at a time
 * from {start popup, group form, QR scanner}; this hook is the only writer of
 * that state, of the hardware-Back listener and of the tab-dock suppressor.
 *
 * Why one owner (chat-home-start-popup D1):
 * - Two dialogs each registering a `hardwareBackPress` listener both returning
 *   `true` is order-dependent on Android; one listener makes Back single-writer.
 * - Separate booleans (`qrVisible`, `groupModalVisible`) allow impossible states
 *   (`qr` + `group` open together) and give no single place to release the dock
 *   suppression.
 *
 * Suppression is acquired synchronously inside `open()` (mirrors
 * `useConversationQuickActions.openSheet`): an effect would hide the dock one
 * frame late, after the overlay has already painted. `close()` releases it
 * exactly once; an unmount safety net covers the screen going away mid-overlay.
 */
import React from 'react';
import { BackHandler } from 'react-native';
import { acquireBackIntercept } from '../../services/nativeBack';
import { useTabDockSuppression } from '../../navigation/MainNavigator';

export type ChatHomeOverlay = 'start' | 'group' | 'qr';

/** Asked by the owner when hardware Back is pressed while the group form is up. */
export type GroupCloseRequester = () => void;

export interface ChatHomeOverlayController {
  overlay: ChatHomeOverlay | null;
  /** Opens an overlay (or switches to another one). Suppresses the dock synchronously. */
  open: (next: ChatHomeOverlay) => void;
  /** Closes the current overlay and releases the dock suppression. */
  close: () => void;
  /**
   * Adopts a header press parked while the content subtree was absent. The
   * parked press already holds a dock suppressor acquired synchronously at
   * press time by the screen-level owner — this transfers that suppressor
   * instead of acquiring a second one, so exactly one suppressor exists per
   * open. Never stacks: an extra release is freed immediately (defensive;
   * parking only happens while this instance holds nothing).
   */
  adoptParked: (next: ChatHomeOverlay, release: () => void) => void;
  /**
   * The group form publishes its guarded close here. It must never be called
   * without checking `current` first — it is null between renders.
   */
  requestGroupCloseRef: React.MutableRefObject<GroupCloseRequester | null>;
}

export function useChatHomeOverlay(): ChatHomeOverlayController {
  const [overlay, setOverlay] = React.useState<ChatHomeOverlay | null>(null);
  const suppressTabDock = useTabDockSuppression();

  // Holds the active dock-suppression release while any overlay is open.
  const suppressReleaseRef = React.useRef<(() => void) | null>(null);
  const requestGroupCloseRef = React.useRef<GroupCloseRequester | null>(null);

  const acquireSuppression = React.useCallback(() => {
    // Switching overlays (start → group) must not stack suppressors.
    if (suppressReleaseRef.current === null) {
      suppressReleaseRef.current = suppressTabDock();
    }
  }, [suppressTabDock]);

  const releaseSuppression = React.useCallback(() => {
    if (suppressReleaseRef.current !== null) {
      // The release returned by the store is idempotent; nulling the ref makes
      // it exactly-once from this hook's point of view.
      suppressReleaseRef.current();
      suppressReleaseRef.current = null;
    }
  }, []);

  const open = React.useCallback(
    (next: ChatHomeOverlay) => {
      acquireSuppression();
      setOverlay(next);
    },
    [acquireSuppression],
  );

  const close = React.useCallback(() => {
    releaseSuppression();
    setOverlay(null);
  }, [releaseSuppression]);

  // Adopts a header press parked by the screen-level owner while this subtree
  // was absent (first-mount shell). The parked slot lives in a screen-owned
  // ref — never in either hook instance — so there is exactly one place where
  // a parked press can wait, and the header instance cannot paint an overlay
  // from it (there is no second instance anymore). Consuming the parked slot
  // is the caller's job; this only takes over the already-held suppressor and
  // paints the stage in THIS (rendering) instance.
  const adoptParked = React.useCallback((next: ChatHomeOverlay, release: () => void) => {
    if (suppressReleaseRef.current === null) {
      suppressReleaseRef.current = release;
    } else {
      // Defensive: parking only happens while this instance holds nothing, so
      // reaching here means a logic error — free the extra immediately rather
      // than stacking a second suppressor.
      release();
    }
    setOverlay(next);
  }, []);

  // Safety net: release if the screen unmounts with an overlay open. (A parked
  // press keeps its suppression: it is a live open request, released by
  // close(), Back, or this unmount net.)
  React.useEffect(() => releaseSuppression, [releaseSuppression]);

  // One hardware-Back handler for the whole screen, mounted only for the
  // in-tree overlays. 'qr' is excluded: QrScannerModal owns Back while visible,
  // and the two listeners must never coexist (design Risks). A parked press is
  // NOT covered here — the content subtree (and this hook) does not exist yet
  // while a press is parked, so the screen-level owner handles Back for the
  // parked window and releases the parked suppressor on dismiss.
  const interceptActive =
    overlay === 'start' || overlay === 'group';
  React.useEffect(() => {
    if (!interceptActive) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay === 'group') {
        // The form owns its guarded close (discard confirm while creating).
        const requestClose = requestGroupCloseRef.current;
        requestClose?.();
      } else {
        close();
      }
      return true;
    });
    // JS consumes Back while the overlay is up → native skips the card shrink.
    const releaseIntercept = acquireBackIntercept();
    return () => {
      sub.remove();
      releaseIntercept();
    };
  }, [interceptActive, overlay, close]);

  return {
    overlay,
    open,
    close,
    adoptParked,
    requestGroupCloseRef,
  };
}
