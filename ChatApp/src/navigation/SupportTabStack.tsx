import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import { NotchHeader } from '../components/NotchHeader';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import { useComingSoonToast } from '../hooks/useComingSoonToast';
import type { SupportTabStackParamList } from './types';
import ServicesHomeScreen from '../screens/services/ServicesHomeScreen';

const Stack = createNativeStackNavigator<SupportTabStackParamList>();

const SupportTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { toast } = useComingSoonToast();
  const [focusedRouteName, setFocusedRouteName] = useState<keyof SupportTabStackParamList>('SupportHome');
  const showStackHeader = focusedRouteName !== 'SupportHome';

  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <LightFieldBackground />
      {showStackHeader && (
        <NotchHeader
          style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
      )}
      <Stack.Navigator
        screenListeners={({ route }) => ({
          focus: () => setFocusedRouteName(route.name as keyof SupportTabStackParamList),
        })}
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
        <Stack.Screen name="SupportHome" component={ServicesHomeScreen} />
      </Stack.Navigator>
      {toast}
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
});

export default SupportTabStack;
