import React, { useMemo, useRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';
import type { Palette } from './theme';

interface AuthFormShellProps {
  children: React.ReactNode;
  /** Extra bottom padding to ensure primary action is reachable. Default 24. */
  bottomClearance?: number;
}

/**
 * Scrollable keyboard-safe form shell for authentication screens.
 *
 * Provides:
 * - ScrollView that keeps focused field visible when keyboard opens (both iOS + Android)
 * - Safe-area handling (top/bottom insets)
 * - KeyboardAvoidingView with behavior='padding' on iOS
 * - Enough bottom clearance for the primary action to be reachable
 *
 * On Android, KeyboardAvoidingView behavior={undefined} is effectively a no-op.
 * The ScrollView provides the scroll-to-focused-field behavior on Android via
 * `android:windowSoftInputMode="adjustResize"` + the ScrollView naturally
 * keeping focused inputs visible. The generous bottom padding ensures the
 * primary action is always reachable.
 *
 * Usage: replace the outer KeyboardAvoidingView + View in auth screens.
 */
export const AuthFormShell: React.FC<AuthFormShellProps> = ({
  children,
  bottomClearance = 24,
}) => {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const scrollRef = useRef<ScrollView>(null);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 16) + bottomClearance,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <View>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
  });
