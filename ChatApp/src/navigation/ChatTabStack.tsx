import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import { NotchHeader } from '../components/NotchHeader';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import { ChatHeaderContext, type ChatHeaderConfig } from './ChatHeaderContext';
import type { ChatTabStackParamList } from './types';
import ChatHomeScreen from '../screens/main/ChatHomeScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import GroupInfoScreen from '../screens/main/GroupInfoScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import UniversalSearchScreen from '../screens/main/UniversalSearchScreen';
import MomentComposerScreen from '../screens/moments/MomentComposerScreen';
import MomentViewerScreen from '../screens/moments/MomentViewerScreen';
import HighlightsScreen from '../screens/moments/HighlightsScreen';
import AudienceListEditorScreen from '../screens/moments/AudienceListEditorScreen';

const Stack = createNativeStackNavigator<ChatTabStackParamList>();

const ChatTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [headerConfig, setHeaderConfig] = useState<ChatHeaderConfig | null>(null);
  // Which route in THIS stack is focused, tracked from the navigator's own
  // focus events. The Chat screen runs with `freezeOnBlur: true`, so its
  // `useFocusEffect` cleanup (which calls setConfig(null)) sits inside a
  // subtree that react-freeze suspends shortly after blur. The ordering does
  // work out today — react-native-screens' DelayedFreeze defers the freeze by
  // a setTimeout(0) while `blur` is emitted from a passive effect in the same
  // commit — but the band must not depend on winning that race. This gate is
  // driven from outside the frozen subtree, so leaving Chat always reverts the
  // band to the wordmark even if the release never arrives.
  const [focusedRouteName, setFocusedRouteName] =
    useState<keyof ChatTabStackParamList>('ChatHome');

  const contentStyle = useMemo(
    () => ({ backgroundColor: 'transparent' }),
    [],
  );

  const chatConfig = focusedRouteName === 'Chat' ? headerConfig : null;
  const headerCtx = useMemo(
    () => ({ config: headerConfig, setConfig: setHeaderConfig }),
    [headerConfig],
  );

  return (
    <ChatHeaderContext.Provider value={headerCtx}>
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <LightFieldBackground />
      <NotchHeader
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        chat={chatConfig ?? undefined}
      />
      <Stack.Navigator
        screenListeners={({ route }) => ({
          focus: () => setFocusedRouteName(route.name as keyof ChatTabStackParamList),
        })}
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle,
          statusBarTranslucent: true,
          navigationBarTranslucent: true,
          statusBarStyle: isDark ? 'light' : 'dark',
        }}>
        <Stack.Screen name="ChatHome" component={ChatHomeScreen} />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            animation: 'slide_from_right',
            animationDuration: 150,
            freezeOnBlur: true,
          }}
        />
        <Stack.Screen
          name="GroupInfo"
          component={GroupInfoScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="UniversalSearch"
          component={UniversalSearchScreen}
          options={{ headerShown: false }}
        />
        {__DEV__ && (
          <Stack.Screen
            name="OutboxDevPanel"
            component={require('../screens/dev/OutboxDevPanel').default}
            options={{ headerShown: true, title: '[DEV] Outbox Panel' }}
          />
        )}
        {__DEV__ && (
          <Stack.Screen
            name="LogoLab"
            component={require('../screens/dev/LogoLabScreen').default}
            options={{ headerShown: true, title: '[DEV] Logo Lab' }}
          />
        )}
        <Stack.Screen
          name="MomentComposer"
          component={MomentComposerScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="MomentViewer"
          component={MomentViewerScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="Highlights"
          component={HighlightsScreen}
          options={{ headerShown: true, title: 'Nổi bật' }}
        />
        <Stack.Screen
          name="AudienceListEditor"
          component={AudienceListEditorScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </View>
    </ChatHeaderContext.Provider>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
});

export default ChatTabStack;
