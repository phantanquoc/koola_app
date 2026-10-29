/**
 * ChatStartPopup.spec.tsx
 *
 * chat-home-start-popup (task 6.1):
 * - renders null when not visible
 * - two rows (Tạo nhóm, Nhắn tin mới), each invoking its callback exactly once
 * - backdrop dismisses without performing a row action
 * - hardware Back is NOT owned here (the Chat Home overlay owner handles it),
 *   so the popup registers no BackHandler of its own
 * - reduce-motion renders the panel/backdrop at their final state immediately
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — jest.mock factories and react-test-renderer are untyped here
import React from 'react';
// @ts-expect-error — react-test-renderer types missing
import { create as render, act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { ThemeProvider } from '../../ui/ThemeProvider';
import { ChatHomeHeaderInsetContext, CHAT_SUB_TAB_BAR_HEIGHT } from '../../screens/main/ChatHomeHeaderInsetContext';
import { koolaSpacing } from '../../ui/theme';

jest.mock('react-native-vector-icons/MaterialIcons', () => {
  const ReactActual = jest.requireActual('react');
  const Stub = (props: { name: string }) =>
    ReactActual.createElement('Icon', { name: props.name });
  return { __esModule: true, default: Stub };
});

import ChatStartPopup from '../ChatStartPopup';

const CONTENT_INSET = 82;
const ROW_LABELS = ['Tạo nhóm', 'Nhắn tin mới'];

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    visible: true,
    onClose: jest.fn(),
    onGroupPress: jest.fn(),
    onNewMessagePress: jest.fn(),
    ...overrides,
  };
}

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <ChatHomeHeaderInsetContext.Provider value={CONTENT_INSET}>
      {children}
    </ChatHomeHeaderInsetContext.Provider>
  </ThemeProvider>
);

function renderPopup(props: Record<string, unknown>) {
  let tree: unknown;
  act(() => {
    tree = render(
      React.createElement(Wrapper, null, React.createElement(ChatStartPopup, props)),
    );
  });
  // Flush the entrance timings (native driver → Jest's Animated mock).
  act(() => {
    jest.runAllTimers();
  });
  return tree;
}

function pressByLabel(tree: unknown, label: string) {
  // First match is the outermost host instance carrying the label.
  const node = tree.root.findAllByProps({ accessibilityLabel: label })[0];
  act(() => {
    node.props.onPress();
  });
}

describe('ChatStartPopup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders null when not visible', () => {
    const tree = renderPopup(baseProps({ visible: false }));
    expect(tree.toJSON()).toBeNull();
  });

  it('shows exactly the two start actions', () => {
    const tree = renderPopup(baseProps());
    tree.root.findByProps({ accessibilityLabel: 'Tạo nhóm' });
    tree.root.findByProps({ accessibilityLabel: 'Nhắn tin mới' });
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Quét mã QR' })).toHaveLength(0);

    const rows = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        node.props.android_ripple !== undefined &&
        ROW_LABELS.includes(node.props.accessibilityLabel),
      { deep: true },
    );
    // react-test-renderer reports composite + host nodes: dedupe by label.
    expect(Array.from(new Set(rows.map((node) => node.props.accessibilityLabel)))).toEqual(
      ROW_LABELS,
    );
  });

  it('marks the panel as a modal dialog', () => {
    const tree = renderPopup(baseProps());
    const panel = tree.root.findByProps({ accessibilityLabel: 'Bắt đầu mới' });
    expect(panel.props.accessibilityViewIsModal).toBe(true);
  });

  it('each row invokes its callback exactly once and does not close', () => {
    const props = baseProps();
    const tree = renderPopup(props);

    pressByLabel(tree, 'Tạo nhóm');
    pressByLabel(tree, 'Nhắn tin mới');

    expect(props.onGroupPress).toHaveBeenCalledTimes(1);
    expect(props.onNewMessagePress).toHaveBeenCalledTimes(1);
    // The owner decides the transition (stage switch / navigation).
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('backdrop tap dismisses without performing a row action', () => {
    const props = baseProps();
    const tree = renderPopup(props);
    pressByLabel(tree, 'Đóng bảng bắt đầu mới');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onGroupPress).not.toHaveBeenCalled();
    expect(props.onNewMessagePress).not.toHaveBeenCalled();
  });

  it('does not register its own BackHandler (the overlay owner owns Back)', () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    try {
      renderPopup(baseProps());
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('anchors the panel flush just under the sub-tab bar (inset minus the bar height)', () => {
    const tree = renderPopup(baseProps());
    const host = tree.root.findByProps({ pointerEvents: 'box-none' });
    const flat = Object.assign({}, ...[host.props.style].flat(Infinity));
    // The overlay starts at the top of the content subtree (below the header),
    // so the bar height is subtracted: the panel sits under the bar, not one
    // full bar height lower. A small gap token keeps it clear of the bar.
    expect(flat.paddingTop).toBe(CONTENT_INSET - CHAT_SUB_TAB_BAR_HEIGHT + koolaSpacing.sm);
    expect(flat.paddingTop).toBeGreaterThan(CONTENT_INSET - CHAT_SUB_TAB_BAR_HEIGHT);
    expect(flat.paddingTop).toBeLessThan(CONTENT_INSET);
    expect(flat.justifyContent).toBe('flex-start');
  });

  it('renders at its final state under reduce motion without animating', () => {
    const motion = require('../../ui/tokens/motion');
    const reduceSpy = jest.spyOn(motion, 'prefersReducedMotion').mockReturnValue(true);
    const timingSpy = jest.spyOn(
      require('react-native').Animated,
      'timing',
    );
    try {
      const tree = renderPopup(baseProps());
      // The reduced-motion branch jumps both Animated.Values to 1 and starts
      // no timing at all.
      expect(timingSpy).not.toHaveBeenCalled();
      const snapshot = JSON.stringify(tree.toJSON());
      expect(snapshot).toContain('opacity');
      act(() => {
        jest.runAllTimers();
      });
      expect(JSON.stringify(tree.toJSON())).toBe(snapshot);
      tree.root.findByProps({ accessibilityLabel: 'Tạo nhóm' });
    } finally {
      timingSpy.mockRestore();
      reduceSpy.mockRestore();
    }
  });
});
