import { NativeModules, Platform } from 'react-native';

type KoolaBackModule = {
  performBack?: () => void;
  setInterceptCount?: (count: number) => void;
  notifyPopping?: () => void;
};

function getModule(): KoolaBackModule | undefined {
  if (Platform.OS !== 'android') return undefined;
  return NativeModules.KoolaBack as KoolaBackModule | undefined;
}

/**
 * Routes an in-app "back" tap through the Android OnBackPressedDispatcher so
 * MainActivity can play the two-phase card shrink → slide before React
 * Navigation pops. Falls back to `fallback` (normally `navigation.goBack()`)
 * on iOS or when the native module is unavailable (e.g. Jest).
 */
export function performNativeBack(fallback: () => void): void {
  const mod = getModule();
  if (typeof mod?.performBack === 'function') {
    mod.performBack();
    return;
  }
  fallback();
}

let interceptCount = 0;

/**
 * Declare that a JS `hardwareBackPress` listener which consumes the press is
 * active (modal, overlay, confirm dialog). While any is held, the native side
 * skips the card shrink entirely and just delegates the back to JS — no
 * shrink → hold → restore flash. Call exactly where the listener is added and
 * invoke the returned release where it is removed. Release is idempotent.
 */
export function acquireBackIntercept(): () => void {
  interceptCount += 1;
  syncInterceptCount();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    interceptCount = Math.max(0, interceptCount - 1);
    syncInterceptCount();
  };
}

/** Current number of held intercepts (exposed for tests/diagnostics). */
export function getBackInterceptCount(): number {
  return interceptCount;
}

function syncInterceptCount(): void {
  const mod = getModule();
  if (typeof mod?.setInterceptCount === 'function') mod.setInterceptCount(interceptCount);
}

/**
 * Tell native that the Chat screen pop is committed (`beforeRemove`), so a
 * shrunk card is never animated back to full size while it slides out.
 */
export function notifyNativePopping(): void {
  const mod = getModule();
  if (typeof mod?.notifyPopping === 'function') mod.notifyPopping();
}
