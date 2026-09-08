import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import { NotchHeader } from '../components/NotchHeader';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import type { ShoppingTabStackParamList } from './types';
import ShoppingHomeScreen from '../screens/shopping/ShoppingHomeScreen';

const Stack = createNativeStackNavigator<ShoppingTabStackParamList>();

const ShoppingTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <LightFieldBackground />
      <NotchHeader style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          statusBarTranslucent: true,
          navigationBarTranslucent: true,
          statusBarStyle: isDark ? 'light' : 'dark',
          contentStyle: { backgroundColor: 'transparent' } as never,
          // @ts-expect-error cardStyle is valid for native-stack but types lag
          cardStyle: { backgroundColor: 'transparent' },
        }}>
        <Stack.Screen name="ShoppingHome" component={ShoppingHomeScreen} />
      </Stack.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
});

export default ShoppingTabStack;
