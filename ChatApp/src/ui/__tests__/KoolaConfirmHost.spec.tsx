/**
 * KoolaConfirmHost / koolaConfirm — app-root confirm dialog that replaces
 * native <Modal> (RN 0.76 Fabric Android 0x0 Modal race).
 */
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import { BackHandler, Pressable, StyleSheet } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { ThemeProvider } from '../ThemeProvider';
import { KoolaConfirmHost, dismissKoolaConfirm, koolaConfirm } from '../KoolaConfirmHost';

type BackCb = () => boolean | null | undefined;
let backListeners: BackCb[] = [];
let backRemove: jest.Mock;

beforeEach(() => {
  backListeners = [];
  backRemove = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_: string, cb: BackCb) => {
    backListeners.push(cb);
    return {
      remove: () => {
        backRemove();
        backListeners = backListeners.filter((l) => l !== cb);
      },
    };
  }) as any);
});

let tree: any;
afterEach(() => {
  act(() => dismissKoolaConfirm());
  if (tree) act(() => tree.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

function mountHost() {
  act(() => {
    tree = render(React.createElement(ThemeProvider, null, React.createElement(KoolaConfirmHost)));
  });
}

const logoutOpts = (extra: Record<string, unknown> = {}) => ({
  title: 'Đăng xuất',
  message: 'Bạn có chắc muốn đăng xuất?',
  cancelLabel: 'HỦY',
  confirmLabel: 'ĐĂNG XUẤT',
  destructive: true,
  onConfirm: jest.fn(),
  ...extra,
});

const byLabel = (label: string) =>
  tree.root.find((n: any) => n.type === Pressable && n.props.accessibilityLabel === label);

const texts = () =>
  tree.root
    .findAll((n: any) => typeof n.props.children === 'string')
    .map((n: any) => n.props.children);

const press = (label: string) => act(() => byLabel(label).props.onPress());

describe('KoolaConfirmHost', () => {
  it('renders null when hidden', () => {
    mountHost();
    expect(tree.toJSON()).toBeNull();
    expect(backListeners).toHaveLength(0);
  });

  it('shows title, message and buttons with a11y labels/roles', () => {
    mountHost();
    act(() => koolaConfirm(logoutOpts()));
    const t = texts();
    expect(t).toEqual(expect.arrayContaining(['Đăng xuất', 'Bạn có chắc muốn đăng xuất?', 'HỦY', 'ĐĂNG XUẤT']));
    expect(byLabel('Hủy').props.accessibilityRole).toBe('button');
    expect(byLabel('Đăng xuất').props.accessibilityRole).toBe('button');
    expect(byLabel('Đóng hộp thoại')).toBeTruthy();

    const root = tree.toJSON();
    const flat = StyleSheet.flatten(root.props.style);
    expect(flat).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' });
    expect(flat.zIndex).toBeGreaterThanOrEqual(1000);
    expect(root.props.accessibilityViewIsModal).toBe(true);
  });

  it('HỦY closes without calling onConfirm, calls onCancel', () => {
    mountHost();
    const onCancel = jest.fn();
    const opts = logoutOpts({ onCancel });
    act(() => koolaConfirm(opts));
    press('Hủy');
    expect(tree.toJSON()).toBeNull();
    expect(opts.onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ĐĂNG XUẤT hides first, then calls onConfirm once', () => {
    mountHost();
    const btnRef: { current: any } = { current: null };
    // Re-entrant press from inside onConfirm must be ignored: proves the
    // request was cleared (hidden) before onConfirm ran.
    const opts = logoutOpts({ onConfirm: jest.fn(() => btnRef.current.props.onPress()) });
    act(() => koolaConfirm(opts));
    btnRef.current = byLabel('Đăng xuất');
    act(() => btnRef.current.props.onPress());
    expect(opts.onConfirm).toHaveBeenCalledTimes(1);
    expect(tree.toJSON()).toBeNull();
    expect(backListeners).toHaveLength(0);
  });

  it('double press on confirm calls onConfirm exactly once', () => {
    mountHost();
    const opts = logoutOpts();
    act(() => koolaConfirm(opts));
    const btn = byLabel('Đăng xuất');
    act(() => {
      btn.props.onPress();
      btn.props.onPress();
    });
    expect(opts.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('backdrop press cancels', () => {
    mountHost();
    const opts = logoutOpts();
    act(() => koolaConfirm(opts));
    press('Đóng hộp thoại');
    expect(tree.toJSON()).toBeNull();
    expect(opts.onConfirm).not.toHaveBeenCalled();
  });

  it('card captures the responder so taps inside do not dismiss', () => {
    mountHost();
    act(() => koolaConfirm(logoutOpts()));
    const card = tree.root.find((n: any) => typeof n.props.onStartShouldSetResponder === 'function' && n.props.accessibilityRole === 'alert');
    expect(card.props.onStartShouldSetResponder()).toBe(true);
    expect(tree.toJSON()).not.toBeNull();
  });

  it('BackHandler listener only while visible, returns true, removed after close', () => {
    mountHost();
    expect(backListeners).toHaveLength(0);
    const opts = logoutOpts();
    act(() => koolaConfirm(opts));
    expect(backListeners).toHaveLength(1);
    let handled: unknown;
    act(() => { handled = backListeners[0](); });
    expect(handled).toBe(true);
    expect(tree.toJSON()).toBeNull();
    expect(opts.onConfirm).not.toHaveBeenCalled();
    expect(backRemove).toHaveBeenCalledTimes(1);
    expect(backListeners).toHaveLength(0);
  });

  it('BackHandler listener is removed on unmount', () => {
    mountHost();
    act(() => koolaConfirm(logoutOpts()));
    expect(backListeners).toHaveLength(1);
    act(() => tree.unmount());
    tree = undefined;
    expect(backListeners).toHaveLength(0);
  });

  it('second request replaces the first; first is cancelled', () => {
    mountHost();
    const firstCancel = jest.fn();
    const first = logoutOpts({ onCancel: firstCancel });
    const second = logoutOpts({ title: 'Xoá', confirmLabel: 'XOÁ' });
    act(() => koolaConfirm(first));
    act(() => koolaConfirm(second));
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(texts()).toContain('Xoá');
    press('Xoá');
    expect(second.onConfirm).toHaveBeenCalledTimes(1);
    expect(first.onConfirm).not.toHaveBeenCalled();
    expect(tree.toJSON()).toBeNull();
  });

  it('non-destructive confirm uses action.primary; destructive uses status.danger', () => {
    mountHost();
    act(() => koolaConfirm(logoutOpts()));
    const dangerColor = StyleSheet.flatten(
      tree.root.find((n: any) => n.props.children === 'ĐĂNG XUẤT' && n.props.weight === '800').props.style,
    ).color;
    press('Hủy');
    act(() => koolaConfirm(logoutOpts({ destructive: false })));
    const primaryColor = StyleSheet.flatten(
      tree.root.find((n: any) => n.props.children === 'ĐĂNG XUẤT' && n.props.weight === '800').props.style,
    ).color;
    expect(dangerColor).not.toEqual(primaryColor);
  });

  it('no host mounted: does not throw, never confirms, cancels and warns in dev', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onCancel = jest.fn();
    const opts = logoutOpts({ onCancel });
    expect(() => koolaConfirm(opts)).not.toThrow();
    expect(opts.onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    // Not queued: mounting a host later shows nothing.
    mountHost();
    expect(tree.toJSON()).toBeNull();
  });
});
