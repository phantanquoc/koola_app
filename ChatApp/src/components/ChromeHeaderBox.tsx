import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { HeaderSearchDock } from './HeaderSearchDock';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import { useTheme } from '../ui';

// ─── Geometry constants (single source) ──────────────────────────────────────
export const CHROME_BOX_WORDMARK_TOP = 1;
export const CHROME_BOX_WORDMARK_W = 87;
export const CHROME_BOX_WORDMARK_H = 15;
export const CHROME_BOX_DOCK_GAP = 6;
export const CHROME_BOX_DOCK_H = 36;

/** Box height = TOP 1 + WORDMARK 15 + GAP 6 + DOCK 36 = 58 + topInset */
export function getChromeBoxHeight(topInset: number): number {
  return topInset + CHROME_BOX_WORDMARK_TOP + CHROME_BOX_WORDMARK_H + CHROME_BOX_DOCK_GAP + CHROME_BOX_DOCK_H;
}

const CHROME_FALLBACK_LIGHT = '#FFFFFF';
const CHROME_FALLBACK_DARK = '#1C2026';
const CHROME_TINT_LIGHT = 'rgba(255,255,255,0.68)';
const CHROME_TINT_DARK = 'rgba(15,20,25,0.58)';
const CHROME_BLOOM_OPACITY = 0.38;
const CHROME_SHADOW_H = 14;

const ChromeShadow: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <Svg width="100%" height={CHROME_SHADOW_H}>
    <Defs>
      <SvgLinearGradient id="sharedFrostedBoxShadow" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#000000" stopOpacity={isDark ? '0.36' : '0.12'} />
        <Stop offset="1" stopColor="#000000" stopOpacity="0" />
      </SvgLinearGradient>
    </Defs>
    <Rect width="100%" height={CHROME_SHADOW_H} fill="url(#sharedFrostedBoxShadow)" />
  </Svg>
);

const ChromeEdgeScrim: React.FC<{ isDark: boolean; height: number; solidUntil: number }> = ({
  isDark,
  height,
  solidUntil,
}) => {
  const color = isDark ? CHROME_FALLBACK_DARK : CHROME_FALLBACK_LIGHT;
  const solidStop = Math.min(1, Math.max(0, solidUntil / height));
  // Translucent glass — data behind shows faintly blurred through.
  // Feather from solidUntil (insetsTop) down to bottom edge.
  // Light: 0.50 -> 0.25 -> 0.12 | Dark: 0.42 -> 0.22 -> 0.10
  const topOpacity = isDark ? 0.42 : 0.5;
  const midOpacity = isDark ? 0.22 : 0.25;
  const bottomOpacity = isDark ? 0.1 : 0.12;
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height={height}>
      <Defs>
        <SvgLinearGradient id="sharedFrostedBoxScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={String(topOpacity)} />
          <Stop offset={String(solidStop)} stopColor={color} stopOpacity={String(midOpacity)} />
          <Stop offset="1" stopColor={color} stopOpacity={String(bottomOpacity)} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="100%" height={height} fill="url(#sharedFrostedBoxScrim)" />
    </Svg>
  );
};

export type ChromeHeaderBoxProps = {
  insetsTop: number;
  isDark: boolean;
  contentReady?: boolean;
  /** When false, box is transparent — relies on shared glass below (e.g. Chat's CustomTabBar sheet). Default true. */
  withGlass?: boolean;
  onSearchPress: () => void;
  rightActions?: React.ReactNode;
  /** Icons beside the wordmark (e.g. Connect's message/notification). Rendered absolute at the wordmark row so they don't push it. */
  headerActions?: React.ReactNode;
  hiddenProgress?: SharedValue<number>;
  scrolledProgress?: SharedValue<number>;
  /** When provided, renders this instead of HeaderSearchDock (e.g. Shopping inline search input). */
  dockContent?: React.ReactNode;
};

export const ChromeHeaderBox: React.FC<ChromeHeaderBoxProps> = ({
  insetsTop,
  isDark,
  contentReady = true,
  withGlass = true,
  onSearchPress,
  rightActions,
  headerActions,
  hiddenProgress,
  scrolledProgress,
  dockContent,
}) => {
  const blockH = getChromeBoxHeight(insetsTop);
  const { tokens } = useTheme();
  const hairlineStyle = useAnimatedStyle(() => ({
    opacity: scrolledProgress ? 1 - scrolledProgress.value : 1,
  }));
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: scrolledProgress ? scrolledProgress.value : 0,
  }));
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: blockH,
        zIndex: 20,
        overflow: 'hidden',
      }}>
      {withGlass ? (
        !contentReady ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? CHROME_FALLBACK_DARK : CHROME_FALLBACK_LIGHT },
            ]}
          />
        ) : (
          <>
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? CHROME_TINT_DARK : CHROME_TINT_LIGHT }]}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: CHROME_BLOOM_OPACITY }]}>
              <LightFieldBackground windowSized />
            </View>
            <ChromeEdgeScrim isDark={isDark} height={blockH} solidUntil={insetsTop} />
          </>
        )
      ) : null}
      {withGlass ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: StyleSheet.hairlineWidth,
              backgroundColor: tokens.semantic.border.subtle,
            },
            hairlineStyle,
          ]}
        />
      ) : null}
      {withGlass ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: 0, right: 0, top: blockH },
            shadowStyle,
          ]}>
          <ChromeShadow isDark={isDark} />
        </Animated.View>
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: insetsTop + CHROME_BOX_WORDMARK_TOP,
          height: CHROME_BOX_WORDMARK_H,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Image
          source={require('../assets/logo_koola_wordmark.png')}
          style={{ width: CHROME_BOX_WORDMARK_W, height: CHROME_BOX_WORDMARK_H }}
          resizeMode="contain"
          accessibilityLabel="KOOLA"
        />
      </View>
      {headerActions ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            right: 16,
            // 16 = 12 (dock container pad) + 4 (Host pad) so the rightmost ghost
            // edge aligns with the dock's QR/filter edge. gap 6 matches the dock
            // inner row gap. Height 36 centered on the 15px wordmark strip.
            top: insetsTop + CHROME_BOX_WORDMARK_TOP + (CHROME_BOX_WORDMARK_H - 36) / 2,
            height: 36,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
          {headerActions}
        </View>
      ) : null}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: insetsTop + CHROME_BOX_WORDMARK_TOP + CHROME_BOX_WORDMARK_H + CHROME_BOX_DOCK_GAP,
          height: CHROME_BOX_DOCK_H,
          paddingHorizontal: 12,
          justifyContent: 'center',
        }}>
        {dockContent ?? (
          <HeaderSearchDock
            hiddenProgress={hiddenProgress}
            onSearchPress={onSearchPress}
            rightActions={rightActions}
          />
        )}
      </View>
    </View>
  );
};
