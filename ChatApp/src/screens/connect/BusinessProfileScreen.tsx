import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Linking, Modal, Pressable, ScrollView as RNScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
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
import UserAvatar from '../../components/UserAvatar';
import { CATEGORY_LABELS, relationshipLabel } from './constants';
import {
  KoolaBadge,
  KoolaButton,
  KoolaSkeleton,
  KoolaState,
  KoolaSurface,
  KoolaText,
  koolaRadii,
  koolaShadows,
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
  const [activeTab, setActiveTab] = useState<BusinessTabId>('about');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const scrollY = React.useRef(new (require('react-native').Animated.Value)(0)).current as any;
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

  // Animation state for hero section
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const statsOpacity = useRef(new Animated.Value(0)).current;

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

  // Trigger entrance animation when account loads
  useEffect(() => {
    if (!account || prefersReducedMotion()) {
      // Skip animation if data not ready or reduce motion enabled
      sloganOpacity.setValue(1);
      statsOpacity.setValue(1);
      return;
    }

    // Staggered fade-in: slogan first, then stats
    Animated.sequence([
      Animated.timing(sloganOpacity, {
        toValue: 1,
        duration: koolaDurations.normal, // 180ms
        easing: Easing.bezier(0.0, 0.0, 0.2, 1.0), // decelerate
        useNativeDriver: true,
      }),
      Animated.timing(statsOpacity, {
        toValue: 1,
        duration: koolaDurations.normal,
        delay: 60, // Stagger by 60ms
        easing: Easing.bezier(0.0, 0.0, 0.2, 1.0),
        useNativeDriver: true,
      }),
    ]).start();
  }, [account, sloganOpacity, statsOpacity]);

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
  const imageKey = account.avatar || account.logoKey;
  const headerTitle = (detail?.shortName ?? (account as MockBusinessDetail | null)?.shortName ?? '') as string;

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
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(37,99,235,0.14)',
            opacity: (chromeOpacity as any).interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' } as any),
          }}
        />
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
          {!!headerTitle ? (
            <KoolaText weight="800" numberOfLines={1} style={[styles.inlineHeaderTitle, { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }]}>
              {headerTitle}
            </KoolaText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={styles.inlineHeaderActions}>
            <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
              <MaterialIcons name="search" size={20} color="#FFFFFF" />
            </View>
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
          {!!headerTitle ? (
            <KoolaText weight="800" numberOfLines={1} style={[styles.inlineHeaderTitle, { color: tokens.semantic.text.primary, textShadowColor: 'transparent' }]}>
              {headerTitle}
            </KoolaText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={styles.inlineHeaderActions}>
            <Pressable onPress={() => toast.show('Sắp ra mắt', 'info')} hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
              <MaterialIcons name="search" size={20} color={tokens.semantic.text.primary} />
            </Pressable>
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
        {/* Cover — full-bleed behind transparent header + status bar (overlay) */}
        {detail?.coverImage ? (
          <View style={[styles.coverWrap, { marginTop: -headerH - 40, height: 230 + headerH, paddingTop: headerH, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
            <Image source={detail.coverImage} style={styles.coverImage} resizeMode="cover" />
            <View style={styles.coverScrim} />
          </View>
        ) : (
          <View style={[styles.coverWrap, styles.coverPlaceholder, { marginTop: -headerH, height: 72 + headerH, paddingTop: headerH }]} />
        )}

      {/* Hero — avatar gối 1/3 trên banner, 2/3 dưới */}
      <KoolaSurface variant="raised" style={[styles.hero, styles.heroFullBleed, detail?.coverImage ? styles.heroOverCover : null, { marginTop: -40 }]}>
        <View style={styles.heroHeader}>
          <View style={styles.avatarOverlapWrap}>
            <UserAvatar displayName={account.displayName} avatar={imageKey} size={65} />
          </View>
          <View style={styles.heroNameWrap}>
            <KoolaText numberOfLines={2} style={styles.companyName}>
              {account.displayName}
            </KoolaText>
            {account.verificationStatus === 'verified' ? (
              <MaterialIcons name="verified" size={14} color={palette.success} style={{ marginLeft: 5, marginTop: 1 }} />
            ) : null}
          </View>
        </View>
        <View style={styles.badgeRow}>
          {categoryLabel ? (
            <View style={styles.badgeItem}>
              <KoolaBadge label={categoryLabel} tone="primary" />
            </View>
          ) : null}
          {account.province ? (
            <View style={styles.badgeItem}>
              <KoolaBadge label={account.province} tone="muted" />
            </View>
          ) : null}
          {detail?.foundedYear ? (
            <View style={styles.badgeItem}>
              <KoolaBadge label={`Từ ${detail.foundedYear}`} tone="muted" />
            </View>
          ) : null}
        </View>
        {detail ? (
          <View style={styles.metaRow}>
            {detail.countryLabel ? (
              <View style={styles.metaItem}>
                <KoolaText style={{ fontSize: 13, marginRight: 3 }}>{countryFlag(detail.countryLabel)}</KoolaText>
                <KoolaText variant="caption" weight="700" tone="muted">
                  {detail.countryLabel}
                </KoolaText>
              </View>
            ) : null}
            {typeof detail.rating === 'number' ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="star" size={14} color="#F59E0B" />
                <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>
                  {detail.rating.toFixed(1)}
                </KoolaText>
              </View>
            ) : null}
            {detail.viewCount ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="visibility" size={14} color={palette.muted} />
                <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>
                  {detail.viewCount.toLocaleString('vi-VN')} lượt xem
                </KoolaText>
              </View>
            ) : null}
            {detail.yearsActive ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="history" size={14} color={palette.muted} />
                <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>
                  {detail.yearsActive} năm
                </KoolaText>
              </View>
            ) : null}
          </View>
        ) : null}
      </KoolaSurface>

      {/* Slogan pill — thay cho dòng "Yêu cầu mua · ..." */}
      {detail?.mainProduct ? (
        <Animated.View style={{ opacity: sloganOpacity }}>
          <KoolaSurface variant="soft" style={styles.typeRow}>
            <MaterialIcons name="format-quote" size={17} color={palette.muted} />
            <KoolaText
              variant="label"
              tone="muted"
              weight="500"
              style={[
                styles.typeRowLabel,
                {
                  fontStyle: 'italic',
                  flex: 1,
                  letterSpacing: 0.3,
                  textTransform: 'capitalize',
                },
              ]}
              numberOfLines={2}>
              {detail.mainProduct.toLowerCase()}
            </KoolaText>
          </KoolaSurface>
        </Animated.View>
      ) : account.relationshipType ? (
        <KoolaSurface variant="soft" style={styles.typeRow}>
          <MaterialIcons
            name={account.relationshipType === 'partner' ? 'handshake' : 'local-shipping'}
            size={17}
            color={palette.muted}
          />
          <KoolaText variant="caption" tone="muted" weight="800" style={styles.typeRowLabel}>
            {relationshipLabel(account.relationshipType)}
          </KoolaText>
        </KoolaSurface>
      ) : null}

      {/* Stats */}
      {detail ? (
        <Animated.View style={{ opacity: statsOpacity }}>
          <View
            style={styles.statsRow}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`Công ty thành lập năm ${detail.foundedYear ?? 'không rõ'}, có ${detail.employeeCount ?? 'không rõ'} nhân sự, xuất khẩu ${detail.exportMarkets?.length ?? 0} quốc gia`}>
            <Stat label="Thành lập" value={String(detail.foundedYear ?? '—')} palette={palette} styles={styles} isPrimary />
            <View style={styles.statsDivider} />
            <Stat label="Nhân sự" value={detail.employeeCount ?? '—'} palette={palette} styles={styles} />
            <View style={styles.statsDivider} />
            <Stat label="Thị trường" value={`${detail.exportMarkets?.length ?? 0} QG`} palette={palette} styles={styles} />
          </View>
        </Animated.View>
      ) : null}

      {/* Tabs */}
      <BusinessTabs
        active={activeTab}
        onChange={setActiveTab}
        palette={palette}
        styles={styles}
        hasAbout={!!detail?.aboutLong || !!account.tagline}
        hasProducts={!!(detail?.products?.length ?? detail?.services?.length)}
        hasCerts={!!detail?.certifications?.length}
        hasContact={!!(account.website || account.contactEmail || account.contactPhone || account.address)}
      />

      {/* Tab: Giới thiệu — full thông tin */}
      {activeTab === 'about' ? (
        <>
          {detail?.aboutLong ? (
            <InfoSection title="Giới thiệu" palette={palette} styles={styles}>
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
            <InfoSection title="Giới thiệu" palette={palette} styles={styles}>
              <KoolaText variant="body" tone="muted">
                {account.tagline}
              </KoolaText>
            </InfoSection>
          ) : null}

          {detail?.gallery?.length ? (
            <InfoSection title="Hình ảnh" palette={palette} styles={styles}>
              <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContent}>
                {detail.gallery.map((g, idx) => (
                  <View key={idx} style={styles.galleryItem}>
                    <Image source={g.source} style={styles.galleryImage} resizeMode="cover" />
                    {g.caption ? (
                      <KoolaText variant="caption" tone="muted" weight="600" style={styles.galleryCaption} numberOfLines={1}>
                        {g.caption}
                      </KoolaText>
                    ) : null}
                  </View>
                ))}
              </RNScrollView>
            </InfoSection>
          ) : null}

          {detail?.services?.length ? (
            <InfoSection title="Sản phẩm" palette={palette} styles={styles}>
              {detail.services.map((s) => (
                <View key={s.name} style={styles.serviceRow}>
                  <View style={[styles.serviceIcon, { backgroundColor: palette.canvas, borderColor: palette.line }]}>
                    <MaterialIcons name={s.icon as never} size={18} color={palette.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <KoolaText variant="label" weight="700">
                      {s.name}
                    </KoolaText>
                    <KoolaText variant="caption" tone="muted">
                      {s.description}
                    </KoolaText>
                  </View>
                </View>
              ))}
            </InfoSection>
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

          {account.website || account.contactEmail || account.contactPhone ? (
            <InfoSection title="Liên hệ" palette={palette} styles={styles}>
              {account.website ? (
                <ContactRow
                  icon="language"
                  label={account.website}
                  palette={palette}
                  styles={styles}
                  onPress={() => Linking.openURL(account.website!)}
                />
              ) : null}
              {account.contactEmail ? (
                <ContactRow
                  icon="email"
                  label={account.contactEmail}
                  palette={palette}
                  styles={styles}
                  onPress={() => Linking.openURL(`mailto:${account.contactEmail}`)}
                />
              ) : null}
              {account.contactPhone ? (
                <ContactRow
                  icon="phone"
                  label={account.contactPhone}
                  palette={palette}
                  styles={styles}
                  onPress={() => Linking.openURL(`tel:${account.contactPhone}`)}
                />
              ) : null}
            </InfoSection>
          ) : null}

          {account.address ? (
            <InfoSection title="Địa chỉ" palette={palette} styles={styles}>
              <ContactRow icon="place" label={account.address} palette={palette} styles={styles} />
            </InfoSection>
          ) : null}
        </>
      ) : null}

      {/* Tab: Sản phẩm */}
      {activeTab === 'products' ? (
        detail?.products?.length ? (
          <View style={{ marginBottom: 12 }}>
            <KoolaSurface variant="flat" style={styles.section}>
              <KoolaText variant="caption" tone="primary" weight="800" style={styles.sectionTitle}>
                {'SẢN PHẨM'}
              </KoolaText>
              <View style={styles.productGrid}>
                {detail.products.map((p) => (
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
            </KoolaSurface>
          </View>
        ) : (
          <KoolaSurface variant="flat" style={[styles.section, { padding: 16, alignItems: 'center' }]}>
            <KoolaText tone="muted">Chưa có sản phẩm.</KoolaText>
          </KoolaSurface>
        )
      ) : null}

      {/* Tab: Chứng nhận */}
      {activeTab === 'certs' ? (
        detail?.certifications?.length ? (
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
        ) : (
          <KoolaSurface variant="flat" style={[styles.section, { padding: 16, alignItems: 'center' }]}>
            <KoolaText tone="muted">Chưa có chứng nhận.</KoolaText>
          </KoolaSurface>
        )
      ) : null}

      {/* Tab: Liên hệ */}
      {activeTab === 'contact' ? (
        <>
          {account.website || account.contactEmail || account.contactPhone ? (
            <InfoSection title="Liên hệ" palette={palette} styles={styles}>
              {account.website ? (
                <ContactRow
                  icon="language"
                  label={account.website}
                  palette={palette}
                  styles={styles}
                  onPress={() => Linking.openURL(account.website!)}
                />
              ) : null}
              {account.contactEmail ? (
                <ContactRow
                  icon="email"
                  label={account.contactEmail}
                  palette={palette}
                  styles={styles}
                  onPress={() => Linking.openURL(`mailto:${account.contactEmail}`)}
                />
              ) : null}
              {account.contactPhone ? (
                <ContactRow
                  icon="phone"
                  label={account.contactPhone}
                  palette={palette}
                  styles={styles}
                  onPress={() => Linking.openURL(`tel:${account.contactPhone}`)}
                />
              ) : null}
            </InfoSection>
          ) : null}

          {account.address ? (
            <InfoSection title="Địa chỉ" palette={palette} styles={styles}>
              <ContactRow icon="place" label={account.address} palette={palette} styles={styles} />
            </InfoSection>
          ) : null}
          {!account.website && !account.contactEmail && !account.contactPhone && !account.address ? (
            <KoolaSurface variant="flat" style={[styles.section, { padding: 16, alignItems: 'center' }]}>
              <KoolaText tone="muted">Chưa có thông tin liên hệ.</KoolaText>
            </KoolaSurface>
          ) : null}
        </>
      ) : null}

      <View style={styles.actions}>
        <KoolaButton
          title="Nhắn tin"
          icon="chat-bubble-outline"
          variant="primary"
          loading={messaging}
          disabled={messaging}
          onPress={handleMessage}
          style={{ flex: 1 }}
        />
        <KoolaButton
          title="Chia sẻ"
          icon="share"
          variant="secondary"
          onPress={() => toast.show('Đã sao chép liên kết hồ sơ', 'info')}
          style={{ flex: 1 }}
        />
      </View>
      <KoolaText variant="caption" tone="muted" style={styles.footnote}>
        Hồ sơ minh hoạ — dữ liệu demo cho mục đích trình bày giao diện.
      </KoolaText>
      </Animated.ScrollView>

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

type BusinessTabId = 'about' | 'products' | 'certs' | 'contact';

const TAB_LABELS: Record<BusinessTabId, string> = {
  about: 'Giới thiệu',
  products: 'Sản phẩm',
  certs: 'Chứng nhận',
  contact: 'Liên hệ',
};

const BusinessTabs: React.FC<{
  active: BusinessTabId;
  onChange: (id: BusinessTabId) => void;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
  hasAbout: boolean;
  hasProducts: boolean;
  hasCerts: boolean;
  hasContact: boolean;
}> = ({ active, onChange, palette, styles }) => (
  <View style={styles.tabsRow}>
    {(Object.keys(TAB_LABELS) as BusinessTabId[]).map((id) => {
      const isActive = active === id;
      return (
        <Pressable
          key={id}
          onPress={() => onChange(id)}
          style={[styles.tabItem, isActive && styles.tabItemActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}>
          <KoolaText
            variant="caption"
            weight={isActive ? '800' : '600'}
            style={{ color: isActive ? palette.primary : palette.muted }}>
            {TAB_LABELS[id]}
          </KoolaText>
        </Pressable>
      );
    })}
  </View>
);

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
}
const InfoSection: React.FC<InfoSectionProps> = ({ title, children, palette, styles }) => (
  <KoolaSurface variant="flat" style={styles.section}>
    <KoolaText variant="caption" tone="primary" weight="800" style={styles.sectionTitle}>
      {title.toUpperCase()}
    </KoolaText>
    {children}
  </KoolaSurface>
);

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
    container: { flex: 1, backgroundColor: p.canvas },
    content: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 0 },
    centerState: { flex: 1 },
    loadingCard: { margin: 16, padding: 18 },
    loadingCardItem: { marginBottom: 14 },
    coverWrap: {
      height: 188,
      marginHorizontal: -16,
      marginBottom: 12,
      overflow: 'hidden',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    coverPlaceholder: {
      backgroundColor: p.line,
    },
    coverImage: { width: '100%', height: '100%' },
    coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
    hero: {
      paddingHorizontal: 12,
      paddingTop: 0,
      paddingBottom: 12,
      marginBottom: 12,
      ...koolaShadows.sm,
    },
    heroHeader: { flexDirection: 'row', alignItems: 'center' },
    avatarOverlapWrap: {
      width: 69,
      height: 69,
      marginTop: -20,
      borderRadius: 34.5,
      borderWidth: 3,
      borderColor: p.surface,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surface,
      ...koolaShadows.sm,
    },
    heroNameWrap: { flex: 1, marginLeft: 10, flexDirection: 'row', alignItems: 'center' },
    heroFullBleed: {
      marginHorizontal: -16,
      borderRadius: 0,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
    heroOverCover: { marginTop: -18 },
    companyName: { flex: 1, fontSize: 12.5, fontWeight: '800', lineHeight: 16, color: p.ink },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    badgeItem: { marginRight: 8, marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'nowrap' },
    metaItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    typeRowLabel: { marginLeft: 8 },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: p.surface,
      borderRadius: koolaRadii.lg,
      borderWidth: 1,
      borderColor: p.line,
      paddingVertical: 14,
      marginBottom: 12,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statsDivider: { width: StyleSheet.hairlineWidth, backgroundColor: p.line, alignSelf: 'stretch', marginHorizontal: 8 },
    tabsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
    tabItem: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      borderColor: p.line,
      backgroundColor: p.surface,
    },
    tabItemActive: {
      borderColor: p.primary,
      backgroundColor: p.primary + '14',
    },
    section: { marginBottom: 12 },
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
