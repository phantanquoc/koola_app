import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme, koolaIconWell, koolaOpacity } from '../ui';
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
  const { notify, toast } = useComingSoonToast();
  const [messagePressed, setMessagePressed] = useState(false);
  const [notificationPressed, setNotificationPressed] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<ConnectHeaderConfig | null>(null);
  const [focusedRouteName, setFocusedRouteName] = useState<keyof ConnectTabStackParamList>('ConnectHome');
  // BusinessProfile renders its own inline header that slides with the card
  const isBusinessProfile = focusedRouteName === 'BusinessProfile';
  const headerCtx = React.useMemo(
    () => ({ config: headerConfig, setConfig: setHeaderConfig }),
    [headerConfig],
  );

  const wordmarkActions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable
        onPress={() => notify()}
        onPressIn={() => setMessagePressed(true)}
        onPressOut={() => setMessagePressed(false)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Tin nhắn"
        style={[
          { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
          messagePressed && { backgroundColor: koolaIconWell[resolvedScheme], opacity: koolaOpacity.pressed },
        ]}>
        <MaterialIcons name="chat-bubble-outline" size={20} color={tokens.semantic.text.muted} />
      </Pressable>
      <Pressable
        onPress={() => notify()}
        onPressIn={() => setNotificationPressed(true)}
        onPressOut={() => setNotificationPressed(false)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Thông báo"
        style={[
          { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
          notificationPressed && { backgroundColor: koolaIconWell[resolvedScheme], opacity: koolaOpacity.pressed },
        ]}>
        <MaterialIcons name="notifications-none" size={20} color={tokens.semantic.text.muted} />
      </Pressable>
    </View>
  );

  return (
    <ConnectHeaderContext.Provider value={headerCtx}>
      <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
        <LightFieldBackground />
        {!isBusinessProfile && (
          <NotchHeader
            key={focusedRouteName === 'ConnectHome' ? 'wordmark-home' : 'stack-header'}
            style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
            title={focusedRouteName === 'ConnectHome' ? undefined : headerConfig?.title}
            onBack={focusedRouteName === 'ConnectHome' ? undefined : headerConfig?.onBack}
            actions={focusedRouteName === 'ConnectHome' ? wordmarkActions : undefined}
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
