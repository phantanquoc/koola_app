import React, { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from './ThemeProvider';
import { KoolaText } from './KoolaText';
import type { Palette } from './theme';

interface KoolaOtpInputProps {
  /** Current OTP value (digits only, 0–6 chars). */
  value: string;
  /** Called with the updated string whenever the user types or pastes. */
  onChange: (value: string) => void;
  /** Number of digit boxes (default 6). */
  length?: number;
  /** Whether to auto-focus the first box on mount. */
  autoFocus?: boolean;
  /** Optional error text shown below the boxes. */
  error?: string;
}

/**
 * Modern per-digit OTP input with auto-advance, backspace handling, and paste
 * support. Theme-aware (light/dark via useTheme().palette).
 *
 * Contract: `value` and `onChange` use the same plain digit string the existing
 * verify calls expect — no behavioral change to calling screens.
 */
export const KoolaOtpInput: React.FC<KoolaOtpInputProps> = ({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  error,
}) => {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);

  // Hidden TextInput strategy: a single invisible TextInput captures all
  // keyboard events (including paste), while the visible boxes are pure display.
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);

  const handlePress = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleChangeText = useCallback(
    (text: string) => {
      // Strip non-digits, limit to length
      const cleaned = text.replace(/[^0-9]/g, '').slice(0, length);
      onChange(cleaned);
    },
    [onChange, length],
  );

  return (
    <View>
      <Pressable
        style={styles.boxRow}
        onPress={handlePress}
        accessibilityRole="none">
        {Array.from({ length }, (_, i) => {
          const digit = value[i] || '';
          const isCursor = focused && i === value.length;
          const isFilled = digit !== '';
          return (
            <View
              key={i}
              style={[
                styles.box,
                isFilled && styles.boxFilled,
                isCursor && styles.boxActive,
              ]}>
              <KoolaText
                variant="title"
                weight="800"
                align="center"
                style={styles.digit}>
                {digit}
              </KoolaText>
              {isCursor && <View style={styles.cursor} />}
            </View>
          );
        })}
      </Pressable>

      {/* Hidden TextInput that captures keyboard + paste */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        style={styles.hiddenInput}
        caretHidden
        autoComplete="one-time-code"
      />

      {error ? (
        <KoolaText
          variant="caption"
          style={[styles.errorText, { color: palette.danger }]}>
          {error}
        </KoolaText>
      ) : null}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    boxRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
    },
    box: {
      width: 48,
      height: 56,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: p.line,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxFilled: {
      borderColor: p.primary,
      backgroundColor: p.primarySoft,
    },
    boxActive: {
      borderColor: p.primary,
    },
    digit: {
      fontSize: 24,
      color: p.ink,
    },
    cursor: {
      position: 'absolute',
      bottom: 12,
      width: 20,
      height: 2,
      backgroundColor: p.primary,
      borderRadius: 1,
    },
    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      height: 1,
      width: 1,
    },
    errorText: {
      marginTop: 8,
      textAlign: 'center',
    },
  });
