import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { MainTabParamList } from './types';
import ChatTabStack from './ChatTabStack';
import ShoppingTabStack from './ShoppingTabStack';
import ConnectTabStack from './ConnectTabStack';
import SupportTabStack from './SupportTabStack';
import PersonalTabStack from './PersonalTabStack';
import { KoolaText, useTheme } from '../ui';
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

const FULLSCREEN_CHAT_ROUTES = new Set(['Chat', 'MomentViewer', 'MomentComposer']);
const FULLSCREEN_PERSONAL_ROUTES = new Set(['EditProfile', 'StorageSettings']);

export const TAB_BAR_FLOATING_INSET = 86;

const TAB_DOCK_HEIGHT = 66; // dock minHeight only — no extra paddings counted twice
// Extra clearance ABOVE the floating dock so scrollable lists can't push their
// last item into the area covered by the translucent glass dock. The dock fill
// is intentionally translucent (so the surface reads as glass), which means
// any row that sits beneath the dock — including its white background and
// hairline divider — bleeds through and reads as a faint horizontal band
// across the dock middle. A 16px buffer keeps the bottom row clearly above
// the dock so nothing is composited under the glass.
const TAB_DOCK_BOTTOM_BUFFER = 16;

/**
 * Returns the actual pixel clearance needed at the bottom of any
 * scrollable content so the last item stays above the floating dock,
 * accounting for the device's safe-area inset (iPhone notch, Android nav bar).
 */
export function useTabBarBottomInset(): number {
  const insets = useSafeAreaInsets();
  return TAB_DOCK_HEIGHT + Math.max(insets.bottom, 8) + TAB_DOCK_BOTTOM_BUFFER;
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
    return FULLSCREEN_CHAT_ROUTES.has(focused);
  }
  if (route.name === 'PersonalTab') {
    const focused = getFocusedRouteNameFromRoute(
      route as RouteProp<MainTabParamList, 'PersonalTab'>,
    ) ?? 'PersonalHome';
    return FULLSCREEN_PERSONAL_ROUTES.has(focused);
  }
  return false;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TabIcon3DProps {
  name: string;
  isFocused: boolean;
  pressProgress: SharedValue<number>;
  palette: Palette;
}

const TabIcon3D: React.FC<TabIcon3DProps> = ({ name, isFocused, pressProgress, palette }) => {
  const progress = useSharedValue(isFocused ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(isFocused ? 1 : 0, {
      duration: 150,
      easing: Easing.out(Easing.cubic),
    });
  }, [isFocused, progress]);

  const wrapperStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const press = pressProgress.value; // 0..1 quick punch
    return {
      transform: [
        { translateY: -3 * p },
        { scale: (1 + 0.08 * p) * (1 - 0.12 * press) },
      ],
      opacity: 0.78 + 0.22 * p,
    };
  });

  return (
    <View style={styles.iconWell}>
      <Animated.View style={wrapperStyle}>
        <MaterialIcons
          name={name}
          size={20}
          color={isFocused ? palette.primary : palette.muted}
        />
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
}

const TabBarItemComponent: React.FC<TabBarItemProps> = ({
  meta,
  isFocused,
  accessibilityLabel,
  label,
  onPress,
  onLongPress,
  palette,
}) => {
  const press = useSharedValue(0);

  const handlePressIn = React.useCallback(() => {
    // Quick punch-in
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
      android_ripple={{ color: palette.primarySoft, borderless: false }}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.tabItem,
        isFocused ? styles.tabItemActive : styles.tabItemInactive,
        itemAnimStyle,
      ]}>
      <TabIcon3D
        name={isFocused ? meta.focusedIcon : meta.icon}
        isFocused={isFocused}
        pressProgress={press}
        palette={palette}
      />
      <KoolaText
        variant="caption"
        weight={isFocused ? '800' : '700'}
        tone={isFocused ? 'primary' : 'faint'}
        numberOfLines={1}
        style={isFocused ? styles.activeLabel : styles.inactiveLabel}>
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
    previous.palette === next.palette
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
  gradientStops,
  resolvedScheme,
}) => (
  <>
    <View pointerEvents="none" style={styles.tabDockStaticFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="tabFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradientStops.top.color} stopOpacity={String(gradientStops.top.opacity)} />
            <Stop offset="0.55" stopColor={gradientStops.mid.color} stopOpacity={String(gradientStops.mid.opacity)} />
            <Stop offset="1" stopColor={gradientStops.bottom.color} stopOpacity={String(gradientStops.bottom.opacity)} />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tabFill)" />
      </Svg>
    </View>
    <View pointerEvents="none" style={styles.tabDockTint} />
    <View pointerEvents="none" style={styles.tabTopSheen}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="tabSheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={resolvedScheme === 'dark' ? '#2A323C' : '#FFFFFF'} stopOpacity="0.85" />
            <Stop offset="1" stopColor={resolvedScheme === 'dark' ? '#2A323C' : '#FFFFFF'} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tabSheen)" />
      </Svg>
    </View>
    <View pointerEvents="none" style={[styles.tabEdgeShineLeft, resolvedScheme === 'dark' && styles.tabEdgeShineDark]} />
    <View pointerEvents="none" style={[styles.tabEdgeShineRight, resolvedScheme === 'dark' && styles.tabEdgeShineDark]} />
    <View pointerEvents="none" style={[styles.tabInnerEdge, resolvedScheme === 'dark' && styles.tabInnerEdgeDark]} />
    <View pointerEvents="none" style={styles.tabBottomHairline} />
  </>
));

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

  // Theme-aware SVG gradient stops for the faux-glass dock fill.
  const gradientStops = React.useMemo(() => {
    if (resolvedScheme === 'dark') {
      return {
        top: { color: '#1C2026', opacity: 0.85 },
        mid: { color: '#1E2A44', opacity: 0.75 },
        bottom: { color: '#1A2332', opacity: 0.70 },
      };
    }
    return {
      top: { color: '#FFFFFF', opacity: 0.78 },
      mid: { color: '#EEF4FF', opacity: 0.70 },
      bottom: { color: '#DBEAFE', opacity: 0.62 },
    };
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

  if (isHidden) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.tabBarHost,
        { paddingBottom: Math.max(insets.bottom, 8) },
        revealStyle,
      ]}>
      <View style={styles.shadowWrap}>
        <View style={[styles.tabDock, { borderColor: palette.primary }]}>
          <TabDockBackground gradientStops={gradientStops} resolvedScheme={resolvedScheme} />
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
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (event.defaultPrevented) return;
                  if (!isFocused) {
                    // Navigating to Chat from another tab: reset to Messages
                    if (routeName === 'ChatTab') {
                      navigation.navigate('ChatTab', {
                        screen: 'ChatHome',
                        params: { resetToMessages: true },
                      } as never);
                    } else {
                      navigation.navigate(route.name as never);
                    }
                  } else if (routeName === 'ChatTab') {
                    // Reselect Chat while already focused: reset nested tab to Messages
                    navigation.navigate('ChatTab', {
                      screen: 'ChatHome',
                      params: { resetToMessages: true },
                    } as never);
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
        <Tab.Screen name="ChatTab" component={ChatTabStack} />
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
    paddingTop: 4,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  // Liquid-glass shadow wrapper. Drop shadow lives here so it isn't clipped
  // by `tabDock`'s overflow:hidden. Mirrors ChatComposer.shadowWrap.
  shadowWrap: {
    borderRadius: 26,
    backgroundColor: 'transparent',
  },
  tabDock: {
    minHeight: 66,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 2,
    // Glass rim — borderColor now applied via inline style from useTheme() palette.
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  dockBorderGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: 1.25,
    borderColor: 'rgba(37,99,235,0.25)',
  },
  // Liquid glass layer 1 — translucent SVG gradient fill (faux blur host).
  tabDockStaticFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    overflow: 'hidden',
  },
  // Liquid glass layer 1b — primary-blue cast.
  tabDockTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    backgroundColor: 'rgba(37,99,235,0.04)',
  },
  // Layer 2 — top specular sheen (~33% of dock height).
  tabTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  // Layer 3 — side-edge shines.
  tabEdgeShineLeft: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.40)',
  },
  tabEdgeShineRight: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    right: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.40)',
  },
  // Layer 4 — 1px inner top edge.
  tabInnerEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  // Dark-mode overrides for glass layers
  tabEdgeShineDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabInnerEdgeDark: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  // Layer 5 — cool-tone bottom hairline.
  tabBottomHairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  dockSheen: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  tabItem: {
    minHeight: 54,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  tabItemActive: {
    flex: 1.04,
  },
  tabItemInactive: {
    flex: 0.99,
    opacity: 0.92,
  },
  iconWell: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHalo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 999,
    // backgroundColor applied inline from palette.primary
  },
  iconRipple: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.25,
    // borderColor applied inline from palette.primary
    backgroundColor: 'transparent',
  },
  activeLabel: {
    maxWidth: '100%',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  inactiveLabel: {
    maxWidth: '100%',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
});

export default MainNavigator;
