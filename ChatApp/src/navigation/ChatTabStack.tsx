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
import PostComposerScreen from '../screens/moments/PostComposerScreen';
import PostMediaViewerScreen from '../screens/moments/PostMediaViewerScreen';
import MomentViewerScreen from '../screens/moments/MomentViewerScreen';
import HighlightsScreen from '../screens/moments/HighlightsScreen';
import AudienceListEditorScreen from '../screens/moments/AudienceListEditorScreen';

const Stack = createNativeStackNavigator<ChatTabStackParamList>();

const ChatTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [headerConfig, setHeaderConfig] = useState<ChatHeaderConfig | null>(null);
  // Which route in THIS stack is focused, tracked from the navigator's own
  // focus events. The Chat route opts out of freezing (`freezeOnBlur: false`
  // below), so its `useFocusEffect` cleanup (which calls setConfig(null)) does
  // run on blur today. The band must not depend on that cleanup arriving at
  // all, though — an interrupted pop, a re-render race or a future freeze
  // change would strand the chat header over another route. This gate is
  // driven from outside the screen subtree, so leaving Chat always reverts the
  // band to the wordmark even if the release never arrives.
  const [focusedRouteName, setFocusedRouteName] =
    useState<keyof ChatTabStackParamList>('ChatHome');

  const contentStyle = useMemo(
    () => ({ backgroundColor: 'transparent' }),
    [],
  );

  const headerCtx = useMemo(
    () => ({ config: headerConfig, setConfig: setHeaderConfig }),
    [headerConfig],
  );

  // ChatHome owns its own glass header block (wordmark + search dock), so we
  // hide the stack-level wordmark there to avoid a double layer/seam. Chat
  // renders its own header inside its screen view (it slides with the
  // push/pop animation), so the fixed band stays hidden while Chat is focused.
  // UniversalSearch has its own search header (back + input) — hide the stack
  // band there too to avoid the KOOLA wordmark painting behind the search bar.
  const showStackHeader =
    focusedRouteName !== 'ChatHome' &&
    focusedRouteName !== 'Chat' &&
    focusedRouteName !== 'Profile' &&
    focusedRouteName !== 'UniversalSearch';
  return (
    <ChatHeaderContext.Provider value={headerCtx}>
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <LightFieldBackground />
      {showStackHeader && (
        <NotchHeader
          style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
      )}
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
            // `transparentModal` is the only lever that makes `ScreenStack`
            // keep the screen below attached: `Screen.isTranslucent()` is true
            // for TRANSPARENT_MODAL/FORM_SHEET, so the Chat Home fragment is no
            // longer removed from the window while a conversation is open. The
            // back transition therefore reveals the LIVE conversation list
            // instead of a captured bitmap of it (the deleted PixelCopy
            // controller existed precisely because `push` detached it).
            // On this library version the route still lives in the main window
            // — `ScreenStack.adapt()` returns a ScreenStackFragment for every
            // presentation, and the dialog-hosted ScreenModalFragment is never
            // instantiated — so safe-area insets and keyboard resize keep
            // working. The card shrink targets the `nativeID="chat-screen-card"`
            // view inside this screen, which the presentation does not change.
            // `ios_from_right` maps to rns_ios_from_right_* tweens on
            // config_shortAnimTime (~200ms, accelerate_decelerate) — faster
            // than `slide_from_right`'s config_mediumAnimTime (~400ms).
            presentation: 'transparentModal',
            animation: 'ios_from_right',
            gestureEnabled: true,
            freezeOnBlur: false,
            contentStyle: { backgroundColor: 'transparent' } as never,
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
          name="PostComposer"
          component={PostComposerScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="PostMediaViewer"
          component={PostMediaViewerScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
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
