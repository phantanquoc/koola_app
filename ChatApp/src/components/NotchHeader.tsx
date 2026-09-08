import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, Filter, FeDropShadow } from 'react-native-svg';
import { KoolaLogo, KoolaText, useTheme } from '../ui';

export interface NotchHeaderProps {
  style?: StyleProp<ViewStyle>;
  /** When set, renders centered title instead of KOOLA logo */
  title?: string;
}

const TAB_WIDTH = 180;
const TAB_DROP = 30;
const WING_INSET_TOP = 4;
const FILLET = 26;

function buildNotchPath(width: number, insetsTop: number): { d: string; h: number; wingY: number; tabY: number } {
  const wingY = insetsTop + WING_INSET_TOP;
  const tabY = wingY + TAB_DROP;
  const cx = width / 2;
  const hw = TAB_WIDTH / 2;
  const r = FILLET;
  const xl0 = cx - hw - r;
  const xlm = cx - hw;
  const xlf = cx - hw + r;
  const xrf = cx + hw - r;
  const xrm = cx + hw;
  const xr0 = cx + hw + r;
  const midY = (wingY + tabY) / 2;
  const dy = (tabY - wingY) * 0.12;
  const d = [
    `M 0 0 L ${width} 0 L ${width} ${wingY}`,
    `L ${xr0} ${wingY}`,
    `C ${xr0 - r * 0.55} ${wingY} ${xrm + r * 0.08} ${midY - dy} ${xrm} ${midY}`,
    `C ${xrm - r * 0.08} ${midY + dy} ${xrf + r * 0.55} ${tabY} ${xrf} ${tabY}`,
    `L ${xlf} ${tabY}`,
    `C ${xlf - r * 0.55} ${tabY} ${xlm + r * 0.08} ${midY + dy} ${xlm} ${midY}`,
    `C ${xlm - r * 0.08} ${midY - dy} ${xl0 + r * 0.55} ${wingY} ${xl0} ${wingY}`,
    `L 0 ${wingY} Z`,
  ].join(' ');
  return { d, h: tabY, wingY, tabY };
}

export const NotchHeader: React.FC<NotchHeaderProps> = ({ style, title }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { tokens, resolvedScheme } = useTheme();
  const { d, h, wingY, tabY } = useMemo(() => buildNotchPath(width, insets.top), [width, insets.top]);
  const fill = tokens.semantic.surface.level1;
  const shadow = resolvedScheme === 'light' ? 'rgba(33, 45, 67, 0.14)' : 'rgba(0,0,0,0.45)';
  const tabCenterY = wingY + (tabY - wingY) / 2;

  return (
    <View style={[styles.host, { height: h, overflow: 'visible' as const }, style]} pointerEvents="box-none">
      <View style={[StyleSheet.absoluteFill, { overflow: 'visible' as const }]} pointerEvents="none">
        <Svg width={width} height={h + 16} style={StyleSheet.absoluteFill}>
          <Defs>
            <Filter id="notchShadowImg2" x="-16%" y="-40%" width="132%" height="180%">
              <FeDropShadow dx={0} dy={6} stdDeviation={8} floodColor={shadow} floodOpacity={1} />
            </Filter>
          </Defs>
          <Path d={d} fill={fill} filter="url(#notchShadowImg2)" />
          <Path d={d} fill="none" stroke={resolvedScheme === 'light' ? 'rgba(0,114,188,0.07)' : 'rgba(255,255,255,0.10)'} strokeWidth={1} />
        </Svg>
      </View>

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: 0, height: h }]}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: tabCenterY - 13, alignItems: 'center' }}>
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
