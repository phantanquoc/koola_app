import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import type { ConnectTabStackParamList } from './types';
import ConnectHomeScreen from '../screens/connect/ConnectHomeScreen';
import BusinessProfileScreen from '../screens/connect/BusinessProfileScreen';
import BusinessSearchScreen from '../screens/connect/BusinessSearchScreen';

const Stack = createNativeStackNavigator<ConnectTabStackParamList>();

const ConnectTabStack: React.FC = () => {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        statusBarTranslucent: true,
        navigationBarTranslucent: true,
        statusBarStyle: isDark ? 'light' : 'dark',
      }}>
      <Stack.Screen name="ConnectHome" component={ConnectHomeScreen} />
      <Stack.Screen
        name="BusinessProfile"
        component={BusinessProfileScreen}
        options={{ headerShown: true, title: 'Hồ sơ doanh nghiệp' }}
      />
      <Stack.Screen
        name="BusinessSearch"
        component={BusinessSearchScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

export default ConnectTabStack;
