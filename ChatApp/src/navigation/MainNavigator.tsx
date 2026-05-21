import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BlurView } from '@react-native-community/blur';
import type { MainTabParamList } from './types';
import ChatTabStack from './ChatTabStack';
import ShoppingTabStack from './ShoppingTabStack';
import ConnectTabStack from './ConnectTabStack';
import SupportTabStack from './SupportTabStack';
import PersonalTabStack from './PersonalTabStack';
import { KoolaText, koolaColors } from '../ui';

const Tab = createBottomTabNavigator<MainTabParamList>();

const FULLSCREEN_CHAT_ROUTES = new Set(['Chat']);

export const TAB_BAR_FLOATING_INSET = 100;

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
  if (route.name !== 'ChatTab') return false;
  const focused = getFocusedRouteNameFromRoute(
    route as RouteProp<MainTabParamList, 'ChatTab'>,
  ) ?? 'ChatHome';
  return FULLSCREEN_CHAT_ROUTES.has(focused);
}

const CustomKoolaTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index] as RouteProp<MainTabParamList, TabName>;

  if (shouldHideTabBar(activeRoute)) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.tabBarHost,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}>
      <View style={styles.tabDock}>
        <BlurView
          style={StyleSheet.absoluteFillObject}
          blurType={Platform.OS === 'ios' ? 'xlight' : 'light'}
          blurAmount={Platform.OS === 'ios' ? 22 : 18}
          reducedTransparencyFallbackColor="rgba(255,255,255,0.85)"
        />
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFillObject}
          width="100%"
          height="100%">
          <Defs>
            <LinearGradient id="koolaGlassFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.45" />
              <Stop offset="1" stopColor="#E6EEFB" stopOpacity="0.28" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" rx="28" ry="28" fill="url(#koolaGlassFill)" />
        </Svg>
        {state.routes.map((route, index) => {
          const routeName = route.name as TabName;
          const meta = TAB_META[routeName];
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const label = meta.label;
          const accessibilityLabel =
            options.tabBarAccessibilityLabel ?? meta.accessibilityLabel;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={isFocused ? { selected: true } : {}}
              android_ripple={{ color: koolaColors.primarySoft, borderless: false }}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[
                styles.tabItem,
                isFocused ? styles.tabItemActive : styles.tabItemInactive,
              ]}>
              <View
                style={[
                  styles.tabPill,
                  isFocused ? styles.tabPillActive : styles.tabPillInactive,
                ]}>
                <MaterialIcons
                  name={isFocused ? meta.focusedIcon : meta.icon}
                  size={isFocused ? 27 : 21}
                  color={isFocused ? koolaColors.primary : koolaColors.muted}
                />
              </View>
              <KoolaText
                variant="caption"
                weight={isFocused ? '800' : '700'}
                tone={isFocused ? 'primary' : 'faint'}
                numberOfLines={1}
                style={isFocused ? styles.activeLabel : styles.inactiveLabel}>
                {label}
              </KoolaText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const MainNavigator: React.FC = () => {
  return (
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
  );
};

const styles = StyleSheet.create({
  tabBarHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
  },
  tabDock: {
    minHeight: 76,
    borderRadius: 28,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 9,
    overflow: 'hidden',
    shadowColor: koolaColors.ink,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 12,
  },
  tabItem: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  tabItemActive: {
    flex: 1.15,
  },
  tabItemInactive: {
    flex: 0.95,
    opacity: 0.92,
  },
  tabPill: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabPillActive: {
    width: 54,
    height: 38,
    borderRadius: 16,
    backgroundColor: 'rgba(37,99,235,0.12)',
    shadowColor: koolaColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  tabPillInactive: {
    width: 34,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  activeLabel: {
    maxWidth: '100%',
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  inactiveLabel: {
    maxWidth: '100%',
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
});

export default MainNavigator;
