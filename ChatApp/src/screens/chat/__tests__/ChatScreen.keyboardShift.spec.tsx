/**
 * ChatScreen.keyboardShift.spec.tsx — regression guard for the keyboard shift.
 *
 * THE DEFECT THIS GUARDS
 * The window is edge-to-edge (MainActivity clears decorFitsSystemWindows and
 * App.tsx's KeyboardProvider keeps it that way), so the manifest's
 * `adjustResize` no longer resizes the layout — the keyboard arrives as a window
 * inset only. GiftedChat's own handling, which translates the whole list +
 * composer block, is off on purpose (`isKeyboardInternallyHandled={false}`:
 * translating a mounted FlatList through the library's Animated.View was the
 * jank source). With it off, only ChatComposer followed the keyboard, so the
 * dock floated up over the keyboard while the list stayed full-height — the
 * newest message, pinned to the bottom of the window, sat hidden behind both.
 *
 * WHAT THIS FILE PROVES, AND HOW
 * Two different claims, asserted with two different instruments:
 *
 *   1. BEHAVIOURAL — the override mechanism works. The fix passes an animated
 *      `style` through `listViewProps`, which only moves anything if the
 *      library spreads `listViewProps` AFTER its own `style={fill}` on a
 *      component that can consume an animated style. That is a fact about
 *      node_modules, not about our source, so it is proven by rendering the
 *      real `MessageContainer` and reading the style the inner list received.
 *      This is the half that silently breaks on a gifted-chat upgrade.
 *
 *   2. STRUCTURAL — ChatScreen still wires it. ChatScreen cannot be rendered in
 *      jest (the GiftedChat/Fabric dependency chain does not survive the Node
 *      test environment), so this follows the instrument already used by
 *      ChatScreen.scrollOnSend.spec.tsx and ChatScreen.viewability.spec.tsx:
 *      source assertions, scoped to the one object under test. The failure mode
 *      here is literally "the shift goes away" or "the two shifts disagree",
 *      which is what these detect.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import { FlatList, Platform, ScrollView, StyleSheet } from 'react-native';

const SRC_ROOT = path.join(__dirname, '..', '..', '..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');

// ─── 1. Behavioural: an inverted list loses its flip to any transform ─────────

describe('a transform on an inverted list replaces the inversion flip', () => {
  /**
   * The regression this pins down: the first version of the keyboard shift
   * passed `transform: [{ translateY }]` and every message rendered upside
   * down. `inverted` is implemented by VirtualizedList composing its own flip
   * BEFORE the caller's style and flipping each cell back; `transform` is one
   * property rather than a set of mergeable parts, so a caller transform
   * REPLACES the outer flip and only the per-cell flip survives.
   *
   * Asserted against the real FlatList so it stays true to what RN actually
   * does, rather than to a belief about it.
   */
  function scrollViewStyleOf(element: React.ReactElement) {
    let tree: any;
    act(() => {
      tree = render(element);
    });
    // The inner ScrollView is what carries the list's own style.
    return StyleSheet.flatten(tree.root.findByType(ScrollView).props.style);
  }

  const listProps = {
    data: [],
    renderItem: () => null,
    inverted: true,
  } as const;

  it('an inverted list flips by scale: -1 (android) / scaleY: -1 (ios)', () => {
    expect(scrollViewStyleOf(React.createElement(FlatList, listProps)).transform).toEqual([
      Platform.OS === 'android' ? { scale: -1 } : { scaleY: -1 },
    ]);
  });

  it('matches VirtualizedList’s platform split on BOTH branches', () => {
    // Jest runs this suite as ios (`react-native` preset), so the renders above
    // only ever exercise the `scaleY: -1` branch — while the Android device the
    // bug was reported on takes the `scale: -1` one. Reading the library's own
    // style closes that gap: it is the single source both branches have to
    // mirror, and it moves between RN versions (`scale` vs `scaleY` on Android
    // has changed before). A mismatch here mirrors every row horizontally.
    const virtualizedListSource = fs.readFileSync(
      require.resolve('@react-native/virtualized-lists/Lists/VirtualizedList'),
      'utf8',
    );
    expect(virtualizedListSource).toMatch(
      /verticallyInverted:\s*Platform\.OS === 'android'\s*\?\s*\{transform: \[\{scale: -1\}\]\}\s*:\s*\{transform: \[\{scaleY: -1\}\]\}/,
    );
  });

  it('composes the caller style AFTER the inversion — so ours wins', () => {
    // The mechanism behind the upside-down bug, asserted at its source rather
    // than inferred: the flip is composed first, so a caller transform replaces
    // it. If RN ever reversed this order the re-declared flip would become the
    // thing that gets dropped, and the list would stop being inverted at all.
    const virtualizedListSource = fs.readFileSync(
      require.resolve('@react-native/virtualized-lists/Lists/VirtualizedList'),
      'utf8',
    );
    expect(virtualizedListSource).toMatch(
      /style: inversionStyle\s*\?\s*\[inversionStyle, this\.props\.style\]/,
    );
  });

  it('a bare translateY wipes that flip — the upside-down bug', () => {
    const style = scrollViewStyleOf(
      React.createElement(FlatList, { ...listProps, style: { transform: [{ translateY: -400 }] } }),
    );
    expect(style.transform).toEqual([{ translateY: -400 }]);
  });

  it('re-declaring the flip alongside translateY preserves both', () => {
    // What ChatScreen does. translateY is listed FIRST so it acts in unflipped
    // screen space (RN applies the array like CSS: leftmost is outermost), which
    // is what keeps a negative keyboard height moving the list up rather than down.
    const flip = Platform.OS === 'android' ? { scale: -1 } : { scaleY: -1 };
    const style = scrollViewStyleOf(
      React.createElement(FlatList, {
        ...listProps,
        style: { transform: [{ translateY: -400 }, flip] },
      }),
    );
    expect(style.transform).toEqual([{ translateY: -400 }, flip]);
  });
});

// ─── 2. Behavioural: listViewProps.style reaches the list and wins ────────────

describe('gifted-chat lets listViewProps override the list style', () => {
  // The real MessageContainer. Its Animated.FlatList comes from the reanimated
  // mock (jest/setup.js), which forwards props to a plain FlatList — enough to
  // observe prop precedence, which is the only thing under test here.
  const MessageContainer = require('react-native-gifted-chat/lib/MessageContainer').default;

  const MARKER = { marginTop: 1234 };

  function renderWith(listViewProps: Record<string, unknown>) {
    let tree: any;
    act(() => {
      tree = render(
        React.createElement(MessageContainer, {
          messages: [],
          user: { _id: 'me' },
          listViewProps,
          invertibleScrollViewProps: { inverted: true },
          forwardRef: React.createRef(),
        }),
      );
    });
    return tree.root.findByType(FlatList).props.style;
  }

  it('a style passed via listViewProps lands on the inner list', () => {
    // If the library ever spreads listViewProps BEFORE its own style, or stops
    // forwarding `style` at all, the marker disappears and the keyboard shift
    // silently stops moving the list while the composer keeps moving.
    const flattened = StyleSheet.flatten(renderWith({ style: [{ flex: 1 }, MARKER] }));
    expect(flattened).toMatchObject(MARKER);
  });

  it('without the override the list keeps the library default — flex: 1', () => {
    // Establishes what the override replaces, which is why ChatScreen has to
    // restore `flex: 1` itself (asserted structurally below).
    expect(StyleSheet.flatten(renderWith({}))).toMatchObject({ flex: 1 });
  });
});

// ─── 3. Structural: ChatScreen wires the shift, and wires it consistently ─────

describe('ChatScreen shifts the message list with the keyboard', () => {
  const chatScreenSource = readSource('screens/chat/ChatScreen.tsx');
  const composerSource = readSource('screens/chat/components/ChatComposer.tsx');

  /** The `stableListViewProps` object literal, by brace matching. */
  const listViewPropsBody = (() => {
    const anchor = 'const stableListViewProps = useMemo(';
    const start = chatScreenSource.indexOf(anchor);
    expect(start).toBeGreaterThan(-1);
    const open = chatScreenSource.indexOf('{', chatScreenSource.indexOf('=>', start));
    let depth = 0;
    for (let i = open; i < chatScreenSource.length; i++) {
      if (chatScreenSource[i] === '{') depth++;
      else if (chatScreenSource[i] === '}' && --depth === 0)
        return chatScreenSource.slice(open, i + 1);
    }
    throw new Error('unbalanced braces in stableListViewProps');
  })();

  it('derives the shift from the keyboard on the UI thread', () => {
    // useReanimatedKeyboardAnimation + useAnimatedStyle keep this a worklet.
    // A JS-thread listener (Keyboard.addListener / useKeyboardHandler writing
    // state) would re-render GiftedChat per keyboard frame, which is the cost
    // this screen's memo boundary exists to avoid.
    expect(chatScreenSource).toMatch(/useReanimatedKeyboardAnimation\(\)/);
    expect(chatScreenSource).toMatch(
      /transform: \[\{ translateY: keyboard\.height\.value \}, LIST_INVERSION_FLIP\]/,
    );
  });

  it('carries the inversion flip, split by platform like VirtualizedList', () => {
    // Guards the upside-down regression proven behaviourally above. The
    // platform split has to match RN's (`scale: -1` on android, `scaleY: -1`
    // elsewhere) or the rows mirror horizontally instead.
    expect(chatScreenSource).toMatch(
      /LIST_INVERSION_FLIP[^=]*=\s*Platform\.OS === 'android' \? \{ scale: -1 \} : \{ scaleY: -1 \}/,
    );
  });

  it('resolves the flip outside the worklet', () => {
    // Reading Platform.OS inside the animated style would hand the UI thread a
    // module lookup on every keyboard frame.
    const styleBody = chatScreenSource.slice(
      chatScreenSource.indexOf('const listShiftStyle = useAnimatedStyle'),
      chatScreenSource.indexOf('const { tokens } = useTheme();'),
    );
    expect(styleBody).not.toMatch(/Platform/);
  });

  it('applies the shift to the list and keeps flex: 1', () => {
    // Overriding the library's `style={fill}` drops its flex, so the override
    // has to supply it or the list collapses to zero height.
    expect(listViewPropsBody).toMatch(/style: \[\{ flex: 1 \}, listShiftStyle\]/);
  });

  it('keeps the memo input honest about the animated style', () => {
    // useAnimatedStyle returns a stable reference, so listing it costs no extra
    // renders — but omitting it from the dep array is a stale-closure trap for
    // whoever edits this next.
    const deps = chatScreenSource.slice(
      chatScreenSource.indexOf('[composerScrollClearance, notchPadTop'),
    );
    expect(deps).toMatch(/^\[composerScrollClearance, notchPadTop, listShiftStyle\]/);
  });

  it('shifts the list by the same value the composer dock uses', () => {
    // The two must agree: the composer clearance reserved in
    // contentContainerStyle.paddingTop is only still correct if list and dock
    // travel together. If one gains an offset the other lacks, the dock either
    // overlaps the newest message again or floats away from the keyboard.
    expect(composerSource).toMatch(/translateY: keyboard\.height\.value \+ 24 \* exitProgress\.value/);
    expect(chatScreenSource).toMatch(/translateY: keyboard\.height\.value \}/);
  });

  it('leaves the library’s own keyboard handling off', () => {
    // Turning it back on would translate the list a second time, through
    // GiftedChat's Animated.View — double movement, plus the jank the flag was
    // set to false to avoid.
    expect(chatScreenSource).toMatch(/isKeyboardInternallyHandled=\{false\}/);
  });
});
