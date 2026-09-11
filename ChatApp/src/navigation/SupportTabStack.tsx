import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import type { SupportTabStackParamList } from './types';
import ServicesHomeScreen from '../screens/services/ServicesHomeScreen';

const Stack = createNativeStackNavigator<SupportTabStackParamList>();

const SupportTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <LightFieldBackground />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          statusBarTranslucent: true,
          navigationBarTranslucent: true,
          statusBarStyle: isDark ? 'light' : 'dark',
          contentStyle: { backgroundColor: 'transparent' } as never,
        }}>
        <Stack.Screen name="SupportHome" component={ServicesHomeScreen} />
      </Stack.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
});

export default SupportTabStack;
