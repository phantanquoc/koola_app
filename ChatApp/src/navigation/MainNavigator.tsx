import React from 'react';
import { Platform, Pressable, StyleSheet, Vibration, View } from 'react-native';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { BlurView } from '@sbaiahmed1/react-native-blur';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { MainTabParamList } from './types';
import ChatTabStack from './ChatTabStack';
import ShoppingTabStack from './ShoppingTabStack';
import ConnectTabStack from './ConnectTabStack';
import SupportTabStack from './SupportTabStack';
import PersonalTabStack from './PersonalTabStack';
import { requestChatHomeReset } from './chatTabReset';
import {
  createTabDockSuppressionStore,
  noopTabDockSuppressionStore,
  type TabDockSuppressionStore,
} from './tabDockSuppressionStore';
import {
  KoolaText,
  koolaDarkShadows,
  koolaShadows,
  useTheme,
} from '../ui';
import type { Palette } from '../ui/theme';
import { koolaDurations, prefersReducedMotion } from '../ui/tokens/motion';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Context carries a STABLE store (never the boolean) so suppress/release does
// not re-render MainNavigator or the Tab.Navigator — only the tab bar, which
// subscribes via useSyncExternalStore. See tabDockSuppressionStore.ts.
const TabDockSuppressionContext = React.createContext<TabDockSuppressionStore>(
  noopTabDockSuppressionStore,
);

export function useTabDockSuppression(): () => () => void {
  return React.useContext(TabDockSuppressionContext).suppress;
}

function useIsTabDockSuppressed(): boolean {
  const store = React.useContext(TabDockSuppressionContext);
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot);
}

const FULLSCREEN_CHAT_ROUTES: Record<string, true> = { Chat: true, MomentViewer: true, MomentComposer: true };
const FULLSCREEN_PERSONAL_ROUTES: Record<string, true> = { EditProfile: true, StorageSettings: true, SettingsDetail: true, UpgradeAccount: true, AccountList: true, PersonalOrders: true, PersonalOrderDetail: true };
const FULLSCREEN_SHOPPING_ROUTES: Record<string, true> = { ShoppingProductDetail: true, ShoppingStorefront: true, ShoppingCart: true, ShoppingCheckout: true, ShoppingOrders: true, ShoppingOrderDetail: true };
const FULLSCREEN_CONNECT_ROUTES: Record<string, true> = { BusinessProfile: true, BusinessSearch: true };
export const TAB_BAR_FLOATING_INSET = 86;

const TAB_DOCK_HEIGHT = 32; // minimal height matching icon box
// Extra clearance ABOVE the floating dock so scrollable lists can't push their
// last item into the area covered by the dock.
const TAB_DOCK_BOTTOM_BUFFER = 12;

/**
 * Returns the actual pixel clearance needed at the bottom of any
 * scrollable content so the last item stays above the floating dock,
 * accounting for the device's safe-area inset (iPhone notch, Android nav bar).
 */
export function useTabBarBottomInset(): number {
  const insets = useSafeAreaInsets();
  return TAB_DOCK_HEIGHT + Math.max(insets.bottom, 4) + TAB_DOCK_BOTTOM_BUFFER;
}

type TabName = keyof MainTabParamList;

const TAB_META: Record<TabName, {
  label: string;
  accessibilityLabel: string;
  focusedIcon: string;
  icon: string;
}> = {
  ChatTab: {
    label: 'Trò chuyện',
    accessibilityLabel: 'Trò chuyện',
    focusedIcon: 'chat-bubble',
    icon: 'chat-bubble-outline',
  },
  ShoppingTab: {
    label: 'Mua sắm',
    accessibilityLabel: 'Mua sắm',
    focusedIcon: 'shopping-cart',
    icon: 'shopping-cart',
  },
  ConnectTab: {
    label: 'Kết nối',
    accessibilityLabel: 'Kết nối',
    focusedIcon: 'handshake',
    icon: 'handshake',
  },
  SupportTab: {
    label: 'Dịch vụ',
    accessibilityLabel: 'Dịch vụ',
    focusedIcon: 'category',
    icon: 'category',
  },
  PersonalTab: {
    label: 'Cá nhân',
    accessibilityLabel: 'Cá nhân',
    focusedIcon: 'person',
    icon: 'person-outline',
  },
};

function shouldHideTabBar(route: RouteProp<MainTabParamList, TabName>): boolean {
  if (route.name === 'ChatTab') {
    const focused = getFocusedRouteNameFromRoute(
      route as RouteProp<MainTabParamList, 'ChatTab'>,
    ) ?? 'ChatHome';
    return !!FULLSCREEN_CHAT_ROUTES[focused];
  }
  if (route.name === 'PersonalTab') {
    const focused = getFocusedRouteNameFromRoute(
      route as RouteProp<MainTabParamList, 'PersonalTab'>,
    ) ?? 'PersonalHome';
    return !!FULLSCREEN_PERSONAL_ROUTES[focused];
  }
  if (route.name === 'ShoppingTab') {
    const focused = getFocusedRouteNameFromRoute(
      route as RouteProp<MainTabParamList, 'ShoppingTab'>,
    ) ?? 'ShoppingHome';
    return !!FULLSCREEN_SHOPPING_ROUTES[focused];
  }
  if (route.name === 'ConnectTab') {
    const focused = getFocusedRouteNameFromRoute(
      route as RouteProp<MainTabParamList, 'ConnectTab'>,
    ) ?? 'ConnectHome';
    return !!FULLSCREEN_CONNECT_ROUTES[focused];
  }
  return false;
}


/**
 * Icon host — square box with rounded corners + orange→blue gradient border.
 * Replaces the old pill. Size drives both the resting glyph box and the box,
 * so they never drift apart. Radius 11 gives a "squircle" square, not a circle.
 */
const TAB_ICON_BOX_W = 44;
const TAB_ICON_BOX_H = 32;
const TAB_ICON_BOX_RADIUS = 11;

/** Must equal `styles.tabDockContent.paddingHorizontal` — slot math uses it. */
const TAB_DOCK_PAD_X = 10;
/** Hold time before a press turns into a drag. Shorter than Pressable's
 *  500ms long-press so `tabLongPress` never fires mid-drag. */
const TAB_DRAG_ACTIVATE_MS = 220;
/** Border chasing the finger: stiff + ~critically damped (ζ≈1.04), no
 *  overshoot. Steady-state lag ≈ 28ms × finger speed — the previous
 *  600/0.5 config lagged ~66ms, over a full slot on a fast flick. */
const TAB_DRAG_FOLLOW_SPRING = { damping: 44, stiffness: 1500, mass: 0.3 } as const;
/** Release snap into the nearest slot: a touch of settle. */
const TAB_DRAG_SPRING = { damping: 18, stiffness: 260, mass: 0.6 } as const;
/** Peak icon growth under the finger (macOS-dock style); neighbours get a
 *  Gaussian falloff of it, so the wave rolls with the drag. */
const TAB_DRAG_MAGNIFY = 0.16;
/** Icon rise at peak magnification, in px (negative = up). */
const TAB_DRAG_MAGNIFY_LIFT = -3;
/** Border rise while held — it reads as "picked up" off the dock. */
const TAB_DRAG_BORDER_LIFT = -2;
/** Canvas padding around the hold-glow stroke so it isn't clipped. */
const TAB_GLOW_PAD = 6;
/** Max extra width (fraction) the border stretches at fast drag speed. */
const TAB_DRAG_STRETCH_MAX = 0.32;
/** Drag speed (px/s) that produces the full stretch. */
const TAB_DRAG_STRETCH_VELOCITY = 1800;
/** Max overscroll (in slots) past the first/last tab, with resistance. */
const TAB_DRAG_OVERSCROLL = 0.35;

/** Detent pulse length (ms) when a drag crosses into another tab slot. */
const TAB_HAPTIC_TICK_MS = 10;

/**
 * Short detent tick while press-dragging across tabs. Android only: built-in
 * `Vibration` honours a duration there (VIBRATE is already in the manifest),
 * while iOS ignores it and plays a ~400ms buzz — far too heavy for a detent.
 * A proper haptics module would cover iOS too, but needs a dependency + rebuild.
 */
function tabHapticTick(): void {
  if (Platform.OS === 'android') {
    Vibration.vibrate(TAB_HAPTIC_TICK_MS);
  }
}

/** Clamp to [0, last], rubber-banding the overflow instead of hard-stopping. */
function rubberBandSlot(raw: number, last: number): number {
  'worklet';
  if (raw < 0) {
    return -TAB_DRAG_OVERSCROLL * (1 - 1 / (1 + -raw / TAB_DRAG_OVERSCROLL));
  }
  if (raw > last) {
    return last + TAB_DRAG_OVERSCROLL * (1 - 1 / (1 + (raw - last) / TAB_DRAG_OVERSCROLL));
  }
  return raw;
}

interface TabIcon3DProps {
  /** Glyph for the muted (unfocused) layer. */
  name: string;
  /** Glyph for the gradient (focused) layer. Both layers stay mounted so the
   *  swap is a cross-fade driven by `focusProgress`, which follows the drag. */
  focusedName: string;
  focusProgress: SharedValue<number>;
  pressProgress: SharedValue<number>;
  /** 0..1 dock-style magnification while press-dragging (0 at rest). */
  magnifyProgress: SharedValue<number>;
  palette: Palette;
  resolvedScheme: 'light' | 'dark';
}

const TabIcon3D: React.FC<TabIcon3DProps> = ({
  name,
  focusedName,
  focusProgress,
  pressProgress,
  magnifyProgress,
  palette,
  resolvedScheme,
}) => {
  const wrapperStyle = useAnimatedStyle(() => {
    const press = pressProgress.value;
    const mag = magnifyProgress.value;
    return {
      transform: [
        { translateY: TAB_DRAG_MAGNIFY_LIFT * mag },
        { scale: (1 - 0.08 * press) * (1 + TAB_DRAG_MAGNIFY * mag) },
      ],
    };
  });

  // Glyph gradient keeps cam→xanh notion; border is now a single traveling frame owned by the tab bar
  const instanceId = React.useId();
  const cleanId = instanceId.replace(/:/g, '_');
  const gradFrom = resolvedScheme === 'light' ? '#FF8A1A' : '#FF9A3D';
  const gradTo = resolvedScheme === 'light' ? '#2563EB' : '#4D8DF7';
  const glyphGradId = `tabIconGlyph-${cleanId}-${resolvedScheme}`;

  const glyphChar = React.useMemo(() => {
    const map: Record<string, number> = {
      'chat-bubble': 0xe0ca,
      'chat-bubble-outline': 0xe0cb,
      'shopping-cart': 0xe8cc,
      handshake: 0xebcb,
      category: 0xe574,
      person: 0xe7fd,
      'person-outline': 0xe7ff,
    };
    const cp = map[focusedName] ?? 0xe3c9;
    return String.fromCharCode(cp);
  }, [focusedName]);

  const mutedStyle = useAnimatedStyle(() => ({
    opacity: 1 - focusProgress.value,
  }));
  const glyphGradStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }));

  // Ghost-border: drop per-item iconBox (travelBorder is sole frame)
  return (
    <View style={styles.iconHost}>
      <Animated.View pointerEvents="none" style={[styles.glyphWrap, wrapperStyle]}>
        <View style={styles.glyphStack}>
          {/* Muted glyph — visible when unfocused, fades out on focus */}
          <Animated.View pointerEvents="none" style={[styles.glyphLayer, mutedStyle]}>
            <MaterialIcons name={name} size={22} color={palette.muted} />
          </Animated.View>
          {/* Gradient glyph — fades in on focus (cam → xanh) */}
          <Animated.View pointerEvents="none" style={[styles.glyphLayer, glyphGradStyle]}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Defs>
                <SvgLinearGradient id={glyphGradId} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={gradTo} />
                  <Stop offset="1" stopColor={gradFrom} />
                </SvgLinearGradient>
              </Defs>
              <SvgText
                x="12"
                y="12"
                textAnchor="middle"
                alignmentBaseline="central"
                fontFamily="MaterialIcons"
                fontSize={22}
                fill={`url(#${glyphGradId})`}>
                {glyphChar}
              </SvgText>
            </Svg>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
};

interface TabBarItemProps {
  meta: (typeof TAB_META)[TabName];
  index: number;
  /** Fractional tab index of the traveling border (shared by all items). */
  indicatorX: SharedValue<number>;
  /** 1 while press-dragging (0 for taps and when reduce-motion is on). */
  dragLift: SharedValue<number>;
  /** Tab index that should be tinted when the tint isn't following the drag. */
  tintIndex: SharedValue<number>;
  /** 1 while tint follows the border (press-drag + its release settle). */
  dragTint: SharedValue<number>;
  /** Worklet-readable reduce-motion flag. */
  reduceMotion: SharedValue<boolean>;
  /** a11y only — tint is driven by `tintIndex` / `dragTint`. */
  isFocused: boolean;
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
  onLongPress: () => void;
  palette: Palette;
  resolvedScheme: 'light' | 'dark';
}

const TabBarItemComponent: React.FC<TabBarItemProps> = ({
  meta,
  index,
  indicatorX,
  dragLift,
  tintIndex,
  dragTint,
  reduceMotion,
  isFocused,
  accessibilityLabel,
  label,
  onPress,
  onLongPress,
  palette,
  resolvedScheme,
}) => {
  const press = useSharedValue(0);
  // Tap tint: only the old and new tab cross-fade (220ms, with the glide), so
  // tabs the border passes over on a long tap glide never flash.
  const tapFocus = useSharedValue(tintIndex.value === index ? 1 : 0);
  useAnimatedReaction(
    () => tintIndex.value,
    (cur, prev) => {
      if (cur === prev) return;
      const to = cur === index ? 1 : 0;
      // While tint follows the border, snap instead: it's invisible then, and
      // leaves the final state ready for the hand-off back to tap tint.
      tapFocus.value = dragTint.value === 1
        ? to
        : withTiming(to, {
          duration: reduceMotion.value ? koolaDurations.fast : 220,
          easing: Easing.out(Easing.cubic),
        });
    },
  );
  // Drag tint = proximity of the traveling border to this slot (1 under it, 0
  // one slot away), so the tint tracks the finger on the UI thread. At rest
  // the border sits on the tinted tab, so both sources agree at every switch.
  const focus = useDerivedValue(() => {
    const prox = Math.max(0, 1 - Math.abs(indicatorX.value - index));
    return dragTint.value === 1 ? prox : tapFocus.value;
  });
  // Dock wave: Gaussian of the distance to the border (σ ≈ 0.6 slot), so the
  // icon under the finger peaks and its neighbours swell slightly. Gated by
  // dragLift — taps and the tab-switch glide never magnify.
  const magnify = useDerivedValue(() => {
    const d = indicatorX.value - index;
    return dragLift.value * Math.exp(-(d * d) / 0.72);
  });
  const labelMutedStyle = useAnimatedStyle(() => ({ opacity: 1 - focus.value }));
  const labelActiveStyle = useAnimatedStyle(() => ({ opacity: focus.value }));

  const handlePressIn = React.useCallback(() => {
    press.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [press]);

  const handlePressOut = React.useCallback(() => {
    press.value = withTiming(0, { duration: koolaDurations.fast, easing: Easing.out(Easing.cubic) });
  }, [press]);

  // Press feedback lives on the glyph only (TabIcon3D, 0.92). Scaling the
  // whole item as well compounded to ~0.87 on the icon and shrank the label.
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isFocused }}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}>
      <TabIcon3D
        name={meta.icon}
        focusedName={meta.focusedIcon}
        focusProgress={focus}
        pressProgress={press}
        magnifyProgress={magnify}
        palette={palette}
        resolvedScheme={resolvedScheme}
      />
      {/* Two stacked labels cross-faded by `focus` — tone/weight can't be
          interpolated, but opacity can, so the tint follows the drag. */}
      <View style={styles.labelStack}>
        <Animated.View style={labelMutedStyle}>
          <KoolaText
            variant="caption"
            weight="600"
            tone="muted"
            numberOfLines={1}
            // The dock is fixed-size chrome, so labels must not scale with the OS font
            // setting (a 1.25 scale overflows the 5 slots) and must not auto-shrink —
            // adjustsFontSizeToFit made the longest label ("Trò chuyện") render smaller
            // than the rest, and it was the active one, inverting the visual hierarchy.
            allowFontScaling={false}
            style={styles.tabLabel}>
            {label}
          </KoolaText>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.labelOverlay, labelActiveStyle]}>
          <KoolaText
            variant="caption"
            weight="700"
            tone="primary"
            numberOfLines={1}
            allowFontScaling={false}
            style={styles.tabLabel}>
            {label}
          </KoolaText>
        </Animated.View>
      </View>
    </Pressable>
  );
};

// Tint is driven by shared values on the UI thread, so a tab switch
// re-renders only the two items whose `isFocused` (a11y state) flips. Ignore
// callback identity because each callback is route-local.
const TabBarItem = React.memo(
  TabBarItemComponent,
  (previous, next) => (
    previous.meta === next.meta &&
    previous.index === next.index &&
    previous.indicatorX === next.indicatorX &&
    previous.dragLift === next.dragLift &&
    previous.tintIndex === next.tintIndex &&
    previous.dragTint === next.dragTint &&
    previous.reduceMotion === next.reduceMotion &&
    previous.isFocused === next.isFocused &&
    previous.accessibilityLabel === next.accessibilityLabel &&
    previous.label === next.label &&
    previous.palette === next.palette &&
    previous.resolvedScheme === next.resolvedScheme
  ),
);

// The glass fill is rendered inline inside CustomKoolaTabBar's BlurView so tab
// items are BlurView *children* (excluded from the blur snapshot via the
// isRendering guard). A sibling BlurView would capture the items and ghost
// them — the double-border seen after Chat push/pop when the dock remounts.

const TAB_COUNT = 5;

const CustomKoolaTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { palette, resolvedScheme } = useTheme();
  const isTabDockSuppressed = useIsTabDockSuppressed();
  const activeRoute = state.routes[state.index] as RouteProp<MainTabParamList, TabName>;
  const isHidden = isTabDockSuppressed || shouldHideTabBar(activeRoute);
  // Measured dock width, UI-thread only — slot math and the border's
  // first-layout visibility both read it in worklets, so layout costs no
  // React re-render.
  const dockWidthSV = useSharedValue(0);
  const indicatorX = useSharedValue(state.index);
  const squish = useSharedValue(0);
  // 1 while the user is press-and-dragging across the dock ("picked up" frame).
  const dragLift = useSharedValue(0);
  // Extra border width from drag speed; springs back to 0 when the finger slows.
  const dragStretch = useSharedValue(0);
  // Worklet-readable copy of the system reduce-motion setting.
  const reduceMotionSV = useSharedValue(prefersReducedMotion());
  React.useEffect(() => {
    reduceMotionSV.value = prefersReducedMotion();
  });
  // Latest finger position (fractional index) — what a release snaps to.
  const dragTargetSV = useSharedValue(state.index);
  // Committed tab index, readable from gesture worklets for cancel/spring-back.
  const activeIndexSV = useSharedValue(state.index);
  // Tab the items tint when not following the drag (see TabBarItem).
  const tintIndexSV = useSharedValue(state.index);
  // 1 from drag pick-up until the release spring settles: tint follows the
  // border. Reset only once the border rests on a slot, so the hand-off back
  // to `tintIndexSV` is seamless regardless of navigation commit timing.
  const dragTintSV = useSharedValue(0);
  // Slot the border was last sent to. A drag release already springs the
  // border into the new slot, so recording it here keeps the index effect
  // from re-gliding it from the old slot. Taps and programmatic navigation
  // glide from the index effect, after the new tab has committed, so the
  // mount doesn't stall the animation.
  const borderTargetRef = React.useRef(state.index);
  const stateIndexRef = React.useRef(state.index);
  stateIndexRef.current = state.index;

  const glideBorderTo = React.useCallback(
    (to: number) => {
      const delta = Math.abs(to - borderTargetRef.current);
      borderTargetRef.current = to;
      if (delta === 0) return;
      // A tap mid release-settle interrupts that spring (its reset callback
      // gets finished=false), so hand tint back here. No jump: while dragTint
      // was 1, items snapped `tapFocus` to final values, and the index effect
      // has just retargeted `tintIndexSV` to this tab.
      dragTintSV.value = 0;
      // Longer hops take a little longer, like the original glide.
      const dur = 220 + 35 * delta;
      indicatorX.value = withTiming(to, {
        duration: prefersReducedMotion() ? koolaDurations.fast : dur,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      if (prefersReducedMotion()) return;
      squish.value = withSequence(
        withTiming(1, { duration: dur / 2, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: dur / 2, easing: Easing.out(Easing.cubic) }),
      );
    },
    [dragTintSV, indicatorX, squish],
  );

  React.useEffect(() => {
    activeIndexSV.value = state.index;
    glideBorderTo(state.index);
    // Tint cross-fades alongside the glide, after the navigation commit.
    // Written after the glide so its dragTint reset lands first and the
    // item reaction always times (never snaps) a tap's tint.
    tintIndexSV.value = state.index;
  }, [state.index, activeIndexSV, glideBorderTo, tintIndexSV]);

  // Glass shadow: strip opaque backgroundColor so BlurView shows through.
  // Shadows are invisible on dark anyway; dark elevation is via hairline.
  const dockElevation = React.useMemo(() => {
    if (resolvedScheme === 'dark') {
      const { backgroundColor: _bg, borderTopWidth: _btw, borderTopColor: _btc, ...rest } =
        koolaDarkShadows.xl as unknown as Record<string, unknown>;
      return rest;
    }
    const { backgroundColor: _bg, ...rest } = koolaShadows.xl as unknown as Record<string, unknown>;
    return rest as typeof koolaShadows.xl;
  }, [resolvedScheme]);

  // Fade-only reveal so the dock doesn't pop in after a fullscreen route
  // finishes closing. The un-hide is gated by the pop's own `transitionEnd`
  // (see ChatScreen's dock-release effect), so it starts on the frame the card
  // stops moving — 80ms is short enough to read as "already there" at that
  // moment and long enough to avoid a hard cut. It is intentionally below
  // `koolaDurations.fast` (120ms), so the value is inlined rather than added to
  // the token set. There is no translate: vertical travel would read as a
  // second arrival after the card has cleared. Hiding still snaps to 0 so
  // entering a fullscreen route never shows a visible fade-out, and this is a
  // one-shot value (not a perpetual loop), so it stays unmount-safe.
  const reveal = useSharedValue(isHidden ? 0 : 1);
  React.useEffect(() => {
    reveal.value = isHidden
      ? 0
      : withTiming(1, { duration: 80, easing: Easing.out(Easing.cubic) });
  }, [isHidden, reveal]);

  const routeCount = state.routes.length || TAB_COUNT;

  const travelStyle = useAnimatedStyle(() => {
    const itemWidth = (dockWidthSV.value - TAB_DOCK_PAD_X * 2) / routeCount;
    return {
      // Hidden until measured, otherwise it flashes at the left edge.
      opacity: dockWidthSV.value > 0 ? 1 : 0,
      transform: [{ translateX: TAB_DOCK_PAD_X + indicatorX.value * itemWidth + (itemWidth - TAB_ICON_BOX_W) / 2 }],
    };
  });

  const travelSquishStyle = useAnimatedStyle(() => {
    const lift = dragLift.value;
    const s = dragStretch.value;
    return {
      transform: [
        { translateY: TAB_DRAG_BORDER_LIFT * lift },
        // Liquid stretch: wider along the drag, a little thinner (volume-ish),
        // plus the tap-glide squish and a small "picked up" grow.
        { scaleX: 1 + 0.08 * squish.value + 0.06 * lift + s },
        { scaleY: 1 - 0.04 * squish.value + 0.06 * lift - 0.35 * s },
      ],
    };
  });

  const travelGlowStyle = useAnimatedStyle(() => ({
    opacity: dragLift.value,
  }));

  const selectTab = React.useCallback(
    (index: number): boolean => {
      const route = state.routes[index];
      if (!route) return false;
      const routeName = route.name as TabName;
      const isFocused = state.index === index;
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (event.defaultPrevented) return false;
      if (!isFocused) {
        // Navigating to Chat from another tab: reset to Messages.
        // Signal via emitter instead of navigation params so the
        // route object doesn't change — keeps the switch frame
        // free of navigation-driven re-renders inside ChatHome.
        if (routeName === 'ChatTab') {
          navigation.navigate('ChatTab', { screen: 'ChatHome' } as never);
          requestChatHomeReset();
        } else {
          navigation.navigate(route.name as never);
        }
      } else if (routeName === 'ChatTab') {
        // Reselect Chat while already focused: reset nested tab to Messages.
        navigation.navigate('ChatTab', { screen: 'ChatHome' } as never);
        requestChatHomeReset();
      }
      return true;
    },
    [navigation, state.index, state.routes],
  );
  // TabBarItem's memo ignores callback identity, so items call through this
  // ref to always hit the latest selectTab.
  const selectTabRef = React.useRef(selectTab);
  selectTabRef.current = selectTab;

  // Drag release lands on the JS thread. Read through a ref so the gesture
  // object (and its worklets) stays stable across tab switches.
  // Completion callback for every border spring that may run with dragTint 1:
  // hand tint back to `tintIndexSV` only once the border rests on a slot,
  // where proximity and tap tint agree. Interrupted springs report
  // finished=false, so whichever spring replaces them carries this too.
  const endDragTint = React.useCallback(
    (finished?: boolean) => {
      'worklet';
      if (finished) dragTintSV.value = 0;
    },
    [dragTintSV],
  );

  const commitDragRef = React.useRef<(index: number) => void>(() => {});
  commitDragRef.current = (index: number) => {
    const current = stateIndexRef.current;
    if (index !== current) {
      // The release worklet already springs the border into `index`; record
      // it so the index effect doesn't re-glide from the old slot.
      borderTargetRef.current = index;
      if (selectTab(index)) return;
    }
    // Same tab, or a listener prevented the switch: spring back home. Tint
    // still follows the border here, so retargeting `tintIndexSV` snaps
    // invisibly; this spring interrupts the release one, so it must carry
    // the dragTint reset itself.
    tintIndexSV.value = current;
    borderTargetRef.current = current;
    indicatorX.value = withSpring(current, TAB_DRAG_SPRING, endDragTint);
  };
  const commitDrag = React.useCallback((index: number) => commitDragRef.current(index), []);

  // Slot the finger was last over during a drag — a change fires one tick.
  const dragSlotSV = useSharedValue(-1);

  // Press-and-hold, then slide across the dock: the border follows the finger
  // 1:1 on the UI thread and every icon/label tint follows the border. Plain
  // taps never reach this gesture (it only activates after the long-press
  // delay), so Pressable keeps handling them.
  const dragGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(TAB_DRAG_ACTIVATE_MS)
        .onStart((e) => {
          const itemWidth = (dockWidthSV.value - TAB_DOCK_PAD_X * 2) / routeCount;
          if (itemWidth <= 0) return;
          const pos = rubberBandSlot((e.x - TAB_DOCK_PAD_X) / itemWidth - 0.5, routeCount - 1);
          // Tint follows the border from here (also under reduce motion —
          // that's the feature). The border rests on the tinted tab, so
          // proximity equals tap tint for every item: no jump.
          dragTintSV.value = 1;
          // The press may start several slots away from the current tab, so
          // glide there instead of snapping.
          indicatorX.value = withSpring(pos, TAB_DRAG_FOLLOW_SPRING);
          dragTargetSV.value = pos;
          // Tick on pick-up so the hold reads as "grabbed".
          dragSlotSV.value = Math.min(Math.max(Math.round(pos), 0), routeCount - 1);
          runOnJS(tabHapticTick)();
          // Reduce motion: keep the follow + tint (that's the feature), drop
          // the lift / glow / magnify / stretch flourishes.
          if (!reduceMotionSV.value) {
            dragLift.value = withTiming(1, { duration: koolaDurations.fast, easing: Easing.out(Easing.cubic) });
          }
        })
        .onUpdate((e) => {
          const itemWidth = (dockWidthSV.value - TAB_DOCK_PAD_X * 2) / routeCount;
          if (itemWidth <= 0) return;
          const pos = rubberBandSlot((e.x - TAB_DOCK_PAD_X) / itemWidth - 0.5, routeCount - 1);
          // Stiff spring re-targeted every frame: tracks the finger almost 1:1
          // but keeps velocity, so touch-sample jitter doesn't show as stutter.
          indicatorX.value = withSpring(pos, TAB_DRAG_FOLLOW_SPRING);
          dragTargetSV.value = pos;
          const slot = Math.min(Math.max(Math.round(pos), 0), routeCount - 1);
          if (slot !== dragSlotSV.value) {
            dragSlotSV.value = slot;
            runOnJS(tabHapticTick)();
          }
          if (!reduceMotionSV.value) {
            const speed = Math.min(Math.abs(e.velocityX) / TAB_DRAG_STRETCH_VELOCITY, 1);
            dragStretch.value = withSpring(TAB_DRAG_STRETCH_MAX * speed, TAB_DRAG_FOLLOW_SPRING);
          }
        })
        .onEnd((_e, success) => {
          if (!success) {
            indicatorX.value = withSpring(activeIndexSV.value, TAB_DRAG_SPRING, endDragTint);
            return;
          }
          // Round the finger position (clamped out of the overscroll zone),
          // not the spring's in-flight value.
          const target = Math.min(Math.max(Math.round(dragTargetSV.value), 0), routeCount - 1);
          // dragTint is still 1, so items snap tap tint to the final state
          // invisibly; the hand-off then doesn't wait on the navigation commit.
          tintIndexSV.value = target;
          indicatorX.value = withSpring(target, TAB_DRAG_SPRING, endDragTint);
          runOnJS(commitDrag)(target);
        })
        .onFinalize(() => {
          dragLift.value = withTiming(0, { duration: koolaDurations.normal, easing: Easing.out(Easing.cubic) });
          dragStretch.value = withSpring(0, TAB_DRAG_SPRING);
        }),
    [activeIndexSV, commitDrag, dockWidthSV, dragLift, dragSlotSV, dragStretch, dragTargetSV, dragTintSV, endDragTint, indicatorX, reduceMotionSV, routeCount, tintIndexSV],
  );

  // Ghost fix: don't unmount on fullscreen — that resets dockWidth to 0
  // for one frame after pop, so travelBorder mis-computes itemWidth and
  // flashes at the left edge. Keep mounted but hidden; width stays measured,
  // which is also why the reveal is opacity-only (no translate offset that
  // would need a resting position measured while hidden).
  const hiddenStyle = useAnimatedStyle(() => ({
    opacity: isHidden ? 0 : reveal.value,
  }));

  return (
    <Animated.View
      pointerEvents={isHidden ? 'none' : 'box-none'}
      style={[
        styles.tabBarHost,
        { paddingBottom: Math.max(insets.bottom, 4) + 2 },
        hiddenStyle,
      ]}
      accessibilityElementsHidden={isHidden}
      importantForAccessibility={isHidden ? 'no-hide-descendants' : 'auto'}>
      <View style={[styles.shadowWrap, dockElevation]}>
        <View
          style={styles.tabDock}
          onLayout={(e) => {
            dockWidthSV.value = e.nativeEvent.layout.width;
          }}>
          <BlurView
            blurType={resolvedScheme === 'dark' ? 'dark' : 'light'}
            blurAmount={18}
            overlayColor={resolvedScheme === 'dark' ? 'rgba(28,32,38,0.52)' : 'rgba(255,255,255,0.62)'}
            reducedTransparencyFallbackColor={resolvedScheme === 'dark' ? '#1C2026' : '#FFFFFF'}
            style={styles.tabDockBlurFill}>
            <View pointerEvents="none" style={[styles.tabInnerEdge, resolvedScheme === 'dark' ? styles.tabInnerEdgeDark : null]} />
            <View pointerEvents="none" style={styles.tabBottomHairline} />
            <GestureDetector gesture={dragGesture}>
            <View style={styles.tabDockContent} accessibilityRole="tablist">
          {/* Traveling border — one frame that glides between tabs */}
          <Animated.View
            pointerEvents="none"
            style={[styles.travelBorder, travelStyle]}>
            <Animated.View pointerEvents="none" style={travelSquishStyle}>
              {/* Hold glow — soft wide halo of the same gradient, only while
                  press-dragging. Drawn in a padded canvas so the wide stroke
                  isn't clipped at the SVG bounds. */}
              <Animated.View pointerEvents="none" style={[styles.travelGlow, travelGlowStyle]}>
                <Svg width={TAB_ICON_BOX_W + TAB_GLOW_PAD * 2} height={TAB_ICON_BOX_H + TAB_GLOW_PAD * 2}>
                  <Defs>
                    <SvgLinearGradient id="travelGlowGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={resolvedScheme === 'light' ? '#FF8A1A' : '#FF9A3D'} />
                      <Stop offset="1" stopColor={resolvedScheme === 'light' ? '#2563EB' : '#4D8DF7'} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect
                    x={TAB_GLOW_PAD - 1.5}
                    y={TAB_GLOW_PAD - 1.5}
                    width={TAB_ICON_BOX_W + 3}
                    height={TAB_ICON_BOX_H + 3}
                    rx={TAB_ICON_BOX_RADIUS + 1.5}
                    ry={TAB_ICON_BOX_RADIUS + 1.5}
                    fill="none"
                    stroke="url(#travelGlowGrad)"
                    strokeOpacity={resolvedScheme === 'light' ? 0.22 : 0.32}
                    strokeWidth={5}
                  />
                </Svg>
              </Animated.View>
              <Svg width={TAB_ICON_BOX_W} height={TAB_ICON_BOX_H}>
                <Defs>
                  <SvgLinearGradient id="travelBorderGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={resolvedScheme === 'light' ? '#FF8A1A' : '#FF9A3D'} />
                    <Stop offset="1" stopColor={resolvedScheme === 'light' ? '#2563EB' : '#4D8DF7'} />
                  </SvgLinearGradient>
                </Defs>
                <Rect
                  x={0.9}
                  y={0.9}
                  width={TAB_ICON_BOX_W - 1.8}
                  height={TAB_ICON_BOX_H - 1.8}
                  rx={TAB_ICON_BOX_RADIUS}
                  ry={TAB_ICON_BOX_RADIUS}
                  // Soft blue wash inside the frame; sits behind the glyphs
                  // (tab items render above the traveling border).
                  fill={resolvedScheme === 'light' ? '#2563EB' : '#4D8DF7'}
                  fillOpacity={resolvedScheme === 'light' ? 0.08 : 0.14}
                  stroke="url(#travelBorderGrad)"
                  strokeWidth={1.7}
                />
              </Svg>
            </Animated.View>
          </Animated.View>
          {state.routes.map((route, index) => {
            const routeName = route.name as TabName;
            const meta = TAB_META[routeName];
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];
            const label = meta.label;
            const accessibilityLabel =
              options.tabBarAccessibilityLabel ?? meta.accessibilityLabel;

            return (
              <TabBarItem
                key={route.key}
                meta={meta}
                index={index}
                indicatorX={indicatorX}
                dragLift={dragLift}
                tintIndex={tintIndexSV}
                dragTint={dragTintSV}
                reduceMotion={reduceMotionSV}
                isFocused={isFocused}
                accessibilityLabel={accessibilityLabel}
                label={label}
                palette={palette}
                resolvedScheme={resolvedScheme}
                onPress={() => {
                  selectTabRef.current(index);
                }}
                onLongPress={() => {
                  navigation.emit({
                    type: 'tabLongPress',
                    target: route.key,
                  });
                }}
              />
            );
          })}
            </View>
            </GestureDetector>
          </BlurView>
        </View>
      </View>
    </Animated.View>
  );
};

const MainNavigator: React.FC = () => {
  // One store per MainNavigator instance (same lifetime as the old ref/state),
  // created once so the context value never changes identity.
  const [suppressionStore] = React.useState(createTabDockSuppressionStore);

  return (
    <TabDockSuppressionContext.Provider value={suppressionStore}>
      <Tab.Navigator
        tabBar={(props) => <CustomKoolaTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
          },
        }}>
        <Tab.Screen
          name="ChatTab"
          component={ChatTabStack}
          // WHY: ChatTab holds the heaviest subtree (nested material-top-tabs +
          // FlatList + Reanimated sub-tab bar). With screenOptions.freezeOnBlur:true,
          // every revisit flushes that entire subtree in one frame → jank. Keeping
          // this tab live spreads socket-driven renders across idle frames instead
          // of batching them into the switch moment. Stack-level freeze on inner
          // screens (Chat, Profile, etc.) is untouched — only the Tab.Screen wrapper
          // opts out so the nested TopTab.Navigator stays mounted.
          options={{ freezeOnBlur: false }}
        />
        <Tab.Screen
          name="ShoppingTab"
          component={ShoppingTabStack}
          options={{
            freezeOnBlur: false,
            tabBarAccessibilityLabel: 'Mua sắm',
          }}
        />
        <Tab.Screen
          name="ConnectTab"
          component={ConnectTabStack}
          options={{
            tabBarAccessibilityLabel: 'Kết nối',
          }}
        />
        <Tab.Screen
          name="SupportTab"
          component={SupportTabStack}
          options={{
            tabBarAccessibilityLabel: 'Dịch vụ',
          }}
        />
        <Tab.Screen
          name="PersonalTab"
          component={PersonalTabStack}
          options={{
            tabBarAccessibilityLabel: 'Cá nhân',
          }}
        />
      </Tab.Navigator>
    </TabDockSuppressionContext.Provider>
  );
};

const styles = StyleSheet.create({
  tabBarHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    // Reduced shadow headroom for tighter dock spacing
    paddingTop: 4,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  // Glass shadow wrapper. Shadow lives on this View so it isn't clipped by
  // `tabDock`'s overflow:hidden. The opaque backgroundColor is load-bearing on
  // two counts: Android renders no shadow for a transparent view (no background
  // drawable means no outline), and it stops list rows from bleeding through the
  // translucent glass fill. Color + shadow come from the theme via inline style.
  shadowWrap: {
    borderRadius: 26,
  },
  tabDock: {
    minHeight: TAB_DOCK_HEIGHT,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  tabDockContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: TAB_DOCK_PAD_X,
    paddingVertical: 3,
  },
  // BlurView glass fill — when wrapping dock content it must be a normal
  // (non-absolute) flex child so it contributes to tabDock's height.
  tabDockBlurFill: {
    flex: 1,
    borderRadius: 26,
    overflow: 'hidden',
  },
  // 1px inner top edge.
  tabInnerEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  tabInnerEdgeDark: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  // Cool-tone bottom hairline.
  tabBottomHairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(37,99,235,0.12)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  iconHost: {
    width: TAB_ICON_BOX_W,
    height: TAB_ICON_BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_ICON_BOX_RADIUS,
  },
  iconBoxLight: {
    backgroundColor: 'rgba(37,99,235,0.08)',
  },
  iconBoxDark: {
    backgroundColor: 'rgba(77,141,247,0.14)',
  },
  travelGlow: {
    position: 'absolute',
    top: -TAB_GLOW_PAD,
    left: -TAB_GLOW_PAD,
  },
  travelBorder: {
    position: 'absolute',
    top: 3,
    left: 0,
    width: TAB_ICON_BOX_W,
    height: TAB_ICON_BOX_H,
  },
  glyphWrap: {
    width: TAB_ICON_BOX_W,
    height: TAB_ICON_BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphStack: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // One size for all five labels. Active/inactive is carried by weight + tone
  // only — differing fontSizes made the longest label ("Trò chuyện") the one that
  // tripped adjustsFontSizeToFit, so the active tab rendered *smaller* (8.8dp)
  // than the inactive ones (10dp) instead of larger.
  labelStack: {
    maxWidth: '100%',
    alignItems: 'center',
  },
  labelOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  tabLabel: {
    maxWidth: '100%',
    fontSize: 9.5,
    lineHeight: 12,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
});

export default MainNavigator;
