import React from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import {
  KoolaSurface,
  koolaGlowShadows,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../../../../ui';

/**
 * Floating content card for the Personal home (design D2).
 *
 * Geometry is fixed by the card language — `koolaRadii.lg` corners, `lg`
 * padding, 16px side margins and 16px bottom margin — and the fill comes from
 * `KoolaSurface` (`semantic.surface.level1`). Elevation is the per-scheme glow
 * recipe from `koolaGlowShadows`: a colored soft shadow in light, a lighter
 * surface tint + hairline + colored rim in dark, where a black shadow would be
 * invisible.
 */
export const PersonalCard: React.FC<ViewProps> = ({ style, ...props }) => {
  const { resolvedScheme } = useTheme();

  return (
    <KoolaSurface
      {...props}
      style={[styles.card, koolaGlowShadows[resolvedScheme].card, style]}
    />
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: koolaRadii.lg,
    padding: koolaSpacing.lg,
    marginHorizontal: koolaSpacing.lg,
    marginBottom: koolaSpacing.lg,
  },
});
