import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { koolaColors, koolaTypography } from './theme';

type KoolaTextVariant = keyof typeof koolaTypography;
type KoolaTextTone =
  | 'ink'
  | 'muted'
  | 'faint'
  | 'primary'
  | 'success'
  | 'danger'
  | 'surface';

interface KoolaTextProps extends TextProps {
  variant?: KoolaTextVariant;
  tone?: KoolaTextTone;
  weight?: '400' | '500' | '600' | '700' | '800';
  align?: 'left' | 'center' | 'right';
  className?: string;
}

const toneColor: Record<KoolaTextTone, string> = {
  ink: koolaColors.ink,
  muted: koolaColors.muted,
  faint: koolaColors.faint,
  primary: koolaColors.primary,
  success: koolaColors.success,
  danger: koolaColors.danger,
  surface: koolaColors.surface,
};

export const KoolaText: React.FC<KoolaTextProps> = ({
  variant = 'body',
  tone = 'ink',
  weight,
  align = 'left',
  className,
  style,
  children,
  ...props
}) => {
  return (
    <Text
      {...props}
      className={className}
      style={[
        styles.base,
        koolaTypography[variant],
        { color: toneColor[tone], textAlign: align },
        weight ? { fontWeight: weight } : null,
        style,
      ]}>
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: {
    letterSpacing: 0,
  },
});
