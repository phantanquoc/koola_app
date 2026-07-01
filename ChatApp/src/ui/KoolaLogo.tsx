import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';

/**
 * KOOLA brand mark — a geometric distillation of the original three-color
 * swirl into a balanced tri-arc ring (red / blue / green). Flat, no gradients,
 * round-capped strokes. Stays crisp and recognizable from 24px up, so it works
 * standalone as an app icon / favicon as well as inside the header lockup.
 *
 * Geometry: 48×48 viewBox, ring r=17 about (24,24), three equal 90° arcs with
 * even 30° gaps; round caps visually widen each arc to ~110° and tighten the
 * gaps to ~10°. Source SVG mirrored at assets/brand/koola-mark.svg.
 */

interface KoolaMarkProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const KoolaMark: React.FC<KoolaMarkProps> = ({ size = 28, style }) => {
  const { palette } = useTheme();
  // strokeWidth scales with the mark so the ring weight stays proportional.
  const stroke = (size / 48) * 6;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      {/* top-right arc */}
      <Path
        d="M24 7 A17 17 0 0 1 41 24"
        stroke={palette.brandRed}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      {/* bottom arc */}
      <Path
        d="M38.72 32.5 A17 17 0 0 1 15.5 38.72"
        stroke={palette.brandBlue}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      {/* left arc */}
      <Path
        d="M9.28 32.5 A17 17 0 0 1 15.5 9.28"
        stroke={palette.brandGreen}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
};

interface KoolaLogoProps {
  /** Pixel size of the mark glyph. */
  markSize?: number;
  /** Render the geometric tri-arc mark beside the wordmark. */
  showMark?: boolean;
  /** Render the KOOLA wordmark beside the mark. */
  showWordmark?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const KoolaLogo: React.FC<KoolaLogoProps> = ({
  markSize = 26,
  showMark = true,
  showWordmark = true,
  style,
}) => {
  const { palette } = useTheme();
  return (
    <View style={[styles.row, style]}>
      {showMark ? <KoolaMark size={markSize} /> : null}
      {showWordmark ? (
        <KoolaText variant="heading" weight="800" style={showMark ? styles.wordmark : styles.wordmarkSolo}>
          <KoolaText variant="heading" weight="800" style={{ color: palette.brandRed }}>K</KoolaText>
          <KoolaText variant="heading" weight="800" style={{ color: palette.brandBlue }}>OOL</KoolaText>
          <KoolaText variant="heading" weight="800" style={{ color: palette.brandGreen }}>A</KoolaText>
        </KoolaText>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    // marginLeft (not gap) — Hermes/RN 0.76 drops row children with gap+flex.
    marginLeft: 7,
    letterSpacing: 1,
  },
  wordmarkSolo: {
    letterSpacing: 2,
    textAlign: 'center',
  },
});
