import React, { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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

const Stars: React.FC<{ value: number; semantic: SemanticTokens }> = ({ value, semantic }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {Array.from({ length: 5 }).map((_, i) => (
      <MaterialIcons
        key={i}
        name={i < value ? 'star' : 'star-border'}
        size={13}
        color={i < value ? semantic.status.warning : semantic.border.strong}
        style={{ marginRight: 1 }}
      />
    ))}
  </View>
);

const BusinessCard: React.FC<BusinessCardProps> = ({ item, onPress, onMessagePress, messageDisabled, messageLoading }) => {
  const { resolvedScheme, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);
  const mock = isMock(item) ? (item as MockBusiness) : null;
  const [cardPressed, setCardPressed] = React.useState(false);
  const [ctaPressed, setCtaPressed] = React.useState(false);
  const ctaBg = tokens.semantic.status.success;
  const ctaPressedBg = useMemo(() => darkenHex(ctaBg, 0.12), [ctaBg]);

  if (!mock) {
    const realDemoImage = (item as unknown as { demoImage?: ImageSourcePropType }).demoImage;
    const avatarStr = typeof (item as BusinessAccountItem).avatar === 'string' ? ((item as BusinessAccountItem).avatar as string) : '';
    const hasHttpAvatar = !!avatarStr && isHttpUri(avatarStr);
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => setCardPressed(true)}
        onPressOut={() => setCardPressed(false)}
        android_ripple={{ color: tokens.semantic.border.subtle }}
        accessibilityRole="button"
        accessibilityLabel={`Xem hồ sơ ${item.displayName}`}
        style={[styles.card, cardPressed && styles.cardPressed]}>
        {realDemoImage ? (
          <Image source={realDemoImage} style={[styles.avatarImg, styles.avatar38]} />
        ) : hasHttpAvatar ? (
          <Image source={{ uri: avatarStr }} style={[styles.avatarImg, styles.avatar38]} />
        ) : (
          <DVMark size={38} />
        )}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <KoolaText weight="800" numberOfLines={2} ellipsizeMode="tail" style={styles.companyName}>
            {item.displayName}
          </KoolaText>
          {item.province ? (
            <KoolaText weight="600" style={styles.metaText} numberOfLines={1}>
              {item.province}
            </KoolaText>
          ) : null}
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onMessagePress();
          }}
          onPressIn={(e) => {
            e.stopPropagation();
            setCtaPressed(true);
          }}
          onPressOut={() => setCtaPressed(false)}
          disabled={!!messageDisabled || !!messageLoading}
          android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
          accessibilityRole="button"
          accessibilityLabel="Nhắn tin"
          accessibilityState={{ disabled: !!messageDisabled || !!messageLoading, busy: !!messageLoading }}
          style={[
            styles.ctaGreen,
            { backgroundColor: ctaPressed ? ctaPressedBg : ctaBg },
            ctaPressed && styles.ctaPressed,
            (messageDisabled || messageLoading) && styles.ctaDisabled,
          ]}>
          {messageLoading ? (
            <ActivityIndicator size="small" color={tokens.semantic.text.onAction} />
          ) : (
            <>
              <MaterialIcons name="chat-bubble-outline" size={12} color={tokens.semantic.text.onAction} />
              <KoolaText weight="800" style={styles.ctaText}>
                NHẮN TIN
              </KoolaText>
            </>
          )}
        </Pressable>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setCardPressed(true)}
      onPressOut={() => setCardPressed(false)}
      android_ripple={{ color: tokens.semantic.border.subtle }}
      accessibilityRole="button"
      accessibilityLabel={`Xem hồ sơ ${item.displayName}`}
      style={[styles.card, cardPressed && styles.cardPressed]}>
      <View pointerEvents="none" style={styles.washOverlay} accessible={false} />
      <View pointerEvents="none" style={styles.watermark} accessible={false}>
        <Svg width={200} height={200} viewBox="0 0 240 240">
          <Path d="M40 165 Q85 60 170 45 Q145 120 105 160 Q65 185 40 165 Z" fill={hexToRgba(tokens.semantic.text.faint, 0.05)} />
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
          <KoolaText weight="700" style={styles.flagValue}>
            {' '}
            VN
          </KoolaText>
        </View>
      </View>

      <View style={styles.divider} accessible={false} />

      <View style={styles.row}>
        <KoolaText weight="700" style={styles.rowLabel}>
          SẢN PHẨM CHÍNH:
        </KoolaText>
        <KoolaText weight="600" style={styles.rowValue} numberOfLines={1}>
          {' '}
          {mock.mainProduct ?? mock.tagline ?? ''}
        </KoolaText>
      </View>

      <View style={styles.divider} accessible={false} />

      {/* 1 dòng gộp: sao · thâm niên · vị trí */}
      <View style={styles.metaRow}>
        <Stars value={mock.rating ?? 5} semantic={tokens.semantic} />
        <KoolaText weight="600" style={styles.metaText}>
          {'  '}
          {mock.yearsActive ?? 5} NĂM
        </KoolaText>
        <View style={styles.dot} accessible={false} />
        <KoolaText weight="600" style={styles.metaText} numberOfLines={1}>
          {mock.locationLabel ?? mock.province ?? ''}
        </KoolaText>
      </View>

      <View style={styles.divider} accessible={false} />

      <View style={styles.certRow}>
        <KoolaText weight="700" style={styles.certLabel}>
          CHỨNG CHỈ:
        </KoolaText>
        <View style={styles.certGroup}>
          {(mock.certifications ?? []).map((c) => {
            if (c.key === 'iso')
              return (
                <View key={c.key} style={styles.certIso}>
                  <KoolaText weight="800" style={styles.certIsoText}>
                    ISO
                  </KoolaText>
                  <KoolaText weight="600" style={styles.certIsoSub}>
                    {c.sublabel ?? '9001:2015'}
                  </KoolaText>
                </View>
              );
            if (c.key === 'haccp')
              return (
                <View key={c.key} style={styles.certHaccp}>
                  <KoolaText weight="800" style={styles.certHaccpText}>
                    HACCP
                  </KoolaText>
                </View>
              );
            if (c.key === 'globalgap')
              return (
                <View key={c.key} style={styles.certGap}>
                  <View style={styles.certGapG}>
                    <KoolaText weight="800" style={styles.certGapGText}>
                      G
                    </KoolaText>
                  </View>
                  <KoolaText weight="700" style={styles.certGapText}>
                    GLOBALG.A.P.
                  </KoolaText>
                </View>
              );
            if (c.key === 'vietgap')
              return (
                <View key={c.key} style={styles.vietgapPill}>
                  <KoolaText weight="800" style={styles.vietgapText}>
                    VIETGAP
                  </KoolaText>
                </View>
              );
            return (
              <View key={c.key} style={styles.certGeneric}>
                <KoolaText weight="800" style={styles.certGenericText}>
                  {c.label}
                </KoolaText>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.divider} accessible={false} />

      <View style={styles.row}>
        <KoolaText weight="700" style={styles.certLabel}>
          CUNG ỨNG:
        </KoolaText>
        <KoolaText weight="600" style={styles.rowValue} numberOfLines={1}>
          {' '}
          {mock.supplyCapacity ?? ''}
        </KoolaText>
      </View>

      <View style={styles.divider} accessible={false} />

      {/* Footer 1 dòng */}
      <View style={styles.footer}>
        <MaterialIcons name="visibility" size={12} color={tokens.semantic.text.faint} />
        <KoolaText weight="600" style={styles.footerText}>
          {formatViews(mock.viewCount ?? 0)}
        </KoolaText>
        <View style={styles.dotSm} accessible={false} />
        <MaterialIcons name="chat-bubble" size={11} color={tokens.semantic.text.faint} />
        <KoolaText weight="600" style={styles.footerText}>
          {mock.positiveFeedbackCount ?? 0}
        </KoolaText>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onMessagePress();
          }}
          onPressIn={(e) => {
            e.stopPropagation();
            setCtaPressed(true);
          }}
          onPressOut={() => setCtaPressed(false)}
          disabled={!!messageDisabled || !!messageLoading}
          android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
          accessibilityRole="button"
          accessibilityLabel="Nhắn tin ngay"
          accessibilityState={{ disabled: !!messageDisabled || !!messageLoading, busy: !!messageLoading }}
          style={[
            styles.ctaGreen,
            { backgroundColor: ctaPressed ? ctaPressedBg : ctaBg },
            ctaPressed && styles.ctaPressed,
            (messageDisabled || messageLoading) && styles.ctaDisabled,
          ]}>
          {messageLoading ? (
            <ActivityIndicator size="small" color={tokens.semantic.text.onAction} />
          ) : (
            <>
              <MaterialIcons name="chat-bubble-outline" size={12} color={tokens.semantic.text.onAction} />
              <KoolaText weight="800" style={styles.ctaText}>
                NHẮN TIN NGAY
              </KoolaText>
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
};

const makeStyles = (semantic: SemanticTokens, scheme: 'light' | 'dark') =>
  StyleSheet.create({
    card: {
      ...(scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm),
      backgroundColor: semantic.surface.level2,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      marginBottom: 8,
      overflow: 'hidden',
      gap: 8,
    },
    cardPressed: {
      opacity: 0.96,
      transform: [{ scale: 0.985 }],
    },
    washOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '40%' as never,
      backgroundColor: scheme === 'dark' ? hexToRgba(semantic.action.primarySoft, 0.1) : hexToRgba(semantic.action.primarySoft, 0.06),
      opacity: 1,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    watermark: { position: 'absolute', right: -10, bottom: -14, opacity: 1 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
    avatarImg: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      backgroundColor: semantic.surface.level0,
    },
    avatar42: { width: 42, height: 42, borderRadius: 21 },
    avatar38: { width: 38, height: 38, borderRadius: 19 },
    companyName: { color: semantic.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '800' },
    flagBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 2,
      backgroundColor: semantic.surface.level0,
    },
    flagValue: { fontSize: 9, color: semantic.text.primary, fontWeight: '700' },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle },
    row: { flexDirection: 'row', alignItems: 'center' },
    rowLabel: { fontSize: 11, color: semantic.text.muted, fontWeight: '700', letterSpacing: 0.4 },
    rowValue: { fontSize: 11, color: semantic.text.primary, fontWeight: '600', flex: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    metaText: { fontSize: 11, color: semantic.text.muted, fontWeight: '600' },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: semantic.border.strong, marginHorizontal: 6 },
    dotSm: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: semantic.border.strong, marginHorizontal: 6 },
    certRow: { flexDirection: 'row', alignItems: 'center' },
    certLabel: { fontSize: 11, color: semantic.text.muted, fontWeight: '700', letterSpacing: 0.4 },
    certGroup: { flexDirection: 'row', alignItems: 'center', marginLeft: 6, flex: 1, flexWrap: 'wrap', gap: 6 as never },
    certIso: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.brand.blue,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level0,
    },
    certIsoText: { fontSize: 7.5, color: semantic.brand.blue, lineHeight: 8, textAlign: 'center' as const, fontWeight: '800' },
    certIsoSub: { fontSize: 5, color: semantic.brand.blue, lineHeight: 5.5, textAlign: 'center' as const, fontWeight: '600' },
    certHaccp: {
      minWidth: 30,
      height: 22,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.status.warning,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level0,
      paddingHorizontal: 8,
    },
    certHaccpText: { fontSize: 7, color: semantic.status.warning, textAlign: 'center' as const, fontWeight: '800' },
    certGap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.status.success,
      borderRadius: 999,
      paddingLeft: 3,
      paddingRight: 8,
      height: 22,
      backgroundColor: semantic.surface.level0,
      gap: 3,
    },
    certGapG: { width: 16, height: 16, borderRadius: 8, backgroundColor: semantic.status.success, alignItems: 'center', justifyContent: 'center' },
    certGapGText: { fontSize: 9, color: semantic.text.onAction, lineHeight: 11, fontWeight: '800' },
    certGapText: { fontSize: 10, color: semantic.status.success, fontWeight: '700' },
    vietgapPill: {
      height: 22,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.status.success,
      backgroundColor: hexToRgba(semantic.status.success, 0.12),
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vietgapText: { fontSize: 10, color: semantic.status.success, fontWeight: '800' },
    certGeneric: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      borderRadius: 999,
      paddingHorizontal: 8,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level0,
    },
    certGenericText: { fontSize: 10, color: semantic.brand.blue, fontWeight: '800' },
    footer: { flexDirection: 'row', alignItems: 'center' },
    footerText: { fontSize: 11, color: semantic.text.faint, fontWeight: '600', marginLeft: 3, fontVariant: ['tabular-nums'] as never },
    ctaGreen: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 7,
      gap: 5,
    },
    ctaPressed: { opacity: 0.96, transform: [{ scale: 0.97 }] },
    ctaDisabled: { opacity: 0.55 },
    ctaText: { color: semantic.text.onAction, fontSize: 11, letterSpacing: 0.4, fontWeight: '800' },
  });

export default React.memo(BusinessCard);
