import React, { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, useTheme } from '../../ui';
import { koolaRadii, koolaShadows, koolaDarkShadows } from '../../ui/theme';
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
function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
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
        name={i < Math.round(value) ? 'star' : 'star-border'}
        size={11}
        color={i < Math.round(value) ? '#C5A000' : semantic.border.subtle}
        style={{ marginRight: 1 }}
      />
    ))}
  </View>
);

// ── Per-cert badge with distinct color + icon ────────────────────────────────
const CertBadge: React.FC<{ cert: { key: string; label: string; sublabel?: string }; s: SemanticTokens }> = ({ cert, s }) => {
  if (cert.key === 'iso') {
    return (
      <View style={stylesCert.iso}>
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Circle cx={11} cy={11} r={10} fill="#E8F0FE" stroke="#1A56DB" strokeWidth={1} />
          <Circle cx={11} cy={11} r={7} fill="none" stroke="#1A56DB" strokeWidth={0.7} opacity={0.35} />
        </Svg>
        <View style={{ marginLeft: 4 }}>
          <KoolaText weight="800" style={{ fontSize: 8, color: '#1A56DB', lineHeight: 9, letterSpacing: 0.3 }}>
            ISO
          </KoolaText>
          <KoolaText weight="600" style={{ fontSize: 6, color: '#1A56DB', lineHeight: 6 }}>
            {cert.sublabel ?? '9001:2015'}
          </KoolaText>
        </View>
      </View>
    );
  }
  if (cert.key === 'haccp') {
    return (
      <View style={stylesCert.haccp}>
        <View style={stylesCert.haccpSeal}>
          <KoolaText weight="800" style={{ fontSize: 6, color: '#92400E', lineHeight: 7, textAlign: 'center' }}>
            HACCP
          </KoolaText>
          <KoolaText weight="600" style={{ fontSize: 5, color: '#92400E', lineHeight: 5, textAlign: 'center' }}>
            Certified
          </KoolaText>
        </View>
        <View style={stylesCert.haccpRibbon} />
      </View>
    );
  }
  if (cert.key === 'globalgap') {
    return (
      <View style={stylesCert.globalgap}>
        <Svg width={18} height={18} viewBox="0 0 18 18">
          <Circle cx={9} cy={9} r={8} fill="none" stroke="#16A34A" strokeWidth={1.15} strokeDasharray="2 1.2" />
          <Path d="M5 9 Q9 3 13 9 Q9 15 5 9" fill="#DCFCE7" stroke="#16A34A" strokeWidth={0.9} />
          <Path d="M9 5 L9 13 M6.5 7.5 Q9 9 11.5 7.5" stroke="#16A34A" strokeWidth={0.7} fill="none" />
        </Svg>
        <KoolaText weight="700" style={{ fontSize: 8, color: '#15803D', marginLeft: 3 }}>
          GLOBALG.A.P.
        </KoolaText>
      </View>
    );
  }
  if (cert.key === 'vietgap') {
    return (
      <View style={stylesCert.vietgap}>
        <MaterialIcons name="eco" size={10} color="#15803D" />
        <KoolaText weight="800" style={{ fontSize: 8, color: '#15803D', marginLeft: 2, letterSpacing: 0.2 }}>
          VIETGAP
        </KoolaText>
      </View>
    );
  }
  return (
    <View style={stylesCert.generic}>
      <MaterialIcons name="verified" size={10} color={s.action.primary} />
      <KoolaText weight="700" style={{ fontSize: 8, color: s.text.primary, marginLeft: 3 }}>
        {cert.label}
      </KoolaText>
    </View>
  );
};

const stylesCert = StyleSheet.create({
  iso: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingLeft: 3,
    paddingRight: 7,
    paddingVertical: 2,
  },
  haccp: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    borderRadius: 999,
    paddingLeft: 5,
    paddingRight: 7,
    paddingVertical: 2,
    gap: 4,
  },
  haccpSeal: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haccpRibbon: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#DC2626',
    marginLeft: -2,
    marginTop: 8,
  },
  globalgap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  vietgap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  generic: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E7EC',
    backgroundColor: '#F9FAFB',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
});

const BusinessCard: React.FC<BusinessCardProps> = ({ item, onPress, onMessagePress, messageDisabled, messageLoading }) => {
  const { resolvedScheme, tokens } = useTheme();
  const s = tokens.semantic;
  const styles = useMemo(() => makeStyles(s, resolvedScheme), [s, resolvedScheme]);
  const mock = isMock(item) ? (item as MockBusiness) : null;
  const [cardPressed, setCardPressed] = React.useState(false);
  const [ctaPressed, setCtaPressed] = React.useState(false);
  const ctaBg = s.action.primary;
  const ctaPressedBg = useMemo(() => darkenHex(ctaBg, 0.14), [ctaBg]);

  if (!mock) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => setCardPressed(true)}
        onPressOut={() => setCardPressed(false)}
        android_ripple={{ color: s.border.subtle }}
        accessibilityRole="button"
        accessibilityLabel={`Xem hồ sơ ${item.displayName}`}
        style={[styles.card, cardPressed && styles.cardPressed]}>
        <View style={styles.accentBar} />
        <View style={styles.headerCompact}>
          <View style={styles.logoWrapSm}>
            {(() => {
              const realDemoImage = (item as unknown as { demoImage?: ImageSourcePropType }).demoImage;
              const avatarStr = typeof (item as BusinessAccountItem).avatar === 'string' ? ((item as BusinessAccountItem).avatar as string) : '';
              const hasHttpAvatar = !!avatarStr && isHttpUri(avatarStr);
              if (realDemoImage) return <Image source={realDemoImage} style={styles.avatarSm} />;
              if (hasHttpAvatar) return <Image source={{ uri: avatarStr }} style={styles.avatarSm} />;
              return (
                <View style={[styles.avatarSm, styles.avatarFallback]}>
                  <DVMark size={24} />
                </View>
              );
            })()}
          </View>
          <View style={{ flex: 1, minWidth: 0, marginLeft: 9 }}>
            <KoolaText weight="700" numberOfLines={1} ellipsizeMode="tail" style={styles.nameSm}>
              {item.displayName}
            </KoolaText>
            {item.province ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                <MaterialIcons name="place" size={9} color="#667085" style={{ marginRight: 2 }} />
                <KoolaText weight="500" numberOfLines={1} style={styles.subSm}>
                  {item.province}
                </KoolaText>
              </View>
            ) : null}
          </View>
          <View style={styles.flagBadgeSm}>
            <VNFlag w={13} h={9} />
            <KoolaText weight="700" style={styles.flagSm}>
              VN
            </KoolaText>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.footerBarSm}>
          <View style={styles.footerLeft}>
            <MaterialIcons name="visibility" size={11} color="#667085" />
            <KoolaText weight="600" style={styles.footerMetaSm}>
              {formatCompact(0)}
            </KoolaText>
          </View>
          <Pressable
            onPress={(e) => { e.stopPropagation(); onMessagePress(); }}
            onPressIn={(e) => { e.stopPropagation(); setCtaPressed(true); }}
            onPressOut={() => setCtaPressed(false)}
            disabled={!!messageDisabled || !!messageLoading}
            android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
            accessibilityRole="button"
            accessibilityLabel="Nhắn tin ngay"
            style={[styles.ctaSm, { backgroundColor: ctaPressed ? ctaPressedBg : ctaBg }, ctaPressed && styles.ctaPressed, (messageDisabled || messageLoading) && styles.ctaDisabled]}>
            {messageLoading ? <ActivityIndicator size="small" color={s.text.onAction} /> : (
              <>
                <MaterialIcons name="chat-bubble-outline" size={11} color={s.text.onAction} />
                <KoolaText weight="700" style={styles.ctaTextSm}>Nhắn tin ngay</KoolaText>
              </>
            )}
          </Pressable>
        </View>
      </Pressable>
    );
  }

  const certs = mock.certifications ?? [];
  const MAX = 4;
  const visible = certs.slice(0, MAX);
  const rest = certs.length - visible.length;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setCardPressed(true)}
      onPressOut={() => setCardPressed(false)}
      android_ripple={{ color: s.border.subtle }}
      accessibilityRole="button"
      accessibilityLabel={`Xem hồ sơ ${item.displayName}`}
      style={[styles.card, cardPressed && styles.cardPressed]}>
      <View style={styles.accentBar} />

      {/* Header */}
      <View style={styles.headerCompact}>
        <View style={styles.logoWrapSm}>
          {mock.demoImage ? <Image source={mock.demoImage} style={styles.avatarSm} /> : (
            <View style={[styles.avatarSm, styles.avatarFallback]}><DVMark size={24} /></View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <KoolaText weight="700" numberOfLines={1} ellipsizeMode="tail" style={[styles.nameSm, { flexShrink: 1 }]}>
              {item.displayName}
            </KoolaText>
            {mock.verifiedMark ? (
              <View style={styles.verifiedSm}><MaterialIcons name="verified" size={8} color="#fff" /></View>
            ) : null}
          </View>
          <View style={styles.headerMetaRow}>
            <Stars value={mock.rating ?? 5} semantic={s} />
            {mock.yearsActive != null ? <KoolaText weight="600" style={styles.subStrong}> · {mock.yearsActive} năm</KoolaText> : null}
            <KoolaText weight="500" numberOfLines={1} style={[styles.subSm, { flexShrink: 1 }]}>
              · {(mock.locationLabel ?? mock.province ?? '').replace('TP. ', '').replace(', VIỆT NAM', '')}
            </KoolaText>
          </View>
        </View>
        <View style={styles.flagBadgeSm}>
          <VNFlag w={13} h={9} />
          <KoolaText weight="700" style={styles.flagSm}>VN</KoolaText>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Sản phẩm chính — 1 hàng riêng, text đen như demo */}
      <View style={styles.rowLine}>
        <KoolaText weight="700" style={styles.rowLabel}>SẢN PHẨM CHÍNH:</KoolaText>
        <KoolaText weight="600" numberOfLines={1} ellipsizeMode="tail" style={styles.rowValue}>
          {' '}{mock.mainProduct ?? mock.tagline ?? '—'}
        </KoolaText>
      </View>

      <View style={styles.divider} />

      {/* Thâm niên + Vị trí — sao vàng đậm */}
      <View style={styles.rowLine}>
        <Stars value={mock.rating ?? 5} semantic={s} />
        <KoolaText weight="700" style={styles.rowLabel}>THÂM NIÊN:</KoolaText>
        <KoolaText weight="600" style={styles.rowValue}> {mock.yearsActive ?? 15} NĂM</KoolaText>
        <View style={styles.dotDark} />
        <MaterialIcons name="place" size={10} color="#101828" style={{ marginRight: 2 }} />
        <KoolaText weight="600" numberOfLines={1} style={[styles.rowValue, { flexShrink: 1 }]}>
          {mock.locationLabel ?? mock.province ?? 'TP. HỒ CHÍ MINH, VIỆT NAM'}
        </KoolaText>
      </View>

      <View style={styles.divider} />

      {/* Chứng chỉ — icon + màu riêng từng loại */}
      <View style={styles.certRowLine}>
        <KoolaText weight="700" style={styles.rowLabel}>CHỨNG CHỈ:</KoolaText>
        <View style={styles.certWrapLine}>
          {visible.map((c) => <CertBadge key={c.key} cert={c} s={s} />)}
          {rest > 0 ? (
            <View style={styles.pillMore}><KoolaText weight="700" style={styles.pillMoreText}>+{rest}</KoolaText></View>
          ) : null}
          {visible.length === 0 ? <KoolaText weight="500" style={styles.rowValue}> —</KoolaText> : null}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Năng lực cung ứng — 1 hàng riêng như demo */}
      <View style={styles.rowLine}>
        <MaterialIcons name="local-shipping" size={11} color="#101828" style={{ marginRight: 4 }} />
        <KoolaText weight="700" style={styles.rowLabel}>NĂNG LỰC CUNG ỨNG:</KoolaText>
        <KoolaText weight="600" numberOfLines={1} ellipsizeMode="tail" style={styles.rowValue}>
          {' '}{mock.supplyCapacity ?? '100 TẤN/THÁNG, XUẤT KHẨU QUỐC TẾ'}
        </KoolaText>
      </View>

      <View style={styles.divider} />

      {/* Footer — views + CTA */}
      <View style={styles.footerBarSm}>
        <View style={styles.footerLeft}>
          <View style={styles.footerStat}>
            <MaterialIcons name="visibility" size={11} color="#1D2939" />
            <KoolaText weight="600" style={styles.footerMetaDark}>{formatCompact(mock.viewCount ?? 12500)}</KoolaText>
          </View>
          <View style={styles.footerStat}>
            <MaterialIcons name="chat-bubble" size={10} color="#1D2939" />
            <KoolaText weight="600" style={styles.footerMetaDark}>{mock.positiveFeedbackCount ?? 185}</KoolaText>
          </View>
        </View>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onMessagePress(); }}
          onPressIn={(e) => { e.stopPropagation(); setCtaPressed(true); }}
          onPressOut={() => setCtaPressed(false)}
          disabled={!!messageDisabled || !!messageLoading}
          android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
          accessibilityRole="button"
          accessibilityLabel="Nhắn tin ngay"
          style={[styles.ctaSm, { backgroundColor: ctaPressed ? ctaPressedBg : ctaBg }, ctaPressed && styles.ctaPressed, (messageDisabled || messageLoading) && styles.ctaDisabled]}>
          {messageLoading ? <ActivityIndicator size="small" color={s.text.onAction} /> : (
            <>
              <MaterialIcons name="chat-bubble-outline" size={11} color={s.text.onAction} />
              <KoolaText weight="700" style={styles.ctaTextSm}>Nhắn tin ngay</KoolaText>
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
      backgroundColor: semantic.surface.level1,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      paddingHorizontal: 12,
      paddingTop: 11,
      paddingBottom: 10,
      marginBottom: 8,
      gap: 0,
      overflow: 'hidden',
    },
    cardPressed: { opacity: 0.97, transform: [{ scale: 0.99 }] },
    accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: semantic.action.primary, opacity: scheme === 'dark' ? 0.9 : 1 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#EAECF0', marginVertical: 7 },
    // Header
    headerCompact: { flexDirection: 'row', alignItems: 'center' },
    logoWrapSm: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle, backgroundColor: semantic.surface.level2, alignItems: 'center', justifyContent: 'center' },
    avatarSm: { width: 36, height: 36, borderRadius: 18 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' },
    nameSm: { color: '#101828', fontSize: 12.5, lineHeight: 16, fontWeight: '700' as const },
    headerMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 3 },
    subSm: { fontSize: 10, color: '#101828', fontWeight: '500' as const },
    subStrong: { fontSize: 10, color: '#101828', fontWeight: '700' as const },
    verifiedSm: { width: 13, height: 13, borderRadius: 6.5, alignItems: 'center', justifyContent: 'center', marginLeft: 4, backgroundColor: '#12B76A' },
    flagBadgeSm: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle, borderRadius: koolaRadii.pill, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: semantic.surface.level2, gap: 3, flexShrink: 0, marginLeft: 8 },
    flagSm: { fontSize: 9, color: '#344054', fontWeight: '700' as const },
    // Rows — text đen như demo
    rowLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
    rowLabel: { fontSize: 10, color: '#101828', fontWeight: '700' as const, letterSpacing: 0.2 },
    rowValue: { fontSize: 10.5, color: '#101828', fontWeight: '600' as const, flexShrink: 1 },
    dotDark: { width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: '#667085', marginHorizontal: 4 },
    // Cert row
    certRowLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    certWrapLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1 },
    pillMore: { borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle, backgroundColor: semantic.bg.canvas, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, borderStyle: 'dashed' as const },
    pillMoreText: { fontSize: 9, color: '#667085', fontWeight: '700' as const },
    // Footer
    footerBarSm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    footerStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    footerMetaSm: { fontSize: 10, color: '#344054', fontWeight: '600' as const, fontVariant: ['tabular-nums'] as never },
    footerMetaDark: { fontSize: 10, color: '#101828', fontWeight: '600' as const, fontVariant: ['tabular-nums'] as never },
    ctaSm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 30, paddingHorizontal: 10, borderRadius: 8, gap: 4, flexShrink: 0 },
    ctaPressed: { opacity: 0.92, transform: [{ scale: 0.97 }] },
    ctaDisabled: { opacity: 0.5 },
    ctaTextSm: { color: semantic.text.onAction, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.15 },
  });

export default React.memo(BusinessCard);
