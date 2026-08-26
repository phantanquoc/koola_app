import React, { forwardRef, useMemo, useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaTypography, type Palette } from './theme';

export interface KoolaTextInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: string;
  /** Explicit accessible label for screen readers (falls back to `label` then `placeholder`). */
  accessibilityLabel?: string;
  /** Extra style applied to the outer input shell (the View wrapping the TextInput). */
  shellStyle?: StyleProp<ViewStyle>;
  /** Override style for the label text (fontSize, fontWeight, color, etc.). */
  labelStyle?: StyleProp<TextStyle>;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrapper: {
      gap: 6,
    },
    label: {
      marginLeft: 2,
    },
    inputShell: {
      minHeight: 50,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      backgroundColor: p.surface,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    inputError: {
      borderColor: p.danger,
    },
    input: {
      flex: 1,
      color: p.ink,
      fontSize: koolaTypography.body.fontSize,
      minHeight: 48,
      paddingVertical: 0,
    },
    revealButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -10,
    },
    error: {
      marginLeft: 2,
    },
  });

export const KoolaTextInput = forwardRef<TextInput, KoolaTextInputProps>(
  (
    {
      label,
      error,
      icon,
      style,
      placeholderTextColor,
      secureTextEntry,
      accessibilityLabel: a11yLabel,
      shellStyle,
      labelStyle,
      ...props
    },
    ref,
  ) => {
    const { palette } = useTheme();
    const styles = useMemo(() => makeStyles(palette), [palette]);
    const resolvedPlaceholderColor = placeholderTextColor ?? palette.faint;
    const [revealed, setRevealed] = useState(false);

    // Resolve accessible label: explicit > label > placeholder
    const resolvedA11yLabel = a11yLabel || label || props.placeholder;

    // Determine effective secureTextEntry
    const effectiveSecure = secureTextEntry && !revealed;

    return (
      <View style={styles.wrapper}>
        {label ? (
          <KoolaText variant="caption" tone="muted" weight="700" style={[styles.label, labelStyle]}>
            {label}
          </KoolaText>
        ) : null}
        <View
          style={[styles.inputShell, shellStyle, error ? styles.inputError : null]}>
          {icon ? (
            <MaterialIcons name={icon} size={20} color={palette.faint} />
          ) : null}
          <TextInput
            ref={ref}
            {...props}
            secureTextEntry={effectiveSecure}
            underlineColorAndroid="transparent"
            placeholderTextColor={resolvedPlaceholderColor}
            style={[styles.input, style]}
            accessibilityLabel={resolvedA11yLabel}
            accessibilityHint={error || undefined}
            aria-invalid={!!error}
          />
          {secureTextEntry ? (
            <Pressable
              onPress={() => setRevealed((v) => !v)}
              style={styles.revealButton}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'An mat khau' : 'Hien mat khau'}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <MaterialIcons
                name={revealed ? 'visibility-off' : 'visibility'}
                size={22}
                color={palette.muted}
              />
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <KoolaText variant="caption" tone="danger" style={styles.error}>
            {error}
          </KoolaText>
        ) : null}
      </View>
    );
  },
);
