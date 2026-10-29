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
/** "TP. HỒ CHÍ MINH, VIỆT NAM" → "TP. Hồ Chí Minh" for the compact meta line. */
function shortLocation(label?: string): string {
  if (!label) return '';
  const first = label.split(',')[0].trim().replace(/^TP\.\s*/i, '');
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
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
        size={12}
        color={i < Math.round(value) ? '#C5A000' : semantic.border.subtle}
        style={{ marginRight: 1 }}
      />
    ))}
  </View>
);

// ── Per-cert badge with distinct color + icon (content tint follows its own
//    brand palette; the pill shape/size is uniform so the wrap stays tidy) ────
const CertBadge: React.FC<{ cert: { key: string; label: string; sublabel?: string }; s: SemanticTokens }> = ({ cert, s }) => {
  const text = cert.key === 'iso' && cert.sublabel ? `ISO ${cert.sublabel}` : cert.label;
  let icon: React.ReactNode;
  let fg = s.action.primary;
  let border = '#BFDBFE';
  let bg = '#EFF6FF';
  if (cert.key === 'iso') {
    icon = <MaterialIcons name="verified-user" size={12} color={fg} />;
  } else if (cert.key === 'haccp') {
    fg = '#B45309'; border = '#FDE68A'; bg = '#FFFBEB';
    icon = <MaterialIcons name="verified" size={12} color={fg} />;
  } else if (cert.key === 'globalgap' || cert.key === 'vietgap') {
    fg = '#15803D'; border = '#BBF7D0'; bg = '#F0FDF4';
    icon = <MaterialIcons name={cert.key === 'vietgap' ? 'eco' : 'verified'} size={12} color={fg} />;
  } else {
    icon = <MaterialIcons name="verified" size={12} color={fg} />;
  }
  return (
    <View style={[stylesCert.pill, stylesCert.pillWrap, { borderColor: border, backgroundColor: bg }]}>
      {icon}
      <KoolaText weight="700" numberOfLines={1} style={[stylesCert.text, { color: fg }]}>
        {text}
      </KoolaText>
    </View>
  );
};

const stylesCert = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: koolaRadii.pill,
    paddingLeft: 6,
    paddingRight: 8,
    height: 22,
    flexShrink: 0,
  },
  pillWrap: { marginRight: 5, marginBottom: 3 },
  text: { fontSize: 10.5, marginLeft: 3, letterSpacing: 0.2 },
});

/** Label + value block: the value wraps on its own lines instead of fragmenting
 *  the inline label/value row into stray fragments. */
const Field: React.FC<{
  label: string;
  children?: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
  topGap?: boolean;
}> = ({ label, children, styles, topGap }) => (
  <View style={topGap ? styles.fieldSpaced : undefined}>
    <KoolaText weight="700" style={styles.fieldLabel}>{label}</KoolaText>
    <View style={styles.fieldValueRow}>{children}</View>
  </View>
);

const BusinessCard: React.FC<BusinessCardProps> = ({ item, onPress, onMessagePress, messageDisabled, messageLoading }) => {
  const { resolvedScheme, tokens } = useTheme();
  const s = tokens.semantic;
  const styles = useMemo(() => makeStyles(s, resolvedScheme), [s, resolvedScheme]);
  const mock = isMock(item) ? (item as MockBusiness) : null;
  const [cardPressed, setCardPressed] = React.useState(false);
  const [ctaPressed, setCtaPressed] = React.useState(false);
  const ctaBg = s.action.primary;
  const ctaPressedBg = useMemo(() => darkenHex(ctaBg, 0.14), [ctaBg]);

  const avatar = useMemo(() => {
    if (mock?.demoImage) return <Image source={mock.demoImage} style={styles.avatar} />;
    const realDemoImage = (item as unknown as { demoImage?: ImageSourcePropType }).demoImage;
    if (realDemoImage) return <Image source={realDemoImage} style={styles.avatar} />;
    const avatarStr = typeof (item as BusinessAccountItem).avatar === 'string' ? ((item as BusinessAccountItem).avatar as string) : '';
    if (avatarStr && isHttpUri(avatarStr)) return <Image source={{ uri: avatarStr }} style={styles.avatar} />;
    return (
      <View style={[styles.avatar, styles.avatarFallback]}>
        <DVMark size={28} />
      </View>
    );
  }, [item, mock, styles]);

  // Normalize the two data shapes into one view model so the card has a single
  // layout — the rich mock fields simply override the base item fields.
  const verified = mock ? !!mock.verifiedMark : item.verificationStatus === 'verified';
  const rating = mock?.rating;
  const years = mock?.yearsActive;
  const location = shortLocation(mock?.locationLabel ?? item.province);
  const mainProduct = mock ? (mock.mainProduct ?? mock.tagline) : item.tagline;
  const certs = mock?.certifications ?? [];
  const MAX_CERTS = 4;
  const visibleCerts = certs.slice(0, MAX_CERTS);
  const restCerts = certs.length - visibleCerts.length;
  const capacity = mock?.supplyCapacity;
  const views = mock?.viewCount ?? 0;
  const feedback = mock?.positiveFeedbackCount;
  const loading = !!messageDisabled || !!messageLoading;

  const metaLine = [
    rating != null ? (
      <Stars key="stars" value={rating} semantic={s} />
    ) : null,
    years != null ? (
      <KoolaText key="years" weight="600" style={styles.metaText}>{years} năm</KoolaText>
    ) : null,
    location ? (
      <View key="loc" style={styles.metaLoc}>
        <MaterialIcons name="place" size={12} color={s.text.muted} style={{ marginRight: 2 }} />
        <KoolaText weight="500" numberOfLines={1} style={styles.metaText}>{location}</KoolaText>
      </View>
    ) : null,
  ].filter(Boolean);

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

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.logoWrap}>{avatar}</View>
          <View style={styles.headerCol}>
            <View style={styles.nameRow}>
              <KoolaText weight="700" numberOfLines={2} ellipsizeMode="tail" style={styles.name}>
                {item.displayName}
              </KoolaText>
              {verified ? (
                <View style={styles.verified}><MaterialIcons name="verified" size={9} color={s.text.onAction} /></View>
              ) : null}
            </View>
            {metaLine.length > 0 ? <View style={styles.metaRow}>{metaLine}</View> : null}
          </View>
          <View style={styles.flagBadge}>
            <VNFlag w={13} h={9} />
            <KoolaText weight="700" style={styles.flagText}>VN</KoolaText>
          </View>
        </View>

        {mainProduct ? (
          <Field label="SẢN PHẨM CHÍNH" styles={styles} topGap>
            <KoolaText weight="600" numberOfLines={2} style={styles.valueText}>{mainProduct}</KoolaText>
          </Field>
        ) : item.description ? (
          <Field label="GIỚI THIỆU" styles={styles} topGap>
            <KoolaText weight="500" numberOfLines={2} style={styles.valueText}>{item.description}</KoolaText>
          </Field>
        ) : null}

        {certs.length > 0 ? (
          <Field label="CHỨNG CHỈ" styles={styles} topGap>
            <View style={styles.certWrap}>
              {visibleCerts.map((c) => <CertBadge key={c.key} cert={c} s={s} />)}
              {restCerts > 0 ? (
                <View style={styles.pillMore}><KoolaText weight="700" style={styles.pillMoreText}>+{restCerts}</KoolaText></View>
              ) : null}
            </View>
          </Field>
        ) : null}

        {capacity ? (
          <Field label="NĂNG LỰC CUNG ỨNG" styles={styles} topGap>
            <KoolaText weight="600" numberOfLines={2} style={styles.valueText}>{capacity}</KoolaText>
          </Field>
        ) : null}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <View style={styles.footerStat}>
            <MaterialIcons name="visibility" size={13} color={s.text.muted} />
            <KoolaText weight="600" style={styles.footerMeta}>{formatCompact(views)}</KoolaText>
          </View>
          {feedback != null ? (
            <View style={styles.footerStat}>
              <MaterialIcons name="chat-bubble" size={12} color={s.text.muted} />
              <KoolaText weight="600" style={styles.footerMeta}>{formatCompact(feedback)}</KoolaText>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onMessagePress(); }}
          onPressIn={(e) => { e.stopPropagation(); setCtaPressed(true); }}
          onPressOut={() => setCtaPressed(false)}
          disabled={loading}
          android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
          accessibilityRole="button"
          accessibilityLabel={`Nhắn tin cho ${item.displayName}`}
          style={[styles.cta, { backgroundColor: ctaPressed ? ctaPressedBg : ctaBg }, ctaPressed && styles.ctaPressed, loading && styles.ctaDisabled]}>
          {messageLoading ? <ActivityIndicator size="small" color={s.text.onAction} /> : (
            <>
              <MaterialIcons name="chat-bubble-outline" size={15} color={s.text.onAction} />
              <KoolaText weight="700" style={styles.ctaText}>Nhắn tin ngay</KoolaText>
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
};

const makeStyles = (s: SemanticTokens, scheme: 'light' | 'dark') =>
  StyleSheet.create({
    card: {
      ...(scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm),
      backgroundColor: s.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: s.border.subtle,
      marginBottom: 8,
      overflow: 'hidden',
    },
    cardPressed: { opacity: 0.97, transform: [{ scale: 0.99 }] },
    accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: s.action.primary, opacity: scheme === 'dark' ? 0.9 : 1 },
    body: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
    // Header
    header: { flexDirection: 'row', alignItems: 'flex-start' },
    logoWrap: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: s.border.subtle, backgroundColor: s.surface.level2, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 1 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' },
    headerCol: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    name: { flexShrink: 1, color: s.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '700' as const },
    verified: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginLeft: 4, backgroundColor: s.status.success, flexShrink: 0 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 3 },
    metaLoc: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginLeft: 6 },
    metaText: { fontSize: 11.5, lineHeight: 15, color: s.text.muted, fontWeight: '500' as const, marginLeft: 3 },
    flagBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: s.border.subtle, borderRadius: koolaRadii.pill, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: s.surface.level2, flexShrink: 0, marginLeft: 8 },
    flagText: { fontSize: 9, lineHeight: 11, color: s.text.muted, fontWeight: '700' as const, marginLeft: 3 },
    // Field blocks — label above value, value wraps freely
    fieldSpaced: { marginTop: 10 },
    fieldLabel: { fontSize: 10, lineHeight: 13, color: s.text.muted, fontWeight: '700' as const, letterSpacing: 0.4 },
    fieldValueRow: { marginTop: 3 },
    valueText: { fontSize: 13, lineHeight: 18, color: s.text.primary, fontWeight: '600' as const },
    certWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: -2, marginRight: -5, marginBottom: -3 },
    // Each pill sits on its own wrapper margin so wrap gaps stay even (no row `gap`).
    pillMore: { borderWidth: StyleSheet.hairlineWidth, borderColor: s.border.subtle, backgroundColor: s.bg.canvas, borderRadius: koolaRadii.pill, paddingHorizontal: 8, height: 22, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' as const, marginRight: 5, marginBottom: 3 },
    pillMoreText: { fontSize: 10.5, color: s.text.muted, fontWeight: '700' as const },
    // Footer
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: s.surface.level2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: s.border.subtle },
    footerLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    footerStat: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
    footerMeta: { fontSize: 12, color: s.text.muted, fontWeight: '600' as const, marginLeft: 3, fontVariant: ['tabular-nums'] as never },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 36, paddingHorizontal: 14, borderRadius: koolaRadii.xs, flexShrink: 0, marginLeft: 10 },
    ctaPressed: { opacity: 0.92, transform: [{ scale: 0.97 }] },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { color: s.text.onAction, fontSize: 12.5, fontWeight: '700' as const, marginLeft: 5 },
  });

export default React.memo(BusinessCard);
