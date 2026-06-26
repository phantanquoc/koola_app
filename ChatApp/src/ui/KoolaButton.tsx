import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, type Palette } from './theme';

interface KoolaButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: string;
  className?: string;
}

const textTone = {
  primary: 'surface',
  secondary: 'ink',
  ghost: 'primary',
  danger: 'surface',
} as const;

const makeVariantBg = (p: Palette) => ({
  primary: p.primary,
  secondary: p.canvas,
  ghost: 'transparent',
  danger: p.danger,
});

const makeIconColor = (p: Palette) => ({
  primary: p.surface,
  secondary: p.ink,
  ghost: p.primary,
  danger: p.surface,
});

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    base: {
      borderRadius: koolaRadii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sm: { minHeight: 36, paddingHorizontal: 12 },
    md: { minHeight: 46, paddingHorizontal: 16 },
    lg: { minHeight: 52, paddingHorizontal: 18 },
    secondary: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
    },
    pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.55 },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      maxWidth: '100%',
    },
  });

export const KoolaButton: React.FC<KoolaButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  style,
  accessibilityRole = 'button',
  accessibilityState,
  onPressIn,
  onPressOut,
  ...props
}) => {
  const [pressed, setPressed] = React.useState(false);
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const variantBg = useMemo(() => makeVariantBg(palette), [palette]);
  const iconColor = useMemo(() => makeIconColor(palette), [palette]);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled || accessibilityState?.disabled,
        busy: loading || accessibilityState?.busy,
      }}
      disabled={isDisabled}
      onPressIn={(event) => {
        if (!isDisabled) setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      className={className}
      style={[
        styles.base,
        styles[size],
        { backgroundColor: variantBg[variant] },
        variant === 'secondary' ? styles.secondary : null,
        isDisabled ? styles.disabled : null,
        pressed && !isDisabled ? styles.pressed : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}>
      {loading ? (
        <ActivityIndicator color={iconColor[variant]} />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <MaterialIcons name={icon} size={20} color={iconColor[variant]} />
          ) : null}
          <KoolaText
            variant="label"
            tone={textTone[variant]}
            weight="700"
            numberOfLines={1}>
            {title}
          </KoolaText>
        </View>
      )}
    </Pressable>
  );
};
