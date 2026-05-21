import React from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { koolaColors } from './theme';

interface KoolaIconButtonProps extends PressableProps {
  icon: string;
  size?: number;
  iconSize?: number;
  tone?: 'primary' | 'muted' | 'danger' | 'surface';
  variant?: 'ghost' | 'soft' | 'solid';
  className?: string;
}

const toneColor = {
  primary: koolaColors.primary,
  muted: koolaColors.muted,
  danger: koolaColors.danger,
  surface: koolaColors.surface,
} as const;

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
  onPressIn,
  onPressOut,
  ...props
}) => {
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole}
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
        color={variant === 'solid' ? koolaColors.surface : toneColor[tone]}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  soft: {
    backgroundColor: koolaColors.canvas,
  },
  solid: {
    backgroundColor: koolaColors.primary,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
