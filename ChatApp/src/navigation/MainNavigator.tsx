import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { MainTabParamList } from './types';
import ChatTabStack from './ChatTabStack';
import ShoppingTabStack from './ShoppingTabStack';
import ConnectTabStack from './ConnectTabStack';
import SupportTabStack from './SupportTabStack';
import PersonalTabStack from './PersonalTabStack';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Routes inside ChatTabStack that should render fullscreen (hide the parent
 * bottom tab bar). React Navigation exposes the focused nested route name via
 * `getFocusedRouteNameFromRoute`; we toggle `tabBarStyle.display` based on it.
 */
const FULLSCREEN_CHAT_ROUTES = new Set(['Chat']);

const chatTabScreenOptions = ({
  route,
}: {
  route: RouteProp<MainTabParamList, 'ChatTab'>;
}) => {
  const focused = getFocusedRouteNameFromRoute(route) ?? 'ChatHome';
  const hide = FULLSCREEN_CHAT_ROUTES.has(focused);
  return {
    tabBarLabel: 'Trò chuyện',
    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
      <MaterialIcons name="chat-bubble-outline" size={size} color={color} />
    ),
    tabBarStyle: hide
      ? { display: 'none' as const }
      : { height: 60, paddingBottom: 8, paddingTop: 4 },
  };
};

const MainNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { height: 60, paddingBottom: 8, paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 11 },
      }}>
      <Tab.Screen
        name="ChatTab"
        component={ChatTabStack}
        options={chatTabScreenOptions}
      />
      <Tab.Screen
        name="ShoppingTab"
        component={ShoppingTabStack}
        options={{
          tabBarLabel: 'Shopping',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="shopping-bag" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ConnectTab"
        component={ConnectTabStack}
        options={{
          tabBarLabel: 'Kết nối',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="hub" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SupportTab"
        component={SupportTabStack}
        options={{
          tabBarLabel: 'Hỗ trợ',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="support-agent" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PersonalTab"
        component={PersonalTabStack}
        options={{
          tabBarLabel: 'Cá nhân',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export default MainNavigator;
