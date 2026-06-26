import React, { useMemo } from 'react';
import {
  NavigationContainer,
  createNavigationContainerRef,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../ui';
import MainNavigator from './MainNavigator';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import OtpVerifyScreen from '../screens/auth/OtpVerifyScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import CallScreen from '../screens/call/CallScreen';
import IncomingCallScreen from '../screens/call/IncomingCallScreen';
import ImageViewerScreen from '../screens/chat/ImageViewerScreen';
import CoverPhotoViewerScreen from '../screens/main/CoverPhotoViewerScreen';
import SplashScreen from '../components/SplashScreen';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Deep link config — koola://moments/story/<id> → opens MomentViewer
const linking = {
  prefixes: ['koola://'],
  config: {
    screens: {
      Main: {
        screens: {
          ChatTab: {
            screens: {
              MomentViewer: 'moments/story/:startStoryId',
            },
          },
        },
      },
    },
  },
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { palette, resolvedScheme } = useTheme();

  // Derive a React Navigation theme from the active palette
  const isDark = resolvedScheme === 'dark';
  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: palette.primary,
        background: palette.canvas,
        card: palette.surface,
        text: palette.ink,
        border: palette.line,
        notification: palette.danger,
      },
    }),
    [isDark, palette],
  );

  if (isLoading) {
    return <SplashScreen />;
  }

  // Single navigator, conditional screen groups (React Navigation's documented
  // auth pattern). On logout `isAuthenticated` flips and React Navigation diffs
  // the screen set — it removes Main and shows Login via react-native-screens'
  // native container, instead of unmounting the whole navigator subtree in one
  // Fabric commit. The latter raced the animated tab dock's view teardown and
  // crashed with "Cannot remove child at index N … childCount may be incorrect".
  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainNavigator} />
            <Stack.Screen
              name="CallModal"
              component={CallScreen}
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="IncomingCallModal"
              component={IncomingCallScreen}
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="ImageViewer"
              component={ImageViewerScreen}
              options={{
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="CoverPhotoViewer"
              component={CoverPhotoViewerScreen}
              options={{ headerShown: false }}
            />
            {/* Logout transition — navigated to by AuthContext.logout() via
                navigationRef.reset() so the NavigationContainer stays mounted
                while RNS natively pops any open modals and replaces the Main
                screen before the auth group swap. No gesture / animation so
                the switch is imperceptible to the user. */}
            <Stack.Screen
              name="LogoutTransition"
              component={SplashScreen}
              options={{ animation: 'none', gestureEnabled: false }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="OtpVerify"
              component={OtpVerifyScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="ResetPassword"
              component={ResetPasswordScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
