import React, { useMemo } from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { koolaTypography, type Palette } from './theme';

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

const makeToneColor = (p: Palette): Record<KoolaTextTone, string> => ({
  ink: p.ink,
  muted: p.muted,
  faint: p.faint,
  primary: p.primary,
  success: p.success,
  danger: p.danger,
  surface: p.surface,
});

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
  const { palette } = useTheme();
  const toneColor = useMemo(() => makeToneColor(palette), [palette]);

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
