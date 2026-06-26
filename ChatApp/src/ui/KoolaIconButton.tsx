import React, { useMemo } from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from './ThemeProvider';
import { type Palette } from './theme';

interface KoolaIconButtonProps extends PressableProps {
  icon: string;
  size?: number;
  iconSize?: number;
  tone?: 'primary' | 'muted' | 'danger' | 'surface';
  variant?: 'ghost' | 'soft' | 'solid';
  className?: string;
}

const makeToneColor = (p: Palette) => ({
  primary: p.primary,
  muted: p.muted,
  danger: p.danger,
  surface: p.surface,
});

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    soft: {
      backgroundColor: p.canvas,
    },
    solid: {
      backgroundColor: p.primary,
    },
    pressed: {
      opacity: 0.78,
      transform: [{ scale: 0.98 }],
    },
    disabled: {
      opacity: 0.5,
    },
  });

export const KoolaIconButton: React.FC<KoolaIconButtonProps> = ({
  icon,
  size = 40,
  iconSize = 22,
  tone = 'primary',
  variant = 'ghost',
  className,
  disabled,
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
  const toneColor = useMemo(() => makeToneColor(palette), [palette]);

  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        ...accessibilityState,
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
      className={className}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        variant === 'soft' ? styles.soft : null,
        variant === 'solid' ? styles.solid : null,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}>
      <MaterialIcons
        name={icon}
        size={iconSize}
        color={variant === 'solid' ? palette.surface : toneColor[tone]}
      />
    </Pressable>
  );
};
