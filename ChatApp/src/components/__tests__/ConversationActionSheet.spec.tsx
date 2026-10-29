/**
 * ConversationActionSheet.spec.tsx
 *
 * conversation-quick-actions sheet (task 7.2):
 * - labels follow pin/mute state, destructive clear row present
 * - mute sub-view with the four durations; unmute is immediate when muted
 * - backdrop tap and hardware Back dismiss without performing an action
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — jest.mock factories use untyped rest params that tsc would otherwise flag
import React from 'react';
// @ts-expect-error — react-test-renderer types missing
import { create as render, act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { ThemeProvider } from '../../ui/ThemeProvider';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'me' } }),
}));

jest.mock('react-native-vector-icons/MaterialIcons', () => {
  const ReactActual = jest.requireActual('react');
  const Stub = (props: { name: string }) =>
    ReactActual.createElement('Icon', { name: props.name });
  return { __esModule: true, default: Stub };
});

import ConversationActionSheet from '../ConversationActionSheet';
import type { Conversation } from '../../types';

function makeConv(overrides: Record<string, unknown> = {}): Conversation {
  return {
    _id: 'conv-1',
    type: 'group',
    name: 'Nhóm test',
    members: [],
    createdBy: 'me',
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Conversation;
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    visible: true,
    conversation: makeConv(),
    onClose: jest.fn(),
    onTogglePin: jest.fn(),
    onUnmute: jest.fn(),
    onPickMuteDuration: jest.fn(),
    onClear: jest.fn(),
    ...overrides,
  };
}

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

function renderSheet(props: Record<string, unknown>) {
  let tree: { root: { findByProps: (...a: unknown[]) => { props: Record<string, (...a: unknown[]) => void> }; findAllByProps: (...a: unknown[]) => Array<{ props: Record<string, unknown> }> }; unmount: () => void };
  act(() => {
    tree = render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(ConversationActionSheet, props),
      ),
    );
  });
  // The entrance runs through `Animated.timing` (requestAnimationFrame on the
  // JS driver); flush the remaining frames inside `act` so the updates land
  // without "not wrapped in act" noise.
  act(() => {
    jest.runAllTimers();
  });
  // @ts-expect-error — assigned in act
  return tree;
}

function pressByLabel(tree: { root: { findByProps: (...a: unknown[]) => { props: Record<string, (...a: unknown[]) => void> } } }, label: string) {
  const node = tree.root.findByProps({ accessibilityLabel: label });
  act(() => {
    node.props.onPress();
  });
}

describe('ConversationActionSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders null when not visible', () => {
    const tree = renderSheet(baseProps({ visible: false }));
    expect(tree.toJSON()).toBeNull();
  });

  it('shows Ghim / Tắt thông báo / Xoá hội thoại for a plain conversation', () => {
    const tree = renderSheet(baseProps());
    tree.root.findByProps({ accessibilityLabel: 'Ghim hội thoại' });
    tree.root.findByProps({ accessibilityLabel: 'Tắt thông báo' });
    tree.root.findByProps({ accessibilityLabel: 'Xoá hội thoại ở phía tôi' });
  });

  it('shows Bỏ ghim / Bật thông báo when pinned and muted', () => {
    const tree = renderSheet(
      baseProps({
        conversation: makeConv({
          pinned: true,
          mutedUntil: new Date(Date.now() + 3600_000).toISOString(),
        }),
      }),
    );
    tree.root.findByProps({ accessibilityLabel: 'Bỏ ghim hội thoại' });
    tree.root.findByProps({ accessibilityLabel: 'Bật thông báo trở lại' });
  });

  it('pin and clear rows call through (sheet closing is the caller’s job)', () => {
    const props = baseProps();
    const tree = renderSheet(props);
    pressByLabel(tree, 'Ghim hội thoại');
    expect(props.onTogglePin).toHaveBeenCalledTimes(1);
    pressByLabel(tree, 'Xoá hội thoại ở phía tôi');
    expect(props.onClear).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('opens the mute sub-view with four durations when unmuted', () => {
    const props = baseProps();
    const tree = renderSheet(props);
    pressByLabel(tree, 'Tắt thông báo');
    expect(props.onUnmute).not.toHaveBeenCalled();
    // The header retitles to the sub-view so the sheet says what it is.
    const labels = tree.root
      .findAll((n: { props: Record<string, unknown> }) => typeof n.props.children === 'string')
      .map((n: { props: Record<string, unknown> }) => n.props.children);
    expect(labels).toContain('Tắt thông báo');
    tree.root.findByProps({ accessibilityLabel: 'Tắt thông báo trong 8 giờ' });
    tree.root.findByProps({ accessibilityLabel: 'Tắt thông báo trong 1 giờ' });
    tree.root.findByProps({ accessibilityLabel: 'Tắt thông báo trong 24 giờ' });
    tree.root.findByProps({
      accessibilityLabel: 'Tắt thông báo cho đến khi tôi bật lại',
    });
    pressByLabel(tree, 'Tắt thông báo trong 8 giờ');
    expect(props.onPickMuteDuration).toHaveBeenCalledWith('8h');
  });

  it('unmutes immediately without a sub-menu when muted', () => {
    const props = baseProps({
      conversation: makeConv({
        mutedUntil: new Date(Date.now() + 3600_000).toISOString(),
      }),
    });
    const tree = renderSheet(props);
    pressByLabel(tree, 'Bật thông báo trở lại');
    expect(props.onUnmute).toHaveBeenCalledTimes(1);
  });

  it('backdrop tap dismisses without performing an action', () => {
    const props = baseProps();
    const tree = renderSheet(props);
    pressByLabel(tree, 'Đóng bảng tuỳ chọn');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onTogglePin).not.toHaveBeenCalled();
    expect(props.onClear).not.toHaveBeenCalled();
  });

  it('hardware Back dismisses and is consumed', () => {
    const props = baseProps();
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    try {
      renderSheet(props);
      expect(spy).toHaveBeenCalledWith(
        'hardwareBackPress',
        expect.any(Function),
      );
      const handler = spy.mock.calls[0][1] as () => boolean;
      let consumed = false;
      act(() => {
        consumed = handler();
      });
      expect(consumed).toBe(true);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('expired mute reads as unmuted (sheet offers Tắt thông báo)', () => {
    const tree = renderSheet(
      baseProps({
        conversation: makeConv({
          mutedUntil: new Date(Date.now() - 1000).toISOString(),
        }),
      }),
    );
    tree.root.findByProps({ accessibilityLabel: 'Tắt thông báo' });
  });
});
