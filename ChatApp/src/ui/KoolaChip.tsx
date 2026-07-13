import React, { useMemo } from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaOpacity, koolaRadii, koolaSpacing } from './theme';
import type { SemanticTokens } from './tokens/semantic';

interface KoolaChipProps extends Omit<PressableProps, 'children'> {
  label: string;
  selected?: boolean;
}

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    chip: {
      minHeight: 44,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: koolaSpacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
    selected: {
      backgroundColor: semantic.action.primarySoft,
      borderColor: semantic.signal.selected,
    },
    pressed: {
      opacity: koolaOpacity.pressed,
    },
    focused: {
      borderWidth: 2,
      borderColor: semantic.focus.ring,
    },
    disabled: {
      opacity: koolaOpacity.disabled,
    },
  });

export const KoolaChip: React.FC<KoolaChipProps> = ({
  label,
  selected = false,
  style,
  disabled,
  accessibilityState,
  onPressIn,
  onPressOut,
  onFocus,
  onBlur,
  ...props
}) => {
  const [pressed, setPressed] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        selected,
        disabled: disabled || accessibilityState?.disabled,
      }}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.chip,
        selected ? styles.selected : null,
        focused ? styles.focused : null,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}>
      <KoolaText
        variant="caption"
        weight="700"
        tone={selected ? 'primary' : 'muted'}
        numberOfLines={1}>
        {label}
      </KoolaText>
    </Pressable>
  );
};
