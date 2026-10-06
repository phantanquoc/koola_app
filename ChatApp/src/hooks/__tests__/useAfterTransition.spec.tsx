/**
 * useAfterTransition.spec.tsx
 *
 * Verifies the transition gate that replaced `InteractionManager.runAfterInteractions`
 * on the chat screen (native-stack never creates interaction handles, so that
 * call fired mid-slide). Rendered with react-test-renderer and a fake
 * navigation object supplied through NavigationContext.
 */

import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import { NavigationContext } from '@react-navigation/native';
import {
  AFTER_TRANSITION_FALLBACK_MS,
  useAfterTransition,
  type RunAfterTransition,
} from '../useAfterTransition';

type Listener = (e: { data?: { closing?: boolean } }) => void;

function makeFakeNavigation() {
  const listeners = new Map<string, Set<Listener>>();
  const navigation = {
    addListener: jest.fn((type: string, cb: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
      return () => listeners.get(type)?.delete(cb);
    }),
    emit(type: string, data: { closing: boolean }) {
      for (const cb of Array.from(listeners.get(type) ?? [])) cb({ data });
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return navigation;
}

function mount(navigation?: ReturnType<typeof makeFakeNavigation>) {
  let run!: RunAfterTransition;
  const Harness: React.FC = () => {
    run = useAfterTransition();
    return null;
  };
  const element = navigation
    ? React.createElement(
        NavigationContext.Provider,
        { value: navigation as never },
        React.createElement(Harness),
      )
    : React.createElement(Harness);
  let tree!: { unmount: () => void };
  act(() => {
    tree = render(element) as typeof tree;
  });
  return {
    get run() {
      return run;
    },
    unmount() {
      act(() => tree.unmount());
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAfterTransition', () => {
  it('defers work until transitionEnd (closing=false)', () => {
    const nav = makeFakeNavigation();
    const h = mount(nav);
    const cb = jest.fn();
    h.run(cb);
    expect(cb).not.toHaveBeenCalled();

    act(() => nav.emit('transitionEnd', { closing: false }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('ignores transitionEnd with closing=true', () => {
    const nav = makeFakeNavigation();
    const h = mount(nav);
    const cb = jest.fn();
    h.run(cb);

    act(() => nav.emit('transitionEnd', { closing: true }));
    expect(cb).not.toHaveBeenCalled();

    act(() => nav.emit('transitionEnd', { closing: false }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('falls back after 250ms when transitionEnd never arrives', () => {
    expect(AFTER_TRANSITION_FALLBACK_MS).toBe(250);
    const nav = makeFakeNavigation();
    const h = mount(nav);
    const cb = jest.fn();
    h.run(cb);

    act(() => jest.advanceTimersByTime(AFTER_TRANSITION_FALLBACK_MS - 1));
    expect(cb).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('runs synchronously once the transition has already ended', () => {
    const nav = makeFakeNavigation();
    const h = mount(nav);
    act(() => nav.emit('transitionEnd', { closing: false }));

    const cb = jest.fn();
    h.run(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('runs each queued callback exactly once (event then fallback)', () => {
    const nav = makeFakeNavigation();
    const h = mount(nav);
    const cb = jest.fn();
    h.run(cb);
    act(() => nav.emit('transitionEnd', { closing: false }));
    act(() => jest.advanceTimersByTime(AFTER_TRANSITION_FALLBACK_MS * 2));
    act(() => nav.emit('transitionEnd', { closing: false }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops a pending callback', () => {
    const nav = makeFakeNavigation();
    const h = mount(nav);
    const cb = jest.fn();
    const task = h.run(cb);
    task.cancel();

    act(() => nav.emit('transitionEnd', { closing: false }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('unmount drops queued work and removes the listener + fallback timer', () => {
    const nav = makeFakeNavigation();
    const h = mount(nav);
    const cb = jest.fn();
    h.run(cb);
    expect(nav.listenerCount('transitionEnd')).toBe(1);

    h.unmount();
    expect(nav.listenerCount('transitionEnd')).toBe(0);
    act(() => jest.advanceTimersByTime(AFTER_TRANSITION_FALLBACK_MS * 2));
    expect(cb).not.toHaveBeenCalled();
  });

  it('works outside a navigator: runs immediately, does not throw', () => {
    const h = mount();
    const cb = jest.fn();
    h.run(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
