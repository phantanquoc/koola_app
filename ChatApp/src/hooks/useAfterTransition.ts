import { useCallback, useContext, useEffect, useRef } from 'react';
import { NavigationContext } from '@react-navigation/native';

/**
 * Upper bound on how long work waits for `transitionEnd`. The native-stack push
 * on Android runs ~150-300ms; if the event never arrives (no animation, event
 * dropped, screen not in a native-stack) work still runs instead of stalling.
 */
export const AFTER_TRANSITION_FALLBACK_MS = 250;

export interface AfterTransitionTask {
  cancel: () => void;
}

/**
 * Runs `cb` once the screen's enter transition has finished. If it already
 * finished, `cb` runs synchronously. The returned handle cancels a pending run.
 */
export type RunAfterTransition = (cb: () => void) => AfterTransitionTask;

const NOOP_TASK: AfterTransitionTask = { cancel: () => {} };

/** Used where no screen transition gates the work (tests, non-screen callers). */
export const runImmediately: RunAfterTransition = (cb) => {
  cb();
  return NOOP_TASK;
};

type TransitionEndListener = (e: { data?: { closing?: boolean } }) => void;

/**
 * Defers work until the current native-stack screen finishes its enter
 * transition.
 *
 * Why not `InteractionManager.runAfterInteractions`: neither
 * `@react-navigation/native-stack` nor `react-native-screens` creates an
 * interaction handle — the animation runs natively — so that call resolves
 * immediately, in the middle of the slide. The only reliable signal is the
 * native-stack `transitionEnd` event, with `data.closing === false` for the
 * enter transition (`closing === true` is the pop, ignored here).
 *
 * Settled ("done") when any of these happens first:
 *   - `transitionEnd` with `closing: false`
 *   - `AFTER_TRANSITION_FALLBACK_MS` elapsed since mount
 *   - there is no navigation context at all (rendered outside a navigator)
 *
 * Once settled it stays settled for the life of the screen, so later calls
 * (e.g. a debounced reload) run their work without extra waiting. Unmount
 * drops any queued work.
 */
export function useAfterTransition(): RunAfterTransition {
  // Read the context directly instead of `useNavigation()`, which throws
  // outside a navigator. No navigator = no transition to wait for.
  const navigation = useContext(NavigationContext);
  const hasNavigator = navigation !== undefined && typeof navigation.addListener === 'function';

  const doneRef = useRef(!hasNavigator);
  const queueRef = useRef<Set<() => void>>(new Set());

  const settle = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const pending = Array.from(queueRef.current);
    queueRef.current.clear();
    for (const run of pending) run();
  }, []);

  useEffect(() => {
    if (!hasNavigator || !navigation) {
      settle();
      return;
    }
    if (doneRef.current) return;
    const fallback = setTimeout(settle, AFTER_TRANSITION_FALLBACK_MS);
    // `transitionEnd` is a native-stack event; the base NavigationProp type
    // does not list it, hence the narrow cast on the listener signature.
    const addListener = navigation.addListener as unknown as (
      type: 'transitionEnd',
      listener: TransitionEndListener,
    ) => () => void;
    const unsubscribe = addListener('transitionEnd', (e) => {
      if (e?.data?.closing) return;
      settle();
    });
    return () => {
      clearTimeout(fallback);
      unsubscribe();
    };
  }, [hasNavigator, navigation, settle]);

  // Unmount: drop queued work so nothing runs against a dead screen.
  useEffect(() => {
    const queue = queueRef.current;
    return () => {
      queue.clear();
    };
  }, []);

  return useCallback<RunAfterTransition>((cb) => {
    if (doneRef.current) {
      cb();
      return NOOP_TASK;
    }
    const run = () => cb();
    queueRef.current.add(run);
    return {
      cancel: () => {
        queueRef.current.delete(run);
      },
    };
  }, []);
}
