import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, Filter, FeDropShadow } from 'react-native-svg';
import { KoolaLogo, KoolaText, useTheme } from '../ui';
import { getNotchPreset, NOTCH_PRESETS, subscribeNotchPreset } from '../screens/dev/notchVariants';

export interface NotchHeaderProps {
  style?: StyleProp<ViewStyle>;
  /** When set, renders centered title instead of KOOLA logo */
  title?: string;
}

export const NOTCH_TAB_WIDTH = 132;
export const NOTCH_TAB_DROP = 22;
export const NOTCH_WING_INSET = 4;
export const NOTCH_FILLET = 22;

function buildNotchPath(
  width: number,
  insetsTop: number,
  tabWidth: number,
  tabDrop: number,
  fillet: number,
  dyFactor: number,
  hx: number,
  hy: number,
  bottomHx: number,
): { d: string; h: number; wingY: number; tabY: number } {
  const wingY = insetsTop + NOTCH_WING_INSET;
  const tabY = wingY + tabDrop;
  const cx = width / 2;
  const hw = tabWidth / 2;
  const r = fillet;
  const xl0 = cx - hw - r;
  const xlm = cx - hw;
  const xlf = cx - hw + r;
  const xrf = cx + hw - r;
  const xrm = cx + hw;
  const xr0 = cx + hw + r;
  const midY = (wingY + tabY) / 2;
  const dy = (tabY - wingY) * dyFactor;
  const d = [
    `M 0 0 L ${width} 0 L ${width} ${wingY}`,
    `L ${xr0} ${wingY}`,
    `C ${xr0 - r * hx} ${wingY} ${xrm + r * hy} ${midY - dy} ${xrm} ${midY}`,
    `C ${xrm - r * hy} ${midY + dy} ${xrf + r * bottomHx} ${tabY} ${xrf} ${tabY}`,
    `L ${xlf} ${tabY}`,
    `C ${xlf - r * bottomHx} ${tabY} ${xlm + r * hy} ${midY + dy} ${xlm} ${midY}`,
    `C ${xlm - r * hy} ${midY - dy} ${xl0 + r * hx} ${wingY} ${xl0} ${wingY}`,
    `L 0 ${wingY} Z`,
  ].join(' ');
  return { d, h: tabY, wingY, tabY };
}

export const NotchHeader: React.FC<NotchHeaderProps> = ({ style, title }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { tokens, resolvedScheme } = useTheme();
  const presetId = React.useSyncExternalStore(subscribeNotchPreset, getNotchPreset, getNotchPreset);
  const preset = NOTCH_PRESETS[presetId];

  // All hooks must run unconditionally — the flat early-return below must not
  // skip any hook call or React will throw "Rendered fewer hooks than expected".
  const { d, h, wingY, tabY } = useMemo(
    () => buildNotchPath(width, insets.top, preset.tabWidth, preset.tabDrop, preset.fillet, preset.dyFactor, preset.hx, preset.hy, preset.bottomHx),
    [width, insets.top, preset.tabWidth, preset.tabDrop, preset.fillet, preset.dyFactor, preset.hx, preset.hy, preset.bottomHx],
  );

  // ── Flat: simple rectangular bar, no notch, no shadow ──
  if (preset.flat) {
    const flatH = insets.top + NOTCH_WING_INSET + 22;
    return (
      <View style={[styles.host, { height: flatH }, style]}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: tokens.semantic.surface.level1 }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top - 6, alignItems: 'center' }}>
          {title ? (
            <KoolaText variant="label" weight="700" style={{ color: tokens.semantic.text.primary }}>{title}</KoolaText>
          ) : (
            <KoolaLogo showMark={false} showWordmark variant="flat" wordmarkSize={20} />
          )}
        </View>
      </View>
    );
  }

  const fill = tokens.semantic.surface.level1;
  const shadow = resolvedScheme === 'light' ? 'rgba(33, 45, 67, 0.14)' : 'rgba(0,0,0,0.45)';
  const tabCenterY = wingY + (tabY - wingY) / 2;
  const highlightColor = preset.highlightStrong
    ? resolvedScheme === 'light' ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.18)'
    : resolvedScheme === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.14)';
  const hairlineColor = resolvedScheme === 'light' ? 'rgba(0,114,188,0.06)' : 'rgba(255,255,255,0.08)';

  return (
    <View style={[styles.host, { height: h, overflow: 'visible' as const }, style]} pointerEvents="box-none">
      <View style={[StyleSheet.absoluteFill, { overflow: 'visible' as const }]} pointerEvents="none">
        <Svg width={width} height={h + 16} style={StyleSheet.absoluteFill}>
          <Defs>
            <Filter id="notchShadowImg2" x="-16%" y="-40%" width="132%" height="180%">
              <FeDropShadow dx={0} dy={6} stdDeviation={preset.shadowStd} floodColor={shadow} floodOpacity={1} />
            </Filter>
          </Defs>
          <Path d={d} fill={fill} filter="url(#notchShadowImg2)" />
          {preset.highlightOpacity > 0 ? <Path d={d} fill="none" stroke={highlightColor} strokeWidth={1} opacity={preset.highlightOpacity} /> : null}
          <Path d={d} fill="none" stroke={hairlineColor} strokeWidth={1} />
        </Svg>
      </View>

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: 0, height: h }]}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: tabCenterY - 17, alignItems: 'center' }}>
          {title ? (
            <KoolaText variant="label" weight="700" style={{ color: tokens.semantic.text.primary }}>{title}</KoolaText>
          ) : (
            <KoolaLogo showMark={false} showWordmark variant="flat" wordmarkSize={20} />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: { width: '100%', zIndex: 10 },
});
