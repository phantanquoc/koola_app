import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ChatsStack } from './ChatsStack';
import { ContactsStack } from './ContactsStack';
import { SettingsStack } from './SettingsStack';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainNavigator: React.FC = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#007AFF',
      tabBarInactiveTintColor: '#999',
    }}>
    <Tab.Screen
      name="ChatsTab"
      component={ChatsStack}
      options={{
        tabBarLabel: 'Chats',
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="chat-bubble-outline" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="ContactsTab"
      component={ContactsStack}
      options={{
        tabBarLabel: 'Contacts',
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="contacts" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="SettingsTab"
      component={SettingsStack}
      options={{
        tabBarLabel: 'Settings',
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="settings" size={size} color={color} />
        ),
      }}
    />
  </Tab.Navigator>
);
