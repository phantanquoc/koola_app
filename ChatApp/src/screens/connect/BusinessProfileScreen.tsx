import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Linking, Modal, Pressable, ScrollView as RNScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LightFieldBackground } from '../main/components/personal/LightFieldBackground';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConnectTabStackParamList } from '../../navigation/types';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { accountDiscoveryApi, conversationsApi } from '../../services/api/apiService';
import { MOCK_BUSINESS_DETAIL, getMockDetailById, type MockBusinessDetail } from './mockBusinesses';
import { CATEGORY_LABELS, relationshipLabel } from './constants';
import {
  KoolaBadge,
  KoolaButton,
  KoolaSkeleton,
  KoolaState,
  KoolaSurface,
  KoolaText,
  koolaCardElevations,
  koolaGlowShadows,
  koolaRadii,
  koolaShadows,
  koolaSpacing,
  useKoolaToast,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import { koolaDurations, prefersReducedMotion } from '../../ui/tokens/motion';

type BusinessProfileRouteProp = RouteProp<ConnectTabStackParamList, 'BusinessProfile'>;
type BusinessProfileNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

type DetailAccount = BusinessAccountItem | MockBusinessDetail;
function isMockDetail(a: DetailAccount): a is MockBusinessDetail {
  return (
    Array.isArray((a as MockBusinessDetail).gallery) ||
    Array.isArray((a as MockBusinessDetail).services) ||
    Array.isArray((a as MockBusinessDetail).products)
  );
}

function countryFlag(label?: string): string {
  const v = (label ?? '').toLowerCase();
  if (v.includes('việt') || v.includes('viet')) return '🇻🇳';
  if (v.includes('mỹ') || v.includes('usa') || v.includes('us')) return '🇺🇸';
  if (v.includes('nhật') || v.includes('japan')) return '🇯🇵';
  if (v.includes('hàn') || v.includes('korea')) return '🇰🇷';
  return '🌐';
}

const UnifiedLightField: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  if (isDark) {
    return (
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="uniVertDark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0F1A2A" stopOpacity="1" />
            <Stop offset="0.5" stopColor="#1A2E4A" stopOpacity="1" />
            <Stop offset="1" stopColor="#162035" stopOpacity="1" />
          </SvgLinearGradient>
          <RadialGradient id="uniBloomDark1" cx="30%" cy="15%" r="55%">
            <Stop offset="0" stopColor="#1E3A5F" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#1E3A5F" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="uniBloomDark2" cx="80%" cy="35%" r="50%">
            <Stop offset="0" stopColor="#1A4D5E" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#1A4D5E" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="uniBloomDark3" cx="50%" cy="75%" r="45%">
            <Stop offset="0" stopColor="#1E3A5F" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#1E3A5F" stopOpacity="0" />
          </RadialGradient>
          <SvgLinearGradient id="uniStreakDark1" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.4" stopColor="#4A90A8" stopOpacity="0.06" />
            <Stop offset="0.6" stopColor="#4A90A8" stopOpacity="0.03" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id="uniStreakDark2" x1="100%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#2A7A9B" stopOpacity="0.04" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#uniVertDark)" />
        <Rect width="100%" height="100%" fill="url(#uniBloomDark1)" />
        <Rect width="100%" height="100%" fill="url(#uniBloomDark2)" />
        <Rect width="100%" height="100%" fill="url(#uniBloomDark3)" />
        <Rect width="100%" height="100%" fill="url(#uniStreakDark1)" />
        <Rect width="100%" height="100%" fill="url(#uniStreakDark2)" />
      </Svg>
    );
  }
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="uniVert" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E8F4FF" stopOpacity="1" />
          <Stop offset="0.45" stopColor="#F0F7FF" stopOpacity="1" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
        </SvgLinearGradient>
        <RadialGradient id="uniBloom1" cx="25%" cy="20%" r="55%">
          <Stop offset="0" stopColor="#D0E8FF" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#D0E8FF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="uniBloom2" cx="75%" cy="40%" r="50%">
          <Stop offset="0" stopColor="#E0F0FF" stopOpacity="0.4" />
          <Stop offset="1" stopColor="#E0F0FF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="uniBloom3" cx="50%" cy="80%" r="45%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <SvgLinearGradient id="uniStreak1" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.35" stopColor="#A8D0F0" stopOpacity="0.07" />
          <Stop offset="0.55" stopColor="#A8D0F0" stopOpacity="0.04" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgLinearGradient>
        <SvgLinearGradient id="uniStreak2" x1="100%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#B8E0FF" stopOpacity="0.05" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#uniVert)" />
      <Rect width="100%" height="100%" fill="url(#uniBloom1)" />
      <Rect width="100%" height="100%" fill="url(#uniBloom2)" />
      <Rect width="100%" height="100%" fill="url(#uniBloom3)" />
      <Rect width="100%" height="100%" fill="url(#uniStreak1)" />
      <Rect width="100%" height="100%" fill="url(#uniStreak2)" />
    </Svg>
  );
};

const BusinessProfileScreen: React.FC = () => {
  const route = useRoute<BusinessProfileRouteProp>();
  const navigation = useNavigation<BusinessProfileNavProp>();
  const { businessId } = route.params;
  const { palette, tokens, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();
  const headerH = getNotchHeaderHeight(insets.top, 'nav');
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const toast = useKoolaToast();
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const scrollY = React.useRef(new (require('react-native').Animated.Value)(0)).current as any;
  const bannerEnter = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (prefersReducedMotion()) { bannerEnter.setValue(1); return; }
    Animated.timing(bannerEnter, { toValue: 1, duration: 520, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [bannerEnter]);
  const bannerParallaxY = (scrollY as any).interpolate({ inputRange: [-80, 0, 140], outputRange: [-10, 0, 10], extrapolate: 'clamp' as const });
  const bannerParallaxScale = (scrollY as any).interpolate({ inputRange: [-80, 0, 200], outputRange: [1.06, 1, 1.02], extrapolate: 'clamp' as const });
  // Chrome-style: only fade between 48-96 like before
  const chromeOpacity = React.useMemo(
    () =>
      (scrollY as any).interpolate({
        inputRange: [0, 48, 96],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp' as const,
      }),
    [scrollY],
  );

  const [account, setAccount] = useState<DetailAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    // Instant mock path — no spinner wait
    const mockImmediate = getMockDetailById(businessId);
    if (mockImmediate) {
      try {
        const data = await accountDiscoveryApi.getById(businessId);
        setAccount({ ...mockImmediate, ...data } as MockBusinessDetail);
      } catch {
        setAccount(mockImmediate);
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      const data = await accountDiscoveryApi.getById(businessId);
      setAccount(data);
    } catch (err) {
      if (__DEV__) console.warn('Failed to load business account:', err);
      // DEV fallback: show rich mock instead of dead error screen
      if (__DEV__) {
        setAccount(MOCK_BUSINESS_DETAIL);
        setFetchError(null);
      } else {
        setFetchError('Không thể tải thông tin doanh nghiệp');
      }
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const handleMessage = useCallback(async () => {
    if (!account) return;
    setMessaging(true);
    try {
      const { conversation } = await conversationsApi.startDirectChat(account._id);
      (navigation as any).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId: conversation._id },
      });
    } catch (err) {
      if (__DEV__) console.warn('Start direct chat failed:', err);
      toast.show('Không thể bắt đầu trò chuyện. Bạn thử lại nhé.', 'danger');
    } finally {
      setMessaging(false);
    }
  }, [account, navigation, toast]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: headerH }]}>
        <KoolaSurface variant="raised" style={styles.loadingCard}>
          <KoolaSkeleton width={72} height={72} radius={16} style={styles.loadingCardItem} />
          <KoolaSkeleton width="62%" height={22} style={styles.loadingCardItem} />
          <KoolaSkeleton width="44%" height={14} style={styles.loadingCardItem} />
          <KoolaSkeleton width="100%" height={90} />
        </KoolaSurface>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={[styles.container, { paddingTop: headerH }]}>
        <KoolaState
          icon="cloud-off"
          title="Không thể tải doanh nghiệp"
          message={fetchError}
          actionLabel="Thử lại"
          onActionPress={fetchAccount}
          style={styles.centerState}
        />
      </View>
    );
  }

  if (!account) {
    return (
      <View style={[styles.container, { paddingTop: headerH }]}>
        <KoolaState
          icon="error-outline"
          title="Không tìm thấy doanh nghiệp"
          message="Hồ sơ này không tồn tại hoặc đã bị ẩn."
          style={styles.centerState}
        />
      </View>
    );
  }

  const detail: MockBusinessDetail | null = isMockDetail(account) ? account : null;
  const categoryLabel =
    (account.businessCategory ? CATEGORY_LABELS[account.businessCategory] : undefined) ||
    account.businessCategory ||
    '';

  return (
    <>
      {/* Inline header — unified statusBar+header tint + bloom, bottom shadow only (ChromeGlassSheet) */}
      <View style={[styles.inlineHeader, { height: headerH, paddingTop: insets.top }]}>
        {/* Background clip wrapper — prevents bloom from bleeding onto content below */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)', opacity: chromeOpacity }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { opacity: (chromeOpacity as any).interpolate({ inputRange: [0, 1], outputRange: [0, 0.72], extrapolate: 'clamp' } as any) }]}>
            <LightFieldBackground windowSized />
          </Animated.View>
        </View>
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: -18, height: 18, opacity: chromeOpacity }}>
          <Svg width="100%" height={18}>
            <Defs>
              <SvgLinearGradient id="bpHeaderShadow" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={isDark ? '0.48' : '0.18'} />
                <Stop offset="1" stopColor="#000000" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Rect width="100%" height={18} fill="url(#bpHeaderShadow)" />
          </Svg>
        </Animated.View>
        {/* Transparent icon/text layer — fades out */}
        <Animated.View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingTop: insets.top,
            opacity: (chromeOpacity as any).interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' } as any),
          }}>
          <View style={[styles.inlineBackBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
            <MaterialIcons name="arrow-back" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.searchDock}>
            <MaterialIcons name="search" size={18} color="rgba(255,255,255,0.7)" />
            <KoolaText variant="caption" style={{ marginLeft: 8, color: 'rgba(255,255,255,0.7)' }}>Tìm trong trang</KoolaText>
          </View>
          <View style={styles.inlineHeaderActions}>
            <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
              <MaterialIcons name="share" size={18} color="#FFFFFF" />
            </View>
            <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
              <MaterialIcons name="star-outline" size={20} color="#FFFFFF" />
            </View>
          </View>
        </Animated.View>
        {/* Solid icon/text layer — fades in */}
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingTop: insets.top,
            opacity: chromeOpacity,
          }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={[styles.inlineBackBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
            <MaterialIcons name="arrow-back" size={22} color={tokens.semantic.text.primary} />
          </Pressable>
          <Pressable onPress={() => toast.show('Sắp ra mắt', 'info')} hitSlop={8} style={[styles.searchDock, styles.searchDockSolid, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
            <MaterialIcons name="search" size={18} color={tokens.semantic.text.primary} />
            <KoolaText variant="caption" weight="600" style={{ marginLeft: 8, color: tokens.semantic.text.primary }}>Tìm trong trang</KoolaText>
          </Pressable>
          <View style={styles.inlineHeaderActions}>
            <Pressable onPress={() => toast.show('Đã sao chép liên kết', 'info')} hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
              <MaterialIcons name="share" size={18} color={tokens.semantic.text.primary} />
            </Pressable>
            <Pressable onPress={() => toast.show('Sắp ra mắt', 'info')} hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
              <MaterialIcons name="star-outline" size={20} color={tokens.semantic.text.primary} />
            </Pressable>
          </View>
        </Animated.View>
      </View>
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}>
        <View style={[styles.unifiedField, { marginTop: -headerH - 40, paddingTop: headerH + 64, paddingBottom: 10, minHeight: 222 + headerH }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <UnifiedLightField isDark={isDark} />
          </View>
          <View style={styles.heroContent}>
            <View style={styles.heroSplit}>
              <View style={styles.heroLeft}>
                {account.verificationStatus === 'verified' ? (
                  <View style={[styles.verifiedBadgeRow, { marginTop: 0, marginBottom: 4 }]}>
                    <MaterialIcons name="verified" size={10} color={palette.success} />
                    <KoolaText weight="700" style={{ marginLeft: 3, color: palette.success, fontSize: 10, lineHeight: 13 }}>
                      Doanh nghiệp đã xác thực
                    </KoolaText>
                  </View>
                ) : null}
                <View style={styles.heroNameRow}>
                  <KoolaText numberOfLines={2} ellipsizeMode="tail" style={styles.companyName}>{account.displayName}</KoolaText>
                </View>
                {(account as any).address || (detail as any)?.address ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <MaterialIcons name="location-on" size={10} color={palette.muted} style={{ marginRight: 3 }} />
                    <KoolaText variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1, fontSize: 10, lineHeight: 13 }}>
                      {(account as any).address ?? (detail as any)?.address}
                    </KoolaText>
                  </View>
                ) : null}
              </View>
              <View style={[styles.heroRight, account.verificationStatus === 'verified' ? { marginTop: 17 } : null]}>
                {(detail?.countryLabel || account.province) ? (
                  <View style={[styles.heroAddressRow, { justifyContent: 'flex-end' }]}>
                    <KoolaText style={{ fontSize: 13, marginRight: 4 }}>{countryFlag(detail?.countryLabel ?? account.province)}</KoolaText>
                    <KoolaText variant="caption" weight="700" tone="muted" numberOfLines={1}>
                      {(() => {
                        const provRaw = account.province ?? '';
                        const cRaw = detail?.countryLabel ?? '';
                        const prov = provRaw === 'TP. Hồ Chí Minh' || provRaw === 'Thành phố Hồ Chí Minh' ? 'TP.HCM' : provRaw.replace('Thành phố ', 'TP. ').replace('Tỉnh ', '');
                        const country = cRaw ? (/việt\s*nam/i.test(cRaw) ? 'VN' : cRaw.length > 4 ? cRaw.slice(0, 2).toUpperCase() : cRaw.toUpperCase()) : '';
                        return [prov, country].filter(Boolean).join(' · ');
                      })()}
                    </KoolaText>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, justifyContent: 'flex-end' }}>
                  {typeof detail?.rating === 'number' ? (
                    <View style={[styles.metaItem, { marginRight: 12 }]}>
                      <MaterialIcons name="star" size={14} color="#F59E0B" />
                      <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>{detail.rating.toFixed(1)}</KoolaText>
                    </View>
                  ) : null}
                  {detail?.viewCount ? (
                    <View style={styles.metaItem}>
                      <MaterialIcons name="visibility" size={14} color={palette.muted} />
                      <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>{detail.viewCount.toLocaleString('vi-VN')}</KoolaText>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </View>

        <Animated.View style={[styles.bannerWrap, { opacity: bannerEnter, transform: [{ translateY: Animated.add(bannerEnter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }), bannerParallaxY as any) as any }, { scale: Animated.multiply(bannerEnter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }), bannerParallaxScale as any) as any }] }]}>
          <Animated.Image source={(detail as any)?.bannerImage ?? require('../../assets/mock-shopping/vegetables.jpg')} style={styles.bannerImage} resizeMode="cover" />
          {/* soft inner shadow + top-edge sheen overlay */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, borderRadius: koolaRadii.lg, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)' }} />
          </View>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: koolaRadii.lg, overflow: 'hidden' }]}>
            {/* top sheen */}
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />
            {/* bottom inner shadow */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 22, backgroundColor: 'rgba(0,0,0,0.06)' }} />
          </View>
        </Animated.View>

        {/* Single-page sequential content (no tabs) */}
        {detail?.aboutLong ? (
          <InfoSection title="Năng lực cạnh tranh & Cam kết" palette={palette} styles={styles}>
            <KoolaText variant="body" tone="muted" style={{ lineHeight: 21 }}>
              {detail.aboutLong}
            </KoolaText>
            {detail.highlights?.length ? (
              <View style={{ marginTop: 12 }}>
                {detail.highlights.map((h) => (
                  <View key={h} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: palette.primary }]} />
                    <KoolaText variant="body" tone="muted" style={{ flex: 1 }}>
                      {h}
                    </KoolaText>
                  </View>
                ))}
              </View>
            ) : null}
          </InfoSection>
        ) : account.tagline ? (
          <InfoSection title="Năng lực cạnh tranh & Cam kết" palette={palette} styles={styles}>
            <KoolaText variant="body" tone="muted">
              {account.tagline}
            </KoolaText>
          </InfoSection>
        ) : null}


        {detail?.products?.length ? (
          <View style={{ marginBottom: 12 }}>
            <KoolaSurface variant="flat" style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionIconWell}>
                  <MaterialIcons name="inventory-2" size={14} color={palette.primary} />
                </View>
                <KoolaText variant="label" weight="800" style={styles.sectionTitleNew}>SẢN PHẨM</KoolaText>
              </View>
              <View style={styles.sectionDivider} />
              <View style={styles.productGrid}>
                {(showAllProducts ? detail.products : detail.products.slice(0, 4)).map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedProductId(p.id)}
                    style={styles.productCell}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}, ${p.price}`}>
                    <View style={[styles.productCard, { backgroundColor: palette.surface, borderColor: palette.line }]}>
                      <View style={[styles.productThumb, { backgroundColor: `${p.accent}14` }]}>
                        <Image source={p.image} style={styles.productImage} resizeMode="cover" />
                      </View>
                      <View style={styles.productBody}>
                        <KoolaText variant="label" weight="700" numberOfLines={2} style={styles.productTitle}>
                          {p.name}
                        </KoolaText>
                        <KoolaText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                          {p.category}
                        </KoolaText>
                        <KoolaText variant="label" weight="800" style={{ marginTop: 4 }}>
                          {p.price}
                        </KoolaText>
                        {p.originalPrice ? (
                          <KoolaText variant="caption" tone="muted" style={{ textDecorationLine: 'line-through', fontSize: 11 }}>
                            {p.originalPrice}
                          </KoolaText>
                        ) : null}
                        <View style={styles.productMeta}>
                          <MaterialIcons name="star" size={12} color="#F59E0B" />
                          <KoolaText variant="caption" weight="700" style={{ marginLeft: 3, fontSize: 11 }}>
                            {p.rating.toFixed(1)}
                          </KoolaText>
                          <KoolaText variant="caption" tone="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                            Đã bán {p.soldCount.toLocaleString('vi-VN')}
                          </KoolaText>
                        </View>
                        {p.badge ? (
                          <View style={[styles.productBadge, { backgroundColor: palette.danger }]}>
                            <KoolaText variant="caption" weight="800" style={{ color: '#FFF', fontSize: 10 }}>
                              {p.badge}
                            </KoolaText>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
              {detail.products.length > 4 ? (
                <Pressable onPress={() => { if (showAllProducts) setShowAllProducts(false); else (navigation as any).navigate('ShoppingTab', { screen: 'ShoppingHome' }); }} style={[styles.viewMoreBtn, { borderColor: palette.line }]}>
                  <KoolaText variant="label" weight="700" style={{ color: palette.primary }}>{showAllProducts ? 'Thu gọn' : `Xem chi tiết — ${detail.products.length} sản phẩm`}</KoolaText>
                  <MaterialIcons name={showAllProducts ? 'expand-less' : 'chevron-right'} size={18} color={palette.primary} />
                </Pressable>
              ) : null}
            </KoolaSurface>
          </View>
        ) : null}


        {detail?.certifications?.length ? (
          <InfoSection title="Chứng nhận" palette={palette} styles={styles}>
            <View style={styles.certRow}>
              {detail.certifications.map((c) => (
                <View key={c.key} style={styles.certPill}>
                  <KoolaText variant="caption" weight="800" style={{ textAlign: 'center' }}>
                    {c.label}
                  </KoolaText>
                  {c.sublabel ? (
                    <KoolaText variant="caption" tone="muted" style={{ fontSize: 10, textAlign: 'center' }}>
                      {c.sublabel}
                    </KoolaText>
                  ) : null}
                </View>
              ))}
            </View>
          </InfoSection>
        ) : null}

        {/* Địa chỉ / Liên hệ đã xóa theo yêu cầu */}

        {/* Đánh giá gần nhất */}
        <InfoSection title="Đánh giá" palette={palette} styles={styles}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="star" size={18} color="#F59E0B" />
              <KoolaText variant="heading" weight="800" style={{ marginLeft: 4 }}>{detail?.rating?.toFixed(1) ?? '5.0'}</KoolaText>
            </View>
            <KoolaText variant="caption" tone="muted" style={{ marginLeft: 8 }}>· {detail?.positiveFeedbackCount ?? 185} đánh giá</KoolaText>
          </View>
          {[
            { name: 'Minh T.', avatar: 'M', rating: 5, time: '2 ngày trước', text: 'Cà phê thơm, đóng gói cẩn thận. Giao hàng nhanh, sẽ ủng hộ tiếp!' },
            { name: 'Lan Anh', avatar: 'L', rating: 5, time: '1 tuần trước', text: 'Tiêu đen chất lượng, hạt đều và thơm nồng. Đóng hũ thủy tinh rất đẹp.' },
            { name: 'Hoàng N.', avatar: 'H', rating: 4, time: '2 tuần trước', text: 'Blend đậm đà đúng gu, pha phin rất ngon. Trừ 1 sao vì ship hơi lâu.' },
          ].map((r) => (
            <View key={r.name} style={styles.reviewRow}>
              <View style={[styles.reviewAvatar, { backgroundColor: palette.canvas, borderColor: palette.line }]}>
                <KoolaText variant="label" weight="800" style={{ color: palette.primary }}>{r.avatar}</KoolaText>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <KoolaText variant="label" weight="700">{r.name}</KoolaText>
                  <KoolaText variant="caption" tone="muted" style={{ fontSize: 11 }}>{r.time}</KoolaText>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 2 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <MaterialIcons key={i} name="star" size={12} color={i < r.rating ? '#F59E0B' : palette.line} />
                  ))}
                </View>
                <KoolaText variant="caption" tone="muted" style={{ marginTop: 4, lineHeight: 17 }}>{r.text}</KoolaText>
              </View>
            </View>
          ))}
          <Pressable onPress={() => toast.show('Sắp ra mắt — xem tất cả đánh giá', 'info')} style={[styles.viewMoreBtn, { borderColor: palette.line }]}>
            <KoolaText variant="label" weight="700" style={{ color: palette.primary }}>Xem tất cả đánh giá</KoolaText>
            <MaterialIcons name="chevron-right" size={18} color={palette.primary} />
          </Pressable>
        </InfoSection>

        <KoolaText variant="caption" tone="muted" style={styles.footnote}>
          Hồ sơ minh hoạ — dữ liệu demo cho mục đích trình bày giao diện.
        </KoolaText>
      </Animated.ScrollView>

      {/* Nút Nhắn tin nổi — luôn thấy dù scroll */}
      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: 16 + insets.bottom }]}>
        <Pressable
          onPress={handleMessage}
          disabled={messaging}
          style={({ pressed }) => [styles.fabBtn, { backgroundColor: '#FFFFFF', opacity: pressed || messaging ? 0.9 : 1, borderWidth: 1, borderColor: '#0A7AFF', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center' }]}>
          <View style={[styles.fabIconWrap, { backgroundColor: 'rgba(10,122,255,0.12)' }]}>
            <MaterialIcons name="chat-bubble" size={18} color="#0A7AFF" />
          </View>
          <KoolaText variant="label" weight="800" style={{ color: '#0A7AFF', marginLeft: 8, marginRight: 6, fontSize: 14, flexShrink: 0 }}>{messaging ? 'Đang mở...' : 'Nhắn tin ngay'}</KoolaText>
          <MaterialIcons name="arrow-forward" size={16} color="#0A7AFF" style={{ flexShrink: 0 }} />
        </Pressable>
      </View>

      {/* Product detail popup */}
      {(() => {
        const selected = detail?.products?.find((p) => p.id === selectedProductId) ?? null;
        if (!selected) return null;
        return (
          <Modal visible={!!selectedProductId} transparent animationType="fade" onRequestClose={() => setSelectedProductId(null)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSelectedProductId(null)}>
              <Pressable style={[styles.modalCard, { backgroundColor: palette.surface }]} onPress={(e) => e.stopPropagation()}>
                <Image source={selected.image} style={styles.modalImage} resizeMode="cover" />
                {selected.badge ? (
                  <View style={[styles.modalBadge, { backgroundColor: palette.danger }]}>
                    <KoolaText variant="caption" weight="800" style={{ color: '#FFF', fontSize: 11 }}>{selected.badge}</KoolaText>
                  </View>
                ) : null}
                <Pressable onPress={() => setSelectedProductId(null)} style={styles.modalClose} hitSlop={10}>
                  <MaterialIcons name="close" size={20} color={palette.ink} />
                </Pressable>
                <View style={{ padding: 16 }}>
                  <KoolaText variant="heading" weight="800">{selected.name}</KoolaText>
                  <KoolaText variant="caption" tone="muted" style={{ marginTop: 4 }}>{selected.category}</KoolaText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
                    <KoolaText variant="heading" weight="800" style={{ color: palette.primary }}>{selected.price}</KoolaText>
                    {selected.originalPrice ? (
                      <KoolaText variant="caption" tone="muted" style={{ textDecorationLine: 'line-through' }}>{selected.originalPrice}</KoolaText>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <MaterialIcons name="star" size={14} color="#F59E0B" />
                    <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>{selected.rating.toFixed(1)}</KoolaText>
                    <KoolaText variant="caption" tone="muted" style={{ marginLeft: 8 }}>Đã bán {selected.soldCount.toLocaleString('vi-VN')}</KoolaText>
                  </View>
                  <KoolaText variant="body" tone="muted" style={{ marginTop: 12, lineHeight: 20 }}>{selected.description}</KoolaText>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <KoolaButton title="Đóng" variant="secondary" onPress={() => setSelectedProductId(null)} style={{ flex: 1 }} />
                    <KoolaButton title="Nhắn tin" variant="primary" icon="chat-bubble-outline" onPress={() => { setSelectedProductId(null); handleMessage(); }} style={{ flex: 1 }} />
                  </View>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}
    </>
  );
};

interface ContactRowProps {
  icon: string;
  label: string;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
  onPress?: () => void;
}
const ContactRow: React.FC<ContactRowProps> = ({ icon, label, palette, styles, onPress }) => (
  <Pressable
    style={styles.contactRow}
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}>
    <MaterialIcons name={icon as never} size={18} color={palette.primary} />
    <KoolaText tone={onPress ? 'primary' : 'muted'} style={styles.contactText}>
      {label}
    </KoolaText>
  </Pressable>
);

interface InfoSectionProps {
  title: string;
  children: React.ReactNode;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
  icon?: string;
}
const SECTION_ICON: Record<string, string> = {
  'NĂNG LỰC CẠNH TRANH & CAM KẾT': 'verified',
  'CHỨNG NHẬN': 'workspace-premium',
  'ĐÁNH GIÁ': 'star',
  'SẢN PHẨM': 'inventory-2',
};
const InfoSection: React.FC<InfoSectionProps> = ({ title, children, palette, styles, icon }) => {
  const upper = title.toUpperCase();
  const iconName = icon ?? SECTION_ICON[upper] ?? 'info';
  return (
    <KoolaSurface variant="flat" style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionIconWell}>
          <MaterialIcons name={iconName as any} size={14} color={palette.primary} />
        </View>
        <KoolaText variant="label" weight="800" style={styles.sectionTitleNew}>
          {upper}
        </KoolaText>
      </View>
      <View style={styles.sectionDivider} />
      {children}
    </KoolaSurface>
  );
};

const Stat: React.FC<{
  label: string;
  value: string;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
  isPrimary?: boolean;
}> = ({ label, value, styles, isPrimary = false }) => (
  <View style={styles.statItem}>
    <KoolaText
      variant={isPrimary ? 'title' : 'heading'}
      weight={isPrimary ? '800' : '700'}
      style={{ textAlign: 'center' }}>
      {value}
    </KoolaText>
    <KoolaText
      variant="caption"
      tone="muted"
      weight="500"
      style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
      {label}
    </KoolaText>
  </View>
);

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    inlineHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 5,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    inlineBackBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    inlineHeaderTitle: {
      flex: 1,
      marginLeft: 30,
      color: '#FFFFFF',
      fontSize: 14,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    inlineHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 8 },
    inlineIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    searchDock: { flex: 1, height: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginLeft: 12, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.38)' },
    searchDockSolid: {},
    container: { flex: 1, backgroundColor: p.canvas },
    content: { paddingHorizontal: 16, paddingBottom: 80, paddingTop: 0 },
    centerState: { flex: 1 },
    loadingCard: { margin: 16, padding: 18 },
    loadingCardItem: { marginBottom: 14 },
    unifiedField: { marginHorizontal: -16, overflow: 'hidden', borderRadius: 0, marginBottom: 12, justifyContent: 'flex-end' },
    bannerWrap: { height: 180, marginHorizontal: -5, borderRadius: koolaRadii.lg, overflow: 'hidden', backgroundColor: p.line, marginBottom: 12, ...koolaShadows.md, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    bannerImage: { width: '100%', height: '100%', transform: [{ scale: 1 }] },
    heroContent: { paddingHorizontal: 16 },
    heroSplit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    heroLeft: { flex: 2 },
    heroRight: { flex: 1, alignItems: 'flex-end', gap: 4, paddingLeft: 8 },
    verifiedBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    heroNameRow: { flexDirection: 'row', alignItems: 'center' },
    heroAddressRow: { flexDirection: 'row', alignItems: 'center' },
    companyName: { flex: 1, fontSize: 12.5, fontWeight: '800', lineHeight: 16, color: p.ink },
    metaItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    section: { marginBottom: 12, borderRadius: koolaRadii.lg, padding: koolaSpacing.lg, ...koolaShadows.sm, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2, overflow: 'hidden' },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionIconWell: { width: 28, height: 28, borderRadius: koolaRadii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primary + '14', borderWidth: StyleSheet.hairlineWidth, borderColor: p.line },
    sectionTitleNew: { flex: 1, color: p.ink, letterSpacing: 0.4 },
    sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: p.line, marginTop: 10, marginBottom: 12 },
    sectionTitle: { marginBottom: 9 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
    bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: 8 },
    galleryContent: { gap: 10, paddingRight: 4 },
    galleryItem: { width: 132 },
    galleryImage: { width: 132, height: 88, borderRadius: koolaRadii.md, backgroundColor: p.line },
    galleryCaption: { marginTop: 6 },
    certRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    certPill: {
      minWidth: 72,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: koolaRadii.md,
      borderWidth: 1,
      borderColor: p.line,
      alignItems: 'center',
      backgroundColor: p.surface,
    },
    serviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    serviceIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
    contactText: { flex: 1, marginLeft: 9 },
    actions: { flexDirection: 'row', gap: 12, marginTop: 6 },
    footnote: { textAlign: 'center', marginTop: 14, opacity: 0.7 },
    fabWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', zIndex: 6, paddingHorizontal: 16 },
    fabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 24, borderRadius: 999 },
    fabIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    productGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    productCell: { width: '48.5%' },
    productCard: {
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      ...koolaShadows.sm,
    },
    productThumb: { width: '100%', aspectRatio: 1.15, overflow: 'hidden' },
    productImage: { width: '100%', height: '100%' },
    productBody: { padding: 10 },
    productTitle: { fontSize: 12, lineHeight: 16, minHeight: 32 },
    productMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    productBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: koolaRadii.pill,
    },
    reviewRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.line },
    reviewAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    viewMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 10, borderRadius: koolaRadii.md, borderWidth: 1, gap: 6 },
    statItem: { flex: 1, alignItems: 'center' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
    modalCard: {
      borderRadius: koolaRadii.lg,
      overflow: 'hidden',
      maxHeight: '85%',
      ...koolaShadows.md,
    },
    modalImage: { width: '100%', aspectRatio: 1.4, backgroundColor: '#F3F4F6' },
    modalBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: koolaRadii.pill,
    },
    modalClose: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default BusinessProfileScreen;
