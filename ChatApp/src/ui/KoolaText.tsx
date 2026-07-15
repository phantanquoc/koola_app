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
 * Content variants (display, title, heading, body) scale to 2.0 for WCAG 2.1 AA
 * 200% text scaling — text wraps freely, no layout risk.
 * Chrome variants (label, caption) cap at 1.6 to protect single-line hard layouts
 * (KoolaBadge/KoolaChip ép numberOfLines={1}; cap 2.0 gây cắt cụt nội dung).
 * NEVER 1.0 — that blocks font scaling entirely, breaking accessibility.
 * Per-instance override via the `maxFontSizeMultiplier` prop takes precedence.
 */
const VARIANT_MAX_FONT_SCALE: Record<KoolaTextVariant, number> = {
  display: 2.0,
  title: 2.0,
  heading: 2.0,
  body: 2.0,
  label: 1.6,
  caption: 1.6,
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
