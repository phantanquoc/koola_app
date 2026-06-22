import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { BlurView } from '@react-native-community/blur';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
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
import { KoolaText, koolaColors } from '../ui';

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

// ─── DIAGNOSTIC (logout removeViewAt crash) ─────────────────────────────────
// The tab dock runs a live BlurView + perpetual reanimated loops (borderPulse,
// sheen, per-icon breath) on the UI thread. On logout the whole MainNavigator
// unmounts in one Fabric commit WHILE those keep mutating views → "Cannot
// remove child at index N … childCount may be incorrect" crash. Same class as
// the chat-composer flash. Set true to neutralize them (static dock, no blur,
// no perpetual loops). If logout stops crashing with this true, the dock is the
// cause and we keep it as the permanent fix. Press animations stay (not
// perpetual — they don't run at unmount time).
const DIAG_STATIC_TABDOCK = true;

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

const AnimatedMaterialIcons = Animated.createAnimatedComponent(MaterialIcons);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TabIcon3DProps {
  name: string;
  isFocused: boolean;
  pressProgress: SharedValue<number>;
}

const TabIcon3D: React.FC<TabIcon3DProps> = ({ name, isFocused, pressProgress }) => {
  const progress = useDerivedValue(
    () => (isFocused
      ? withSpring(1, { damping: 12, stiffness: 180, mass: 0.7 })
      : withTiming(0, { duration: 180 })),
    [isFocused],
  );

  // Slow breathing pulse on focused tab (sustained effect after tap)
  const breath = useSharedValue(0);
  React.useEffect(() => {
    if (DIAG_STATIC_TABDOCK) return;
    if (isFocused) {
      breath.value = withRepeat(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      breath.value = withTiming(0, { duration: 220 });
    }
  }, [isFocused, breath]);

  const wrapperStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const press = pressProgress.value; // 0..1 quick punch
    const breathe = breath.value;
    // Quick punch: shrink slightly on press, then bounce back via spring on release
    const pressScale = 1 - 0.18 * press;
    const breatheScale = 1 + 0.04 * breathe * p;
    return {
      transform: [
        { perspective: 600 },
        { translateY: -4 * p - 1 * breathe * p },
        { rotateX: `${-16 * p}deg` },
        { scale: (1 + 0.14 * p) * pressScale * breatheScale },
      ],
    };
  });

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + 0.3 * progress.value,
  }));

  // Expanding ripple ring on press (quick effect)
  const rippleStyle = useAnimatedStyle(() => {
    const press = pressProgress.value;
    return {
      opacity: press * 0.5,
      transform: [{ scale: 0.5 + 0.55 * press }],
    };
  });

  // Soft halo glow on focused state (sustained)
  const haloStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const breathe = breath.value;
    return {
      opacity: p * (0.22 + 0.22 * breathe),
      transform: [
        { translateY: -4 * p },
        { scale: 0.95 + 0.2 * p + 0.06 * breathe },
      ],
    };
  });

  return (
    <View style={styles.iconWell}>
      <Animated.View pointerEvents="none" style={[styles.iconHalo, haloStyle]} />
      <Animated.View pointerEvents="none" style={[styles.iconRipple, rippleStyle]} />
      <Animated.View style={wrapperStyle}>
        <AnimatedMaterialIcons
          name={name}
          size={20}
          color={isFocused ? koolaColors.primary : koolaColors.muted}
          style={iconStyle}
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
}

const TabBarItem: React.FC<TabBarItemProps> = ({
  meta,
  isFocused,
  accessibilityLabel,
  label,
  onPress,
  onLongPress,
}) => {
  const press = useSharedValue(0);

  const handlePressIn = React.useCallback(() => {
    // Quick punch-in
    press.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [press]);

  const handlePressOut = React.useCallback(() => {
    // Springy rebound back to rest
    press.value = withSequence(
      withTiming(0.45, { duration: 80, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 9, stiffness: 220, mass: 0.6 }),
    );
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
      android_ripple={{ color: koolaColors.primarySoft, borderless: false }}
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

const CustomKoolaTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { isTabDockSuppressed } = React.useContext(TabDockSuppressionContext);
  const activeRoute = state.routes[state.index] as RouteProp<MainTabParamList, TabName>;
  const isHidden = isTabDockSuppressed || shouldHideTabBar(activeRoute);

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

  // Border breathing pulse (slow ambient)
  const borderPulse = useSharedValue(0);
  // Sheen sweep across dock edge
  const sheen = useSharedValue(0);

  React.useEffect(() => {
    if (DIAG_STATIC_TABDOCK) return;
    borderPulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    sheen.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [borderPulse, sheen]);

  const animatedBorderStyle = useAnimatedStyle(() => {
    const v = borderPulse.value;
    return {
      borderColor: `rgba(37, 99, 235, ${0.18 + 0.32 * v})`, // primary tint pulse
      shadowOpacity: 0.06 + 0.1 * v,
    };
  });

  const sheenStyle = useAnimatedStyle(() => {
    const v = sheen.value;
    return {
      opacity: v < 0.05 || v > 0.95 ? 0 : 0.55 * Math.sin(v * Math.PI),
      transform: [{ translateX: -120 + v * 520 }, { rotate: '18deg' }],
    };
  });

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
        <View style={styles.tabDock}>
          {DIAG_STATIC_TABDOCK ? (
            <>
              {/* Layer 1 — SVG gradient fill (faux blur). */}
              <View pointerEvents="none" style={styles.tabDockStaticFill}>
                <Svg width="100%" height="100%" preserveAspectRatio="none">
                  <Defs>
                    <SvgLinearGradient id="tabFill" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.78" />
                      <Stop offset="0.55" stopColor="#EEF4FF" stopOpacity="0.70" />
                      <Stop offset="1" stopColor="#DBEAFE" stopOpacity="0.62" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#tabFill)" />
                </Svg>
              </View>
              {/* Layer 1b — primary-blue glass cast. */}
              <View pointerEvents="none" style={styles.tabDockTint} />
              {/* Layer 2 — top specular sheen. */}
              <View pointerEvents="none" style={styles.tabTopSheen}>
                <Svg width="100%" height="100%" preserveAspectRatio="none">
                  <Defs>
                    <SvgLinearGradient id="tabSheen" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
                      <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#tabSheen)" />
                </Svg>
              </View>
              {/* Layer 3 — side-edge shines. */}
              <View pointerEvents="none" style={styles.tabEdgeShineLeft} />
              <View pointerEvents="none" style={styles.tabEdgeShineRight} />
              {/* Layer 4 — 1px inner top edge. */}
              <View pointerEvents="none" style={styles.tabInnerEdge} />
              {/* Layer 5 — cool-tone bottom hairline. */}
              <View pointerEvents="none" style={styles.tabBottomHairline} />
            </>
          ) : (
            <>
              <BlurView
                style={StyleSheet.absoluteFillObject}
                blurType={Platform.OS === 'ios' ? 'xlight' : 'light'}
                blurAmount={Platform.OS === 'ios' ? 16 : 8}
                blurRadius={Platform.OS === 'android' ? 8 : undefined}
                downsampleFactor={Platform.OS === 'android' ? 10 : undefined}
                overlayColor={Platform.OS === 'android' ? 'rgba(255,255,255,0.08)' : undefined}
                reducedTransparencyFallbackColor="rgba(255,255,255,0.28)"
              />
              <Animated.View
                pointerEvents="none"
                style={[styles.dockBorderGlow, animatedBorderStyle]}
              />
              <Animated.View pointerEvents="none" style={[styles.dockSheen, sheenStyle]} />
            </>
          )}
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
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name as never);
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
    // DEBUG — solid mid-gray so the dock outline is unambiguous.
    borderColor: '#6B7280',
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
  // Liquid glass layer 1 — DEBUG: very low alpha so artifacts under the dock
  // are clearly visible.
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
    backgroundColor: koolaColors.primary,
  },
  iconRipple: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.25,
    borderColor: koolaColors.primary,
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
