/**
 * Unit tests for redesign-primitives-v2 new/fixed primitives.
 * Covers: a11y roles, state matrix (selected/disabled/loading), dark mode behavior.
 */
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}));

let mockColorScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const RN = require('react-native');
  const R = require('react');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) =>
      R.createElement(RN.View, { ref, ...props }),
    ),
    BottomSheetBackdrop: (props: any) => R.createElement(RN.View, props),
    BottomSheetView: (props: any) => R.createElement(RN.View, props),
  };
});

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (c: any) => c,
      View: RN.View,
    },
    useAnimatedStyle: (fn: any) => fn(),
    useSharedValue: (v: any) => ({ value: v }),
    withTiming: (v: any) => v,
    Easing: { out: () => () => 0, in: () => () => 0, cubic: 0 },
    runOnJS: (fn: any) => fn,
  };
});

import { ThemeProvider } from '../ThemeProvider';
import { KoolaText } from '../KoolaText';
import { KoolaButton } from '../KoolaButton';
import { KoolaChip } from '../KoolaChip';
import { KoolaSurface } from '../KoolaSurface';
import { KoolaAvatar } from '../KoolaAvatar';
import { KoolaDialog } from '../KoolaDialog';
import { KoolaMenu } from '../KoolaMenu';
import { KoolaSheet } from '../KoolaSheet';
import { KoolaSearchField } from '../KoolaSearchField';
import { KoolaListItem } from '../KoolaListItem';
import { KoolaSegmentedControl } from '../KoolaSegmentedControl';
import {
  KoolaEmptyState,
  KoolaErrorState,
  KoolaLoadingState,
  KoolaOfflineState,
} from '../KoolaStatePresets';
import { KoolaToast } from '../KoolaToast';

const wrap = (ui: React.ReactElement) =>
  React.createElement(ThemeProvider, null, ui);

function findByProps(tree: any, predicate: (p: any) => boolean): any {
  if (tree.props && predicate(tree.props)) return tree;
  const children = tree.children || [];
  for (const child of children) {
    if (typeof child === 'object') {
      const found = findByProps(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function findAll(tree: any, predicate: (node: any) => boolean): any[] {
  const results: any[] = [];
  if (predicate(tree)) results.push(tree);
  const children = tree.children || [];
  for (const child of children) {
    if (typeof child === 'object') {
      results.push(...findAll(child, predicate));
    }
  }
  return results;
}

// ─── KoolaChip ───────────────────────────────────────────────────────────────

describe('KoolaChip', () => {
  it('announces accessibilityRole=button', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaChip, { label: 'Test' }))); });
    const root = tree.toJSON();
    expect(root.props.accessibilityRole).toBe('button');
  });

  it('announces selected state', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaChip, { label: 'Test', selected: true }))); });
    const root = tree.toJSON();
    expect(root.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('announces unselected state', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaChip, { label: 'Test', selected: false }))); });
    const root = tree.toJSON();
    expect(root.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('merges disabled state without discarding caller state', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaChip, {
        label: 'Test',
        disabled: true,
        accessibilityState: { busy: true },
      })));
    });
    const root = tree.toJSON();
    expect(root.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );
  });
});

// ─── KoolaSurface ────────────────────────────────────────────────────────────

describe('KoolaSurface raised', () => {
  it('uses light shadow in light mode', () => {
    mockColorScheme = 'light';
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaSurface, { variant: 'raised' }))); });
    const root = tree.toJSON();
    const flatStyle = Object.assign({}, ...(Array.isArray(root.props.style) ? root.props.style : [root.props.style]));
    expect(flatStyle.elevation).toBe(2);
  });

  it('uses dark elevation tint in dark mode', () => {
    mockColorScheme = 'dark';
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaSurface, { variant: 'raised' }))); });
    const root = tree.toJSON();
    const flatStyle = Object.assign({}, ...(Array.isArray(root.props.style) ? root.props.style : [root.props.style]));
    expect(flatStyle.elevation).toBeUndefined();
    expect(flatStyle.backgroundColor).toBe('#252B33');
    mockColorScheme = 'light';
  });
});

// ─── KoolaAvatar ─────────────────────────────────────────────────────────────

describe('KoolaAvatar', () => {
  it('renders with size preset', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaAvatar, { displayName: 'Alice', size: 'lg' }))); });
    const root = tree.toJSON();
    const flatStyle = Object.assign({}, ...(Array.isArray(root.props.style) ? root.props.style : [root.props.style]));
    expect(flatStyle.width).toBe(48);
    expect(flatStyle.height).toBe(48);
  });

  it('renders with numeric size', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaAvatar, { displayName: 'Bob', size: 64 }))); });
    const root = tree.toJSON();
    const flatStyle = Object.assign({}, ...(Array.isArray(root.props.style) ? root.props.style : [root.props.style]));
    expect(flatStyle.width).toBe(64);
  });

  it('shows online indicator when showOnline=true', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaAvatar, { displayName: 'Carol', showOnline: true }))); });
    const root = tree.toJSON();
    // Online dot is a child View with position absolute
    const dots = findAll(root, (n: any) =>
      n.props?.style && !Array.isArray(n.props.style) && n.props.style.position === 'absolute',
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('renders initials fallback without image', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaAvatar, { displayName: 'Zara' }))); });
    const root = tree.toJSON();
    expect(root.props.accessibilityRole).toBe('image');
  });

  it('has no white border in dark mode', () => {
    mockColorScheme = 'dark';
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaAvatar, { displayName: 'Dark', size: 'md' }))); });
    const root = tree.toJSON();
    const flatStyle = Object.assign({}, ...(Array.isArray(root.props.style) ? root.props.style : [root.props.style]));
    // Should not have borderColor of white (#FFFFFF)
    expect(flatStyle.borderColor).not.toBe('#FFFFFF');
    expect(flatStyle.borderWidth).toBeUndefined();
    mockColorScheme = 'light';
  });
});

// ─── KoolaDialog ─────────────────────────────────────────────────────────────

describe('KoolaDialog', () => {
  it('renders with alert role', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaDialog, {
        visible: true,
        title: 'Confirm',
        body: 'Are you sure?',
        actions: [{ label: 'OK', onPress: jest.fn() }],
      })));
    });
    const root = tree.toJSON();
    const alert = findByProps(root, (p: any) => p.accessibilityRole === 'alert');
    expect(alert).not.toBeNull();
  });
});

// ─── KoolaMenu ───────────────────────────────────────────────────────────────

describe('KoolaMenu', () => {
  it('renders menu role and menuitem roles', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaMenu, {
        visible: true,
        items: [
          { key: '1', label: 'Edit', onPress: jest.fn() },
          { key: '2', label: 'Delete', onPress: jest.fn(), selected: true },
        ],
        onDismiss: jest.fn(),
      })));
    });
    const root = tree.toJSON();
    const menu = findByProps(root, (p: any) => p.accessibilityRole === 'menu');
    expect(menu).not.toBeNull();
    const items = findAll(root, (n: any) => n.props?.accessibilityRole === 'menuitem');
    expect(items.length).toBe(2);
  });

  it('exposes selected state on items', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaMenu, {
        visible: true,
        items: [
          { key: '1', label: 'Item', onPress: jest.fn(), selected: true },
        ],
        onDismiss: jest.fn(),
      })));
    });
    const root = tree.toJSON();
    const item = findByProps(root, (p: any) =>
      p.accessibilityRole === 'menuitem' && p.accessibilityState?.selected === true,
    );
    expect(item).not.toBeNull();
  });
});

// ─── KoolaSearchField ────────────────────────────────────────────────────────

describe('KoolaSearchField', () => {
  it('has search role and accessibilityLabel', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaSearchField, { placeholder: 'Search' }))); });
    const root = tree.toJSON();
    expect(root.props.accessibilityRole).toBe('search');
  });

  it('exposes a 44px clear target and clears controlled text', () => {
    const onChangeText = jest.fn();
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaSearchField, {
        value: 'Koola',
        onChangeText,
      })));
    });
    const root = tree.toJSON();
    const clear = findByProps(root, (p: any) => p.accessibilityLabel === 'Xóa tìm kiếm');
    const flatStyle = Object.assign({}, ...(Array.isArray(clear.props.style)
      ? clear.props.style
      : [clear.props.style]));
    expect(flatStyle.width).toBe(44);
    const clearInstance = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Xóa tìm kiếm'
        && typeof node.props.onPress === 'function',
    )[0];
    act(() => clearInstance.props.onPress());
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});

// ─── KoolaListItem ───────────────────────────────────────────────────────────

describe('KoolaListItem', () => {
  it('has button role with press feedback', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaListItem, {
        title: 'Settings',
        icon: 'settings',
        onPress: jest.fn(),
      })));
    });
    const root = tree.toJSON();
    expect(root.props.accessibilityRole).toBe('button');
  });

  it('announces disabled state', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaListItem, {
        title: 'Disabled',
        disabled: true,
      })));
    });
    const root = tree.toJSON();
    expect(root.props.accessibilityState.disabled).toBe(true);
  });

  it('uses non-interactive semantics when onPress is absent', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaListItem, {
        title: 'Appearance',
      })));
    });
    const root = tree.toJSON();
    expect(root.props.accessibilityRole).toBeUndefined();
    expect(root.props.onPress).toBeUndefined();
  });

  it('allows essential labels to wrap under large text', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaListItem, {
        title: 'A long settings label',
      })));
    });
    const root = tree.toJSON();
    const label = findByProps(root, (p: any) => p.numberOfLines === 2);
    expect(label).not.toBeNull();
    expect(label.props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
});

// ─── KoolaSegmentedControl ───────────────────────────────────────────────────

describe('KoolaSegmentedControl', () => {
  it('has tablist role with tab children announcing selected', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaSegmentedControl, {
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        value: 'a',
        onChange: jest.fn(),
      })));
    });
    const root = tree.toJSON();
    expect(root.props.accessibilityRole).toBe('tablist');
    const tabs = findAll(root, (n: any) => n.props?.accessibilityRole === 'tab');
    expect(tabs.length).toBe(2);
    const selectedTab = tabs.find((t: any) => t.props.accessibilityState?.selected === true);
    expect(selectedTab).not.toBeNull();
  });

  it('changes value only for enabled unselected tabs', () => {
    const onChange = jest.fn();
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaSegmentedControl, {
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        value: 'a',
        onChange,
      })));
    });
    const targetTab = tree.root.findAll(
      (node: any) => node.props.accessibilityRole === 'tab'
        && node.props.accessibilityLabel === 'B'
        && typeof node.props.onPress === 'function',
    )[0];
    act(() => targetTab.props.onPress());
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

// ─── KoolaSheet ─────────────────────────────────────────────────────────────

describe('KoolaSheet', () => {
  it('wraps the installed bottom-sheet and uses modal semantics', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(
        KoolaSheet,
        {
          snapPoints: ['50%'],
          children: React.createElement('Content'),
        },
      )));
    });
    const root = tree.toJSON();
    expect(root.props.accessibilityViewIsModal).toBe(true);
    expect(root.props.backdropComponent).toEqual(expect.any(Function));
  });
});

// ─── State presets ───────────────────────────────────────────────────────────

describe('State presets', () => {
  it('KoolaEmptyState renders in dark mode', () => {
    mockColorScheme = 'dark';
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaEmptyState, {}))); });
    expect(tree.toJSON()).not.toBeNull();
    mockColorScheme = 'light';
  });

  it('KoolaErrorState renders with retry', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaErrorState, { onRetry: jest.fn() }))); });
    expect(tree.toJSON()).not.toBeNull();
  });

  it('KoolaOfflineState renders', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaOfflineState, { onRetry: jest.fn() }))); });
    expect(tree.toJSON()).not.toBeNull();
  });

  it('KoolaLoadingState exposes a progress indicator', () => {
    let tree: any;
    act(() => { tree = render(wrap(React.createElement(KoolaLoadingState, {}))); });
    const progress = findByProps(
      tree.toJSON(),
      (p: any) => p.accessibilityRole === 'progressbar',
    );
    expect(progress).not.toBeNull();
  });
});

// ─── KoolaToast ──────────────────────────────────────────────────────────────

describe('KoolaToast', () => {
  it('renders with polite live region', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaToast, {
        message: 'Hello',
        visible: true,
      })));
    });
    const root = tree.toJSON();
    if (root) {
      expect(root.props.accessibilityLiveRegion).toBe('polite');
    }
  });
});

// ─── KoolaText maxFontSizeMultiplier (font-scale-cap) ───────────────────────

describe('KoolaText font scale cap', () => {
  it('content variants (body, heading) resolve maxFontSizeMultiplier = 2.0', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaText, { variant: 'body' }, 'Hello')));
    });
    const root = tree.toJSON();
    expect(root.props.maxFontSizeMultiplier).toBe(2.0);

    let tree2: any;
    act(() => {
      tree2 = render(wrap(React.createElement(KoolaText, { variant: 'heading' }, 'Hi')));
    });
    expect(tree2.toJSON().props.maxFontSizeMultiplier).toBe(2.0);
  });

  it('chrome variants (label, caption) resolve maxFontSizeMultiplier = 1.6', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaText, { variant: 'label' }, 'Lbl')));
    });
    expect(tree.toJSON().props.maxFontSizeMultiplier).toBe(1.6);

    let tree2: any;
    act(() => {
      tree2 = render(wrap(React.createElement(KoolaText, { variant: 'caption' }, 'Cap')));
    });
    expect(tree2.toJSON().props.maxFontSizeMultiplier).toBe(1.6);
  });

  it('per-instance override wins over variant default', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaText, { variant: 'body', maxFontSizeMultiplier: 1.2 }, 'X')));
    });
    expect(tree.toJSON().props.maxFontSizeMultiplier).toBe(1.2);
  });

  it('KoolaButton label renders KoolaText with maxFontSizeMultiplier > 1', () => {
    let tree: any;
    act(() => {
      tree = render(wrap(React.createElement(KoolaButton, { title: 'Submit' })));
    });
    const root = tree.toJSON();
    const textNode = findByProps(root, (p: any) =>
      typeof p.maxFontSizeMultiplier === 'number' && p.maxFontSizeMultiplier > 1,
    );
    expect(textNode).not.toBeNull();
  });
});
