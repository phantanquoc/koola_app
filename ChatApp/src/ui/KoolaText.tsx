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

/**
 * Variant-aware maxFontSizeMultiplier defaults.
 * Content variants (body, display) scale generously (~1.5) for accessibility.
 * Chrome variants (caption, label) cap at ~1.3 to protect tight layouts.
 * Title/heading use ~1.35 as a balanced backstop.
 * NEVER 1.0 — that blocks font scaling entirely, breaking accessibility.
 * Per-instance override via the `maxFontSizeMultiplier` prop takes precedence.
 */
const VARIANT_MAX_FONT_SCALE: Record<KoolaTextVariant, number> = {
  display: 1.5,
  title: 1.35,
  heading: 1.35,
  body: 1.5,
  label: 1.3,
  caption: 1.3,
};

interface KoolaTextProps extends TextProps {
  variant?: KoolaTextVariant;
  tone?: KoolaTextTone;
  weight?: '400' | '500' | '600' | '700' | '800';
  align?: 'left' | 'center' | 'right';
  className?: string;
  /** Override variant default maxFontSizeMultiplier. Never set to 1.0. */
  maxFontSizeMultiplier?: number;
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
  maxFontSizeMultiplier: maxFontSizeMultiplierOverride,
  ...props
}) => {
  const { palette } = useTheme();
  const toneColor = useMemo(() => makeToneColor(palette), [palette]);

  // Per-instance override takes precedence; otherwise use variant default
  const resolvedMaxFontScale =
    maxFontSizeMultiplierOverride ?? VARIANT_MAX_FONT_SCALE[variant];

  return (
    <Text
      {...props}
      className={className}
      maxFontSizeMultiplier={resolvedMaxFontScale}
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
