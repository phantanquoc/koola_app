import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { BlurView } from '@sbaiahmed1/react-native-blur';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
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
  KoolaText,
  koolaDarkShadows,
  koolaRadii,
  koolaShadows,
  useTheme,
} from '../ui';
import type { Palette } from '../ui/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabDockSuppressionContextValue = {
  isTabDockSuppressed: boolean;
  suppressTabDock: () => () => void;
};

const TabDockSuppressionContext = React.createContext<TabDockSuppressionContextValue>({
  isTabDockSuppressed: false,
  suppressTabDock: () => () => {},
});

export function useTabDockSuppression(): () => () => void {
  return React.useContext(TabDockSuppressionContext).suppressTabDock;
}

const FULLSCREEN_CHAT_ROUTES: Record<string, true> = { Chat: true, MomentViewer: true, MomentComposer: true };
const FULLSCREEN_PERSONAL_ROUTES: Record<string, true> = { EditProfile: true, StorageSettings: true, SettingsDetail: true, UpgradeAccount: true };
export const TAB_BAR_FLOATING_INSET = 86;

const TAB_DOCK_HEIGHT = 52; // slim capsule — nothing crammed at 52
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
  return false;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Icon host — square box with rounded corners + orange→blue gradient border.
 * Replaces the old pill. Size drives both the resting glyph box and the box,
 * so they never drift apart. Radius 11 gives a "squircle" square, not a circle.
 */
const TAB_ICON_BOX_SIZE = 32;
const TAB_ICON_BOX_RADIUS = 11;

/** Tiny upward nudge on focus — reads as "selected", not "moving". */
const TAB_ICON_FOCUS_LIFT = -1;

interface TabIcon3DProps {
  name: string;
  isFocused: boolean;
  focusProgress: SharedValue<number>;
  pressProgress: SharedValue<number>;
  palette: Palette;
  resolvedScheme: 'light' | 'dark';
}

const TabIcon3D: React.FC<TabIcon3DProps> = ({
  name,
  isFocused,
  focusProgress,
  pressProgress,
  palette,
  resolvedScheme,
}) => {
  const wrapperStyle = useAnimatedStyle(() => {
    const press = pressProgress.value;
    return {
      transform: [{ scale: 1 - 0.08 * press }],
    };
  });
  const boxStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }));
  const borderStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }));

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
    const cp = map[name] ?? 0xe3c9;
    return String.fromCharCode(cp);
  }, [name]);

  const mutedStyle = useAnimatedStyle(() => ({
    opacity: 1 - focusProgress.value,
  }));
  const glyphGradStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }));

  return (
    <View style={styles.iconHost}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.iconBox,
          resolvedScheme === 'light' ? styles.iconBoxLight : styles.iconBoxDark,
          boxStyle,
        ]}
      />
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
  isFocused,
  accessibilityLabel,
  label,
  onPress,
  onLongPress,
  palette,
  resolvedScheme,
}) => {
  const press = useSharedValue(0);
  const focus = useSharedValue(isFocused ? 1 : 0);

  React.useEffect(() => {
    focus.value = withTiming(isFocused ? 1 : 0, {
      duration: 150,
      easing: Easing.out(Easing.cubic),
    });
  }, [isFocused, focus]);

  const handlePressIn = React.useCallback(() => {
    press.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [press]);

  const handlePressOut = React.useCallback(() => {
    press.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.cubic) });
  }, [press]);

  const itemAnimStyle = useAnimatedStyle(() => {
    const p = press.value;
    return {
      transform: [{ scale: 1 - 0.05 * p }],
    };
  });

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.tabItem, itemAnimStyle]}>
      <TabIcon3D
        name={isFocused ? meta.focusedIcon : meta.icon}
        isFocused={isFocused}
        focusProgress={focus}
        pressProgress={press}
        palette={palette}
        resolvedScheme={resolvedScheme}
      />
      <KoolaText
        variant="caption"
        weight={isFocused ? '700' : '600'}
        tone={isFocused ? 'primary' : 'muted'}
        numberOfLines={1}
        // The dock is fixed-size chrome, so labels must not scale with the OS font
        // setting (a 1.25 scale overflows the 5 slots) and must not auto-shrink —
        // adjustsFontSizeToFit made the longest label ("Trò chuyện") render smaller
        // than the rest, and it was the active one, inverting the visual hierarchy.
        allowFontScaling={false}
        style={styles.tabLabel}>
        {label}
      </KoolaText>
    </AnimatedPressable>
  );
};

// Only the focused item and the item losing focus need to update after a tab
// switch. Ignore callback identity because each callback is route-local and
// its captured focus state changes whenever that route's focus changes.
const TabBarItem = React.memo(
  TabBarItemComponent,
  (previous, next) => (
    previous.meta === next.meta &&
    previous.isFocused === next.isFocused &&
    previous.accessibilityLabel === next.accessibilityLabel &&
    previous.label === next.label &&
    previous.palette === next.palette &&
    previous.resolvedScheme === next.resolvedScheme
  ),
);

type TabDockGradientStop = { color: string; opacity: number };
type TabDockGradientStops = {
  top: TabDockGradientStop;
  mid: TabDockGradientStop;
  bottom: TabDockGradientStop;
};

interface TabDockBackgroundProps {
  gradientStops: TabDockGradientStops;
  resolvedScheme: string;
}

const TabDockBackground: React.FC<TabDockBackgroundProps> = React.memo(({
  resolvedScheme,
}) => {
  const isDark = resolvedScheme === 'dark';
  return (
    <>
      <BlurView
        blurType={isDark ? 'dark' : 'light'}
        blurAmount={18}
        overlayColor={isDark ? 'rgba(28,32,38,0.52)' : 'rgba(255,255,255,0.62)'}
        reducedTransparencyFallbackColor={isDark ? '#1C2026' : '#FFFFFF'}
        style={styles.tabDockBlurFill}
      />
      <View pointerEvents="none" style={[styles.tabInnerEdge, isDark && styles.tabInnerEdgeDark]} />
      <View pointerEvents="none" style={styles.tabBottomHairline} />
    </>
  );
});

const TAB_COUNT = 5;

const CustomKoolaTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { palette, resolvedScheme } = useTheme();
  const { isTabDockSuppressed } = React.useContext(TabDockSuppressionContext);
  const activeRoute = state.routes[state.index] as RouteProp<MainTabParamList, TabName>;
  const isHidden = isTabDockSuppressed || shouldHideTabBar(activeRoute);
  const [dockWidth, setDockWidth] = React.useState(0);
  const indicatorX = useSharedValue(state.index);
  // Spring the indicator whenever the focused index changes
  React.useEffect(() => {
    indicatorX.value = withSpring(state.index, { damping: 20, stiffness: 420, mass: 0.45 });
  }, [state.index, indicatorX]);

  // Previously a vertical gradient fill; now BlurView handles the glass fill.
  // Keep for prop compat until next cleanup.
  const gradientStops = React.useMemo(() => {
    if (resolvedScheme === 'dark') {
      return {
        top: { color: '#1C2026', opacity: 0.92 },
        mid: { color: '#1E2A44', opacity: 0.85 },
        bottom: { color: '#1A2332', opacity: 0.80 },
      };
    }
    return {
      top: { color: '#FFFFFF', opacity: 0.92 },
      mid: { color: '#F4F8FF', opacity: 0.88 },
      bottom: { color: '#EAF2FF', opacity: 0.82 },
    };
  }, [resolvedScheme]);
  void gradientStops;

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

  // Small one-shot reveal so the dock doesn't pop in after a fullscreen route
  // finishes closing. It is not a perpetual loop, so it remains unmount-safe.
  const reveal = useSharedValue(isHidden ? 0 : 1);
  React.useEffect(() => {
    reveal.value = isHidden
      ? 0
      : withTiming(1, { duration: 110, easing: Easing.out(Easing.cubic) });
  }, [isHidden, reveal]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: 8 * (1 - reveal.value) }],
  }));

  const travelStyle = useAnimatedStyle(() => {
    const count = state.routes.length || TAB_COUNT;
    const PAD = 10;
    const itemWidth = count > 0 ? (dockWidth - PAD * 2) / count : 0;
    return {
      transform: [{ translateX: PAD + indicatorX.value * itemWidth + (itemWidth - TAB_ICON_BOX_SIZE) / 2 }],
    };
  });

  if (isHidden) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.tabBarHost,
        { paddingBottom: Math.max(insets.bottom, 4) + 6 },
        revealStyle,
      ]}>
      <View style={[styles.shadowWrap, dockElevation]}>
        <View style={styles.tabDock} onLayout={(e) => setDockWidth(e.nativeEvent.layout.width)}>
          <TabDockBackground gradientStops={gradientStops} resolvedScheme={resolvedScheme} />
          {/* Traveling border — one frame that glides between tabs */}
          {dockWidth > 0 ? (
            <Animated.View pointerEvents="none" style={[styles.travelBorder, travelStyle]}>
              <Svg width={TAB_ICON_BOX_SIZE} height={TAB_ICON_BOX_SIZE}>
                <Defs>
                  <SvgLinearGradient id="travelBorderGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={resolvedScheme === 'light' ? '#FF8A1A' : '#FF9A3D'} />
                    <Stop offset="1" stopColor={resolvedScheme === 'light' ? '#2563EB' : '#4D8DF7'} />
                  </SvgLinearGradient>
                </Defs>
                <Rect
                  x={0.9}
                  y={0.9}
                  width={TAB_ICON_BOX_SIZE - 1.8}
                  height={TAB_ICON_BOX_SIZE - 1.8}
                  rx={TAB_ICON_BOX_RADIUS}
                  ry={TAB_ICON_BOX_RADIUS}
                  fill="none"
                  stroke="url(#travelBorderGrad)"
                  strokeWidth={1.7}
                />
              </Svg>
            </Animated.View>
          ) : null}
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
                isFocused={isFocused}
                accessibilityLabel={accessibilityLabel}
                label={label}
                palette={palette}
                resolvedScheme={resolvedScheme}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (event.defaultPrevented) return;
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
      </View>
    </Animated.View>
  );
};

const MainNavigator: React.FC = () => {
  const suppressionIdsRef = React.useRef(new Set<symbol>());
  const [isTabDockSuppressed, setIsTabDockSuppressed] = React.useState(false);

  const suppressTabDock = React.useCallback(() => {
    const id = Symbol('tab-dock-suppression');
    suppressionIdsRef.current.add(id);
    setIsTabDockSuppressed(true);

    return () => {
      suppressionIdsRef.current.delete(id);
      setIsTabDockSuppressed(suppressionIdsRef.current.size > 0);
    };
  }, []);

  const suppressionContext = React.useMemo(
    () => ({ isTabDockSuppressed, suppressTabDock }),
    [isTabDockSuppressed, suppressTabDock],
  );

  return (
    <TabDockSuppressionContext.Provider value={suppressionContext}>
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
    paddingHorizontal: 32,
    // Headroom for the dock's drop shadow, which spreads ~12px above the dock
    // (xl radius 24 minus its +12 downward offset). The host is anchored to
    // bottom:0, so this only grows the top edge — the dock does not move, and
    // `useTabBarBottomInset()` stays correct.
    paddingTop: 10,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  // BlurView glass fill (replaces the old Svg gradient).
  tabDockBlurFill: {
    ...StyleSheet.absoluteFillObject,
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
    width: TAB_ICON_BOX_SIZE,
    height: TAB_ICON_BOX_SIZE,
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
  travelBorder: {
    position: 'absolute',
    top: 6,
    left: 0,
    width: TAB_ICON_BOX_SIZE,
    height: TAB_ICON_BOX_SIZE,
  },
  glyphWrap: {
    width: TAB_ICON_BOX_SIZE,
    height: TAB_ICON_BOX_SIZE,
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
  tabLabel: {
    maxWidth: '100%',
    fontSize: 9.5,
    lineHeight: 12,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
});

export default MainNavigator;
