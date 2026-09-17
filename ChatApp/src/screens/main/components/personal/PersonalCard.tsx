import React from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import {
  KoolaSurface,
  koolaCardElevations,
  koolaGlowShadows,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../../../../ui';
import { getCardElevation, subscribeCardElevation } from '../../../dev/cardElevation';

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
  const elevationId = React.useSyncExternalStore(
    subscribeCardElevation,
    getCardElevation,
    getCardElevation,
  );
  const lightElev = koolaCardElevations[elevationId];

  return (
    <KoolaSurface
      {...props}
      style={[
        styles.card,
        resolvedScheme === 'light' ? lightElev : koolaGlowShadows[resolvedScheme].card,
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: koolaRadii.lg,
    padding: koolaSpacing.lg,
    marginHorizontal: koolaSpacing.sm,
    marginBottom: koolaSpacing.lg,
  },
});
