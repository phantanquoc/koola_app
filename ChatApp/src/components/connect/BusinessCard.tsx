import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, useTheme } from '../../ui';
import { koolaShadows, koolaDarkShadows } from '../../ui/theme';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { BusinessAccountItem } from '../../services/api/apiService';
import type { MockBusiness } from '../../screens/connect/mockBusinesses';

function isHttpUri(s: string): boolean {
  return /^(https?:\/\/|file:\/\/|data:)/i.test(s);
}

export interface BusinessCardProps {
  item: BusinessAccountItem | MockBusiness;
  onPress: () => void;
  onMessagePress: () => void;
  messageDisabled?: boolean;
  messageLoading?: boolean;
}

function isMock(item: BusinessAccountItem | MockBusiness): item is MockBusiness {
  return 'mainProduct' in item || 'rating' in item;
}
function formatViews(n: number): string {
  return n.toLocaleString('vi-VN');
}

const VNFlag: React.FC<{ w?: number; h?: number }> = ({ w = 30, h = 19 }) => (
  <Svg width={w} height={h} viewBox="0 0 38 24">
    <Rect x={0} y={0} width={38} height={24} rx={3} fill="#DA251D" />
    <Path d="M19 6 L20.6 11.2 L26 11.2 L21.7 14.3 L22.9 19.1 L19 16.1 L15.1 19.1 L16.3 14.3 L12 11.2 L17.4 11.2 Z" fill="#FFFF00" />
  </Svg>
);

const DVMark: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <Svg width={size} height={size} viewBox="0 0 44 44">
    <Circle cx={22} cy={22} r={20} fill="#EAF2FF" stroke="#C7DEFF" strokeWidth={1} />
    <Circle cx={22} cy={16} r={7} fill="#FACC15" />
    <Path d="M22 5 L22 8 M14 9 L16 11.5 M30 9 L28 11.5" stroke="#FACC15" strokeWidth={1.2} strokeLinecap="round" />
    <Path d="M8 28 Q16 18 22 27 Q28 19 36 28 L36 34 Q22 36 8 34 Z" fill="#22C55E" />
    <Path d="M10 29 Q16 22 20 28 L18 33 Q12 33 10 29 Z" fill="#0EA5E9" />
    <Path d="M14 30 L14 20 L18.5 20 Q21 20 21 23 Q21 26 18.5 26 L14 26 Z M16 22 L16 24 L18.2 24 Q19 24 19 23 Q19 22 18.2 22 Z" fill="#1E3A5F" />
    <Path d="M22 20 L24.1 20 L26.5 25.5 L27.2 27 L27.4 27 L28.1 25.5 L30.5 20 L32.6 20 L28.8 30 L26.2 30 Z" fill="#16A34A" />
  </Svg>
);

const Stars: React.FC<{ value: number }> = ({ value }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {Array.from({ length: 5 }).map((_, i) => (
      <MaterialIcons key={i} name={i < value ? 'star' : 'star-border'} size={12} color={i < value ? '#D99A00' : '#CBD5E1'} style={{ marginRight: 1 }} />
    ))}
  </View>
);

const BusinessCard: React.FC<BusinessCardProps> = ({ item, onPress, onMessagePress }) => {
  const { resolvedScheme, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(resolvedScheme, tokens.semantic), [resolvedScheme, tokens.semantic]);
  const mock = isMock(item) ? (item as MockBusiness) : null;

  if (!mock) {
    const realDemoImage = (item as unknown as { demoImage?: ImageSourcePropType }).demoImage;
    const avatarStr = typeof (item as BusinessAccountItem).avatar === 'string' ? (item as BusinessAccountItem).avatar as string : '';
    const hasHttpAvatar = !!avatarStr && isHttpUri(avatarStr);
    return (
      <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
        {realDemoImage ? (
          <Image source={realDemoImage} style={[styles.avatarImg, styles.avatar38]} />
        ) : hasHttpAvatar ? (
          <Image source={{ uri: avatarStr }} style={[styles.avatarImg, styles.avatar38]} />
        ) : (
          <DVMark size={38} />
        )}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <KoolaText weight="800" numberOfLines={2} ellipsizeMode="tail" style={styles.companyName}>{item.displayName}</KoolaText>
          {item.province ? <KoolaText variant="caption" tone="muted" style={{ fontSize: 11 }}>{item.province}</KoolaText> : null}
        </View>
        <Pressable style={styles.ctaGreen} onPress={(e) => { e.stopPropagation(); onMessagePress(); }}>
          <MaterialIcons name="chat-bubble-outline" size={12} color="#FFFFFF" />
          <KoolaText weight="700" style={{ color: '#FFFFFF', marginLeft: 5, fontSize: 10 }}>NHẮN TIN</KoolaText>
        </Pressable>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Xem hồ sơ ${item.displayName}`}>
      <View pointerEvents="none" style={styles.washOverlay} />
      <View pointerEvents="none" style={styles.watermark}>
        <Svg width={200} height={200} viewBox="0 0 240 240" opacity={0.06}>
          <Path d="M40 165 Q85 60 170 45 Q145 120 105 160 Q65 185 40 165 Z" fill="#94A3B8" />
        </Svg>
      </View>

      {/* Header: logo + tên (2 dòng) + cờ */}
      <View style={styles.headerRow}>
        {mock.demoImage ? <Image source={mock.demoImage} style={[styles.avatarImg, styles.avatar42]} /> : <DVMark size={42} />}
        <KoolaText weight="800" numberOfLines={2} ellipsizeMode="tail" style={[styles.companyName, { flex: 1, marginLeft: 8, marginRight: 6 }]}>
          {item.displayName}
        </KoolaText>
        <View style={styles.flagBox}>
          <VNFlag w={20} h={13} />
          <KoolaText weight="700" style={styles.flagValue}> VN</KoolaText>
        </View>
      </View>

      <View style={styles.dividerStrong} />

      <View style={styles.row}>
        <KoolaText weight="800" style={styles.rowLabel}>SẢN PHẨM CHÍNH:</KoolaText>
        <KoolaText weight="600" style={styles.rowValue} numberOfLines={1}> {mock.mainProduct ?? mock.tagline ?? ''}</KoolaText>
      </View>

      <View style={styles.dividerThin} />

      {/* 1 dòng gộp: sao · thâm niên · vị trí */}
      <View style={styles.metaRow}>
        <Stars value={mock.rating ?? 5} />
        <KoolaText weight="600" style={styles.metaText}>  {mock.yearsActive ?? 5} NĂM</KoolaText>
        <View style={styles.dot} />
        <KoolaText weight="600" style={styles.metaText} numberOfLines={1}>{mock.locationLabel ?? mock.province ?? ''}</KoolaText>
      </View>

      <View style={styles.dividerThin} />

      <View style={styles.certRow}>
        <KoolaText weight="700" style={styles.certLabel}>CHỨNG CHỈ:</KoolaText>
        <View style={styles.certGroup}>
          {(mock.certifications ?? []).map((c) => {
            if (c.key === 'iso') return <View key={c.key} style={styles.certIso}><KoolaText weight="800" style={styles.certIsoText}>ISO</KoolaText><KoolaText weight="600" style={styles.certIsoSub}>{c.sublabel ?? '9001:2015'}</KoolaText></View>;
            if (c.key === 'haccp') return <View key={c.key} style={styles.certHaccp}><KoolaText weight="800" style={styles.certHaccpText}>HACCP</KoolaText></View>;
            if (c.key === 'globalgap') return <View key={c.key} style={styles.certGap}><View style={styles.certGapG}><KoolaText weight="800" style={styles.certGapGText}>G</KoolaText></View><KoolaText weight="700" style={styles.certGapText}>GLOBALG.A.P.</KoolaText></View>;
            if (c.key === 'vietgap') return <KoolaText key={c.key} weight="800" style={styles.vietgap}>VIETGAP</KoolaText>;
            return <View key={c.key} style={styles.certGeneric}><KoolaText weight="800" style={{ fontSize: 7, color: '#1E40AF' }}>{c.label}</KoolaText></View>;
          })}
        </View>
      </View>

      <View style={styles.dividerThin} />

      <View style={styles.row}>
        <KoolaText weight="700" style={styles.certLabel}>CUNG ỨNG:</KoolaText>
        <KoolaText weight="600" style={styles.rowValue} numberOfLines={1}> {mock.supplyCapacity ?? ''}</KoolaText>
      </View>

      <View style={styles.dividerStrong} />

      {/* Footer 1 dòng */}
      <View style={styles.footer}>
        <MaterialIcons name="visibility" size={12} color="#475569" />
        <KoolaText weight="600" style={styles.footerText}>{formatViews(mock.viewCount ?? 0)}</KoolaText>
        <View style={styles.dotSm} />
        <MaterialIcons name="chat-bubble" size={11} color="#475569" />
        <KoolaText weight="600" style={styles.footerText}>{mock.positiveFeedbackCount ?? 0}</KoolaText>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.ctaGreen} onPress={(e) => { e.stopPropagation(); onMessagePress(); }} accessibilityRole="button">
          <MaterialIcons name="chat-bubble-outline" size={12} color="#FFFFFF" />
          <KoolaText weight="800" style={styles.ctaText}>NHẮN TIN NGAY</KoolaText>
        </Pressable>
      </View>
    </Pressable>
  );
};

const makeStyles = (scheme: 'light' | 'dark', semantic: SemanticTokens) =>
  StyleSheet.create({
    card: {
      ...(scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm),
      backgroundColor: semantic.surface.level2,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 8,
      marginBottom: 8,
      overflow: 'hidden',
    },
    washOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '40%' as never,
      backgroundColor: scheme === 'dark' ? 'rgba(251,146,60,0.06)' : '#FFF8EC',
      opacity: scheme === 'dark' ? 1 : 0.45,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    watermark: { position: 'absolute', right: -10, bottom: -14 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
    avatarImg: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      backgroundColor: semantic.surface.level0,
    },
    avatar42: { width: 42, height: 42, borderRadius: 21 },
    avatar38: { width: 38, height: 38, borderRadius: 19 },
    companyName: { color: '#1E3A5F', fontSize: 12.5, lineHeight: 17 },
    flagBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: semantic.border.subtle,
      borderRadius: 5,
      paddingHorizontal: 4,
      paddingVertical: 2,
      backgroundColor: semantic.surface.level0,
    },
    flagValue: { fontSize: 7.5, color: '#0F172A' },
    dividerStrong: { height: 1, backgroundColor: '#1E293B', marginTop: 7, opacity: 0.85 },
    dividerThin: { height: StyleSheet.hairlineWidth, backgroundColor: '#E7DDCB', marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    rowLabel: { fontSize: 9.5, color: '#0F172A', letterSpacing: 0.2 },
    rowValue: { fontSize: 9.5, color: '#334155', flex: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    metaText: { fontSize: 9.5, color: '#0F172A' },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#94A3B8', marginHorizontal: 6 },
    dotSm: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1', marginHorizontal: 6 },
    certRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    certLabel: { fontSize: 9.5, color: '#0F172A', letterSpacing: 0.15 },
    certGroup: { flexDirection: 'row', alignItems: 'center', marginLeft: 6, flex: 1, flexWrap: 'wrap', gap: 4 as never },
    certIso: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.3, borderColor: '#1E40AF', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
    certIsoText: { fontSize: 7.5, color: '#1E40AF', lineHeight: 8, textAlign: 'center' as const },
    certIsoSub: { fontSize: 5, color: '#1E40AF', lineHeight: 5.5, textAlign: 'center' as const },
    certHaccp: { minWidth: 30, height: 24, borderRadius: 12, borderWidth: 1.2, borderColor: '#B45309', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFBEB', paddingHorizontal: 6 },
    certHaccpText: { fontSize: 7, color: '#92400E', textAlign: 'center' as const },
    certGap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#16A34A', borderRadius: 999, paddingLeft: 3, paddingRight: 6, height: 22, backgroundColor: '#FFFFFF' },
    certGapG: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', marginRight: 3 },
    certGapGText: { fontSize: 9, color: '#FFFFFF', lineHeight: 11 },
    certGapText: { fontSize: 6.5, color: '#15803D' },
    vietgap: { fontSize: 10, color: '#15803D' },
    certGeneric: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 999, paddingHorizontal: 6, height: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
    footer: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
    footerText: { fontSize: 9.5, color: '#334155', marginLeft: 3 },
    ctaGreen: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A9A4B', paddingHorizontal: 10, height: 26, borderRadius: 7 },
    ctaText: { color: '#FFFFFF', marginLeft: 5, fontSize: 10, letterSpacing: 0.15 },
  });

export default React.memo(BusinessCard);
