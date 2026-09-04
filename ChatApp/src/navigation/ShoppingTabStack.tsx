import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import type { ShoppingTabStackParamList } from './types';
import ShoppingHomeScreen from '../screens/shopping/ShoppingHomeScreen';

const Stack = createNativeStackNavigator<ShoppingTabStackParamList>();

const ShoppingTabStack: React.FC = () => {
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
      <Stack.Screen name="ShoppingHome" component={ShoppingHomeScreen} />
    </Stack.Navigator>
  );
};

export default ShoppingTabStack;
