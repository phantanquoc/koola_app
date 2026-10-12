import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import { NotchHeader } from '../components/NotchHeader';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import { useComingSoonToast } from '../hooks/useComingSoonToast';
import { ConnectHeaderContext, type ConnectHeaderConfig } from './ConnectHeaderContext';
import type { ConnectTabStackParamList } from './types';
import ConnectHomeScreen from '../screens/connect/ConnectHomeScreen';
import BusinessProfileScreen from '../screens/connect/BusinessProfileScreen';
import BusinessSearchScreen from '../screens/connect/BusinessSearchScreen';

const Stack = createNativeStackNavigator<ConnectTabStackParamList>();

const ConnectTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { toast } = useComingSoonToast();
  const [headerConfig, setHeaderConfig] = useState<ConnectHeaderConfig | null>(null);
  const [focusedRouteName, setFocusedRouteName] = useState<keyof ConnectTabStackParamList>('ConnectHome');
  // ConnectHome owns its chrome via ChromeHeaderBox + ChromeGlassSheet (single
  // source with Chat) — showing the stack NotchHeader there puts two
  // absolute top:0 sheets on top of each other. NotchHeader's flatH
  // (insets.top+26) covers the first 4px of the dock pill at insets.top+22.
  // BusinessProfile renders its own inline header that slides with the card.
  const showStackHeader =
    focusedRouteName !== 'ConnectHome' && focusedRouteName !== 'BusinessProfile';
  const headerCtx = React.useMemo(
    () => ({ config: headerConfig, setConfig: setHeaderConfig }),
    [headerConfig],
  );

  return (
    <ConnectHeaderContext.Provider value={headerCtx}>
      <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
        <LightFieldBackground />
        {showStackHeader && (
          <NotchHeader
            style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
            title={headerConfig?.title}
            onBack={headerConfig?.onBack}
          />
        )}
        <Stack.Navigator
          screenListeners={({ route }) => ({
            focus: () => setFocusedRouteName(route.name as keyof ConnectTabStackParamList),
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
          <Stack.Screen name="ConnectHome" component={ConnectHomeScreen} />
          <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
          <Stack.Screen name="BusinessSearch" component={BusinessSearchScreen} />
        </Stack.Navigator>
        {toast}
      </View>
    </ConnectHeaderContext.Provider>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
});

export default ConnectTabStack;
