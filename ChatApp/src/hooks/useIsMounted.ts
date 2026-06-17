import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

/**
 * Tracks whether the owning component is still mounted.
 *
 * Returns a ref whose `.current` is `true` while mounted and flips to `false`
 * on unmount. Read it inside async callbacks before calling setState to avoid
 * "setState on an unmounted component" warnings and the Fabric snapshot flicker
 * that happens when a screen is popped off the native stack mid-flight.
 *
 * Seeds `true` so the value is already correct on first render, before the
 * mount effect runs. The effect re-affirms `true` on (re)mount so the ref stays
 * valid across StrictMode double-invocation and fast remounts.
 *
 * @example
 *   const isMountedRef = useIsMounted();
 *   const data = await fetchSomething();
 *   if (isMountedRef.current) setData(data);
 */
export function useIsMounted(): MutableRefObject<boolean> {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}
