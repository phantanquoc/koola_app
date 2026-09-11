import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import type { ConnectTabStackParamList } from './types';
import ConnectHomeScreen from '../screens/connect/ConnectHomeScreen';
import BusinessProfileScreen from '../screens/connect/BusinessProfileScreen';
import BusinessSearchScreen from '../screens/connect/BusinessSearchScreen';

const Stack = createNativeStackNavigator<ConnectTabStackParamList>();

const ConnectTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      {/* Same static light field the Chat/Shopping/Personal stacks paint, so this
          tab's canvas does not read flatter than the others (design D1).
          KoolaHeader owns the safe-area top here, so no NotchHeader. */}
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
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
});

export default ConnectTabStack;
