import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import { useTheme } from '../ui';

// ─── Glass constants (single source for every tab's chrome sheet) ────────────
// Extracted verbatim from ChatHomeScreen so Chat and Connect cannot drift apart.
// Chrome is a single continuous sheet spanning the header block AND the sub-menu
// bar: tint + light-field bloom + resting hairline, with an elevation shadow
// that fades in as list content scrolls behind it. No blur — the "float" reads
// from the shadow, not from a backdrop filter.
const CHROME_TINT_LIGHT = 'rgba(255,255,255,0.84)';
const CHROME_TINT_DARK = 'rgba(15,20,25,0.72)';
const CHROME_BLOOM_OPACITY = 0.72;
/** Chiều cao dải bóng đổ dưới chrome khi "nổi" lên khỏi nội dung. */
export const CHROME_SHADOW_H = 14;

/** Sheet stack order — above list content, below the header box (zIndex 20). */
const CHROME_GLASS_Z = 10;

const ChromeShadow: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <Svg width="100%" height={CHROME_SHADOW_H}>
    <Defs>
      <SvgLinearGradient id="chromeGlassSheetShadow" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#000000" stopOpacity={isDark ? '0.36' : '0.12'} />
        <Stop offset="1" stopColor="#000000" stopOpacity="0" />
      </SvgLinearGradient>
    </Defs>
    <Rect width="100%" height={CHROME_SHADOW_H} fill="url(#chromeGlassSheetShadow)" />
  </Svg>
);

export type ChromeGlassSheetProps = {
  /** Height of the header block (wordmark + dock) the sheet starts at. */
  blockH: number;
  /** Height of the sub-menu / sub-tab bar the sheet extends through when shown. */
  barH: number;
  /** 0 = bar shown, 1 = bar hidden. Drives the animated sheet height. */
  hiddenProgress?: SharedValue<number>;
  /** 0 = list at rest, 1 = content scrolled behind. Drives hairline/shadow swap. */
  scrolledProgress?: SharedValue<number>;
};

/**
 * Shared chrome glass sheet — the single source of the tint, bloom, hairline,
 * elevation shadow, and animated height used by every tab's home chrome.
 *
 * Height = `blockH + barH * (1 - smoothstep(hiddenProgress))`, so collapsing the
 * sub-menu bar collapses the sheet with it and no empty glass strip is left
 * behind. Consumers MUST NOT re-declare the glass constants locally.
 */
export const ChromeGlassSheet: React.FC<ChromeGlassSheetProps> = ({
  blockH,
  barH,
  hiddenProgress,
  scrolledProgress,
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const glassHeightStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, hiddenProgress?.value ?? 0));
    const h = t * t * (3 - 2 * t);
    return { height: blockH + barH * (1 - h) };
  }, [blockH, barH, hiddenProgress]);

  // Bóng đổ = chrome "nổi" khỏi nội dung; chỉ hiện khi có data cuộn phía sau.
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: scrolledProgress?.value ?? 0,
  }), [scrolledProgress]);

  // Chỉ 1 cách phân tách tại 1 thời điểm: hairline lúc nghỉ, bóng đổ lúc cuộn.
  const hairlineStyle = useAnimatedStyle(() => ({
    opacity: 1 - (scrolledProgress?.value ?? 0),
  }), [scrolledProgress]);

  return (
    <Animated.View pointerEvents="none" style={[styles.glass, glassHeightStyle]}>
      <View style={styles.glassClip}>
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? CHROME_TINT_DARK : CHROME_TINT_LIGHT },
          ]}
        />
        <View style={[StyleSheet.absoluteFill, { opacity: CHROME_BLOOM_OPACITY }]}>
          <LightFieldBackground windowSized />
        </View>
        <Animated.View style={[styles.hairline, { backgroundColor: tokens.semantic.border.subtle }, hairlineStyle]} />
      </View>
      <Animated.View style={[styles.shadow, shadowStyle]}>
        <ChromeShadow isDark={isDark} />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  glass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: CHROME_GLASS_Z,
  },
  // Clip the glass fill so it cannot bleed past the animated height.
  glassClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
  },
});