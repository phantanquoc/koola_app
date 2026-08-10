import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { useTheme } from '../ui';

const Stack = createNativeStackNavigator<ChatTabStackParamList>();

const ChatTabStack: React.FC = () => {
  const { palette } = useTheme();
  const contentStyle = useMemo(
    () => ({ backgroundColor: palette.canvas }),
    [palette.canvas],
  );

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'none',
        contentStyle,
      }}>
      <Stack.Screen name="ChatHome" component={ChatHomeScreen} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        // slide_from_right kept, but animationDuration trimmed to 150ms (native
        // default ~350ms) for a snappier push/pop. freezeOnBlur stays: once Chat
        // loses focus (back-press pop), react-freeze suspends the whole subtree
        // AFTER the slide animation (DelayedFreeze setTimeout(0)), so no late async
        // setState (messages/pin/avatar) can re-render the native view and flash a
        // stale snapshot over the list.
        // Root-cause fix for the pop-back flicker — see [[chat_popback_flicker]].
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
      {/* __DEV__ only — not accessible in production builds */}
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
      {__DEV__ && (
        <Stack.Screen
          name="MomentsFeedLab"
          component={require('../screens/dev/MomentsFeedLabScreen').default}
          // headerShown:false + in-app back/title row (the StorageSettingsScreen
          // pattern). The NATIVE header re-adds the display-cutout inset on top
          // of an RN root that already starts below it, leaving a blank band —
          // measured 132px cutout counted twice on this device.
          options={{ headerShown: false }}
        />
      )}

      {/* ── Moments screens ────────────────────────────────────────── */}
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
  );
};

export default ChatTabStack;
