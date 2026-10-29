/**
 * KoolaOverlay — in-tree replacement for native <Modal>.
 * See KoolaOverlay.tsx: Android Modal = separate Dialog window + Fabric surface,
 * which crashed removeViewAt when opened/closed during screen mount/unmount.
 */
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create, act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { ThemeProvider } from '../ThemeProvider';
import { KoolaOverlay } from '../KoolaOverlay';

let tree: any;
const raf = (global as { requestAnimationFrame?: (cb: () => void) => number });
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

function mount(props: Record<string, unknown>) {
  act(() => {
    tree = create(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(KoolaOverlay, props as never, React.createElement(Text, null, 'body')),
      ),
    );
  });
}

beforeAll(() => {
  raf.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0) as unknown as number;
  (global as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame = (id) =>
    clearTimeout(id as unknown as NodeJS.Timeout);
});

afterEach(() => {
  if (tree) act(() => tree.unmount());
  tree = undefined;
});

describe('KoolaOverlay', () => {
  it('renders nothing while hidden', () => {
    mount({ visible: false });
    expect(tree.toJSON()).toBeNull();
  });

  it('renders children when visible (never a native Modal)', () => {
    mount({ visible: true });
    const json = tree.toJSON();
    expect(json).not.toBeNull();
    // The overlay root carries the a11y modal flag the native Modal provided.
    expect(json.props.accessibilityViewIsModal).toBe(true);
    expect(JSON.stringify(tree.toJSON())).toContain('body');
  });

  it('stays mounted for one frame after hiding so the closing tap settles', async () => {
    mount({ visible: true });
    act(() => tree.update(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(KoolaOverlay, { visible: false } as never, React.createElement(Text, null, 'body')),
      ),
    ));
    expect(tree.toJSON()).not.toBeNull();
    await flush();
    expect(tree.toJSON()).toBeNull();
  });
});
