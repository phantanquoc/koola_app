import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { koolaLightField, useTheme } from '../../../../ui';

/**
 * Static light-field canvas behind the Personal home cards (design D1).
 *
 * One `Svg` paints the active scheme's base color plus its radial blooms; the
 * gradient geometry comes from the `koolaLightField` primitive, so neither the
 * hex values nor the bloom positions live in screen code. Nothing here animates
 * and the layer never receives touches (`pointerEvents="none"`), which keeps it
 * at one draw pass, safe for reduced-motion users, and free of per-frame work.
 *
 * Memoized: the only reason to re-render is a scheme change, which arrives
 * through `useTheme()`.
 */
const LightFieldBackgroundComponent: React.FC = () => {
  const { resolvedScheme } = useTheme();
  const field = koolaLightField[resolvedScheme];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          {field.blooms.map((bloom, index) => (
            <RadialGradient
              key={`def-${index}`}
              id={`koolaLightFieldBloom${index}`}
              cx={bloom.cx}
              cy={bloom.cy}
              r={bloom.r}>
              <Stop
                offset="0"
                stopColor={bloom.color}
                stopOpacity={String(bloom.opacity)}
              />
              <Stop offset="1" stopColor={bloom.color} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>
        <Rect width="100%" height="100%" fill={field.base} />
        {field.blooms.map((_bloom, index) => (
          <Rect
            key={`bloom-${index}`}
            width="100%" height="100%"
            fill={`url(#koolaLightFieldBloom${index})`}
          />
        ))}
      </Svg>
    </View>
  );
};

export const LightFieldBackground = React.memo(LightFieldBackgroundComponent);
