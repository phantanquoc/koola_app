import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect as SvgRect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaBadge,
  KoolaButton,
  KoolaChip,
  KoolaEmptyState,
  KoolaErrorState,
  KoolaSkeleton,
  KoolaSurface,
  KoolaText,
  koolaRadii,
  koolaShadows,
  koolaDarkShadows,
  koolaSpacing,
  useTheme,
  useKoolaToast,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { ShoppingTabStackParamList } from '../../navigation/types';
import {
  commerceApi,
  type CommerceSort,
  type ProductCard,
  type SellerStorefrontResponse,
} from '../../services/api/apiService';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { useShoppingProductHeader } from '../../navigation/ShoppingHeaderContext';
import { formatVnd } from '../../utils/formatVnd';
import { useCommerceProductList } from './hooks/useCommerceProductList';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useSellerChat } from './hooks/useSellerChat';
import { CATEGORY_ICON, STOREFRONT_SORT_CHIPS, soldLabel } from './shoppingCatalog';
import { LightFieldBackground } from '../main/components/personal/LightFieldBackground';
import UserAvatar from '../../components/UserAvatar';
import { CATEGORY_LABELS } from '../connect/constants';

type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingStorefront'>;
type Route = RouteProp<ShoppingTabStackParamList, 'ShoppingStorefront'>;

const SEARCH_DEBOUNCE_MS = 300;

type ProfileState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: SellerStorefrontResponse }
  | { kind: 'notFound' }
  | { kind: 'error' };

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList as any);

function countryFlag(label?: string): string {
  const v = (label ?? '').toLowerCase();
  if (v.includes('viet') || v.includes('việt')) return '🇻🇳';
  return '🌐';
}

const ShoppingStorefrontScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const isDark = resolvedScheme === 'dark';
  const toastRef = useRef(useKoolaToast());
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const sellerId = route.params.sellerId;

  // ── Scroll chrome (dual-layer fade 0-96 identical to BusinessProfile) ───────
  const scrollY = useRef(new Animated.Value(0)).current;
  const chromeOpacity = useMemo(
    () =>
      (scrollY as any).interpolate({
        inputRange: [0, 48, 96],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp' as const,
      }),
    [scrollY],
  );
  const headerH = getNotchHeaderHeight(insets.top, 'nav');

  // ── Seller profile (GET /commerce/sellers/:id) ──────────────────────────
  const [profile, setProfile] = useState<ProfileState>({ kind: 'loading' });
  const profileSeqRef = useRef(0);
  const loadProfile = useCallback(async () => {
    const seq = ++profileSeqRef.current;
    setProfile({ kind: 'loading' });
    try {
      const data = await commerceApi.getSeller(sellerId);
      if (seq === profileSeqRef.current) setProfile({ kind: 'ready', data });
    } catch (err: unknown) {
      if (seq !== profileSeqRef.current) return;
      const status = (err as { response?: { status?: number } })?.response?.status;
      setProfile(status === 404 ? { kind: 'notFound' } : { kind: 'error' });
    }
  }, [sellerId]);
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);
  const seller = profile.kind === 'ready' ? profile.data.seller : null;

  // ── Products: same server list contract, scoped by sellerId ────────────
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CommerceSort>('newest');
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const listQuery = useMemo(
    () => ({ sellerId, q: debouncedQuery, sort }),
    [sellerId, debouncedQuery, sort],
  );
  const list = useCommerceProductList(listQuery, { enabled: profile.kind === 'ready' });

  const [followed, setFollowed] = useState(false);
  const { openSellerChat, contactingSellerId } = useSellerChat();
  const contacting = contactingSellerId === sellerId;

  const handleShare = useCallback(() => {
    toastRef.current.show('Chia sẻ — đang phát triển', 'info');
  }, []);
  const handleCart = useCallback(() => {
    navigation.navigate('ShoppingCart');
  }, [navigation]);
  const handleSearch = useCallback(() => {
    toastRef.current.show('Tìm kiếm — dùng ô tìm trong gian hàng bên dưới', 'info');
  }, []);

  useShoppingProductHeader({
    shopName: seller?.displayName ?? 'Gian hàng',
    onBack: useCallback(() => navigation.goBack(), [navigation]),
    onShare: handleShare,
    onCart: handleCart,
    onSearch: handleSearch,
  });

  const scrollPadTop = headerH + koolaSpacing.sm;

  const handleFollow = useCallback(() => {
    toastRef.current.show(followed ? 'Đã bỏ theo dõi' : 'Đã theo dõi', followed ? 'info' : 'success');
    setFollowed(!followed);
  }, [followed]);

  const handleOpenProduct = useCallback(
    (productId: string) => {
      navigation.navigate('ShoppingProductDetail', { productId });
    },
    [navigation],
  );

  if (profile.kind === 'notFound') {
    return (
      <View style={styles.host}>
        <View style={[styles.notFound, { paddingTop: scrollPadTop }]}>
          <MaterialIcons name="storefront" size={40} color={semantic.text.faint} />
          <KoolaText tone="muted" style={{ marginTop: 12 }}>Không tìm thấy gian hàng</KoolaText>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.backPill, { borderColor: semantic.border.strong }]}
            accessibilityRole="button"
            android_ripple={{ color: semantic.border.subtle }}>
            <KoolaText variant="label" weight="700">Quay lại</KoolaText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (profile.kind === 'error') {
    return (
      <View style={styles.host}>
        <View style={[styles.notFound, { paddingTop: scrollPadTop }]}>
          <KoolaErrorState
            title="Không tải được gian hàng"
            message="Kiểm tra kết nối mạng rồi thử lại."
            onRetry={() => void loadProfile()}
          />
        </View>
      </View>
    );
  }

  const accent = semantic.action.primary;
  const headerTitle = seller?.displayName ?? 'Gian hàng';
  const categoryLabel =
    (seller?.businessCategory ? (CATEGORY_LABELS as Record<string, string>)[seller.businessCategory] : undefined) ||
    seller?.businessCategory ||
    '';

  const header = (
    <View>
      {/* Cover — full-bleed behind transparent header + status bar */}
      {seller ? (
        <View
          style={[
            styles.coverWrap,
            { marginTop: -headerH - 40, height: 230 + headerH, paddingTop: headerH },
          ]}>
          <Image
            source={
              seller.coverImageUrl
                ? { uri: seller.coverImageUrl }
                : require('../../assets/mock-shopping/bg_header.png')
            }
            style={styles.coverImage}
            resizeMode="cover"
          />
          <View style={styles.coverScrim} />
        </View>
      ) : (
        <View
          style={[
            styles.coverWrap,
            styles.coverPlaceholder,
            { marginTop: -headerH, height: 72 + headerH, paddingTop: headerH },
          ]}
        />
      )}

      {/* Hero — avatar goi 1/3 tren banner */}
      {seller ? (
        <KoolaSurface variant="raised" style={[styles.hero, styles.heroFullBleed, styles.heroOverCover]}>
          <View style={styles.heroHeader}>
            <View style={styles.avatarOverlapWrap}>
              <UserAvatar displayName={seller.displayName} avatar={seller.logoUrl ?? undefined} size={80} />
            </View>
            <View style={styles.heroNameWrap}>
              <KoolaText numberOfLines={2} style={styles.companyName}>
                {seller.displayName}
              </KoolaText>
              <MaterialIcons
                name="verified"
                size={14}
                color={semantic.status.success}
                style={{ marginLeft: 5, marginTop: 1 }}
              />
            </View>
          </View>
          <View style={styles.badgeRow}>
            {categoryLabel ? (
              <View style={styles.badgeItem}>
                <KoolaBadge label={categoryLabel} tone="primary" />
              </View>
            ) : null}
            {seller.province ? (
              <View style={styles.badgeItem}>
                <KoolaBadge label={seller.province} tone="muted" />
              </View>
            ) : null}
            {seller.foundedYear ? (
              <View style={styles.badgeItem}>
                <KoolaBadge label={`Từ ${seller.foundedYear}`} tone="muted" />
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            {seller.province ? (
              <View style={styles.metaItem}>
                <KoolaText style={{ fontSize: 13, marginRight: 3 }}>{countryFlag(seller.province)}</KoolaText>
                <KoolaText variant="caption" weight="700" tone="muted">
                  {seller.province}
                </KoolaText>
              </View>
            ) : null}
            {typeof seller.rating === 'number' ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="star" size={14} color="#F59E0B" />
                <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>
                  {seller.rating.toFixed(1)}
                </KoolaText>
                {typeof seller.reviewCount === 'number' ? (
                  <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>
                    ({seller.reviewCount})
                  </KoolaText>
                ) : null}
              </View>
            ) : null}
            {typeof seller.viewCount === 'number' ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="visibility" size={14} color={semantic.text.faint} />
                <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>
                  {seller.viewCount.toLocaleString('vi-VN')} lượt xem
                </KoolaText>
              </View>
            ) : null}
            {typeof seller.followerCount === 'number' ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="people" size={14} color={semantic.text.faint} />
                <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>
                  {seller.followerCount.toLocaleString('vi-VN')} theo dõi
                </KoolaText>
              </View>
            ) : null}
          </View>
        </KoolaSurface>
      ) : (
        <KoolaSkeleton width="100%" height={150} radius={koolaRadii.md} style={{ marginBottom: 12 }} />
      )}

      {/* Slogan */}
      {seller?.tagline ? (
        <KoolaSurface variant="soft" style={styles.typeRow}>
          <MaterialIcons name="format-quote" size={17} color={semantic.text.faint} />
          <KoolaText
            variant="label"
            tone="muted"
            weight="500"
            style={[
              styles.typeRowLabel,
              { fontStyle: 'italic', flex: 1, letterSpacing: 0.3, textTransform: 'capitalize' },
            ]}
            numberOfLines={2}>
            {seller.tagline.toLowerCase()}
          </KoolaText>
        </KoolaSurface>
      ) : seller?.description ? (
        <KoolaSurface variant="soft" style={styles.typeRow}>
          <MaterialIcons name="format-quote" size={17} color={semantic.text.faint} />
          <KoolaText
            variant="label"
            tone="muted"
            weight="500"
            style={[styles.typeRowLabel, { fontStyle: 'italic', flex: 1 }]}
            numberOfLines={2}>
            {seller.description.toLowerCase()}
          </KoolaText>
        </KoolaSurface>
      ) : null}

      {/* Stats — 3 cols */}
      {seller ? (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <KoolaText variant="title" weight="800" style={{ textAlign: 'center' }}>
              {seller.foundedYear ? String(seller.foundedYear) : '—'}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" weight="500" style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
              Thành lập
            </KoolaText>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statItem}>
            <KoolaText variant="heading" weight="700" style={{ textAlign: 'center' }}>
              {seller.employeeCount ?? '—'}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" weight="500" style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
              Nhân sự
            </KoolaText>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statItem}>
            <KoolaText variant="heading" weight="700" style={{ textAlign: 'center' }}>
              {profile.kind === 'ready'
                ? seller.exportMarketsCount != null
                  ? `${seller.exportMarketsCount} QG`
                  : `${profile.data.productCount} SP`
                : '—'}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" weight="500" style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
              Thị trường
            </KoolaText>
          </View>
        </View>
      ) : null}

      {/* Follow / Message actions */}
      {seller ? (
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleFollow}
            accessibilityRole="button"
            accessibilityState={{ selected: followed }}
            style={[
              styles.followBtn,
              {
                borderColor: followed ? semantic.action.primary : semantic.border.strong,
                backgroundColor: followed ? `${semantic.action.primary}12` : 'transparent',
              },
            ]}
            android_ripple={{ color: semantic.border.subtle }}>
            <MaterialIcons
              name={followed ? 'check' : 'add'}
              size={16}
              color={followed ? semantic.action.primary : semantic.text.primary}
            />
            <KoolaText
              variant="label"
              weight="700"
              style={{ marginLeft: 6, color: followed ? semantic.action.primary : semantic.text.primary }}>
              {followed ? 'Đang theo dõi' : 'Theo dõi'}
            </KoolaText>
          </Pressable>
          <Pressable
            onPress={() => void openSellerChat(sellerId)}
            disabled={contacting}
            accessibilityRole="button"
            accessibilityLabel={`Nhắn tin với ${seller.displayName}`}
            style={[styles.msgBtnSmall, { backgroundColor: semantic.action.primary, opacity: contacting ? 0.6 : 1 }]}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
            <MaterialIcons name="chat-bubble-outline" size={16} color={semantic.text.onAction} />
            <KoolaText variant="label" weight="700" style={{ marginLeft: 6, color: semantic.text.onAction }}>
              Nhắn tin
            </KoolaText>
          </Pressable>
        </View>
      ) : null}

      {/* Search in shop — server-side (q + sellerId), debounced 300 ms */}
      <View style={[styles.searchWrap, { backgroundColor: semantic.border.subtle }]}>
        <MaterialIcons name="search" size={18} color={semantic.text.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm trong gian hàng..."
          placeholderTextColor={semantic.text.faint}
          style={[styles.searchInput, { color: semantic.text.primary }]}
          returnKeyType="search"
          accessibilityLabel="Tìm trong gian hàng"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm">
            <MaterialIcons name="close" size={18} color={semantic.text.faint} />
          </Pressable>
        ) : null}
      </View>

      {/* Sort chips → server `sort` */}
      <View style={styles.chipsRow}>
        {STOREFRONT_SORT_CHIPS.map((c) => (
          <KoolaChip key={c.sort} label={c.label} selected={sort === c.sort} onPress={() => setSort(c.sort)} />
        ))}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (profile.kind === 'loading' || list.status === 'initialLoading') {
      return (
        <View style={styles.grid} accessibilityRole="progressbar" accessibilityLabel="Đang tải sản phẩm">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.gridCell}>
              <KoolaSkeleton width="100%" height={200} radius={koolaRadii.md} />
            </View>
          ))}
        </View>
      );
    }
    if (list.status === 'error') {
      return (
        <KoolaErrorState
          title="Không tải được sản phẩm"
          message="Kiểm tra kết nối mạng rồi thử lại."
          onRetry={list.retry}
          style={styles.emptyWrap}
        />
      );
    }
    return (
      <KoolaEmptyState
        icon="search-off"
        title="Không tìm thấy sản phẩm"
        message={debouncedQuery.trim() ? 'Thử từ khoá khác nhé' : 'Gian hàng chưa có sản phẩm nào'}
        style={styles.emptyWrap}
      />
    );
  };

  const renderFooter = () => {
    if (list.status === 'loadingMore') {
      return (
        <View style={styles.footer}>
          <ActivityIndicator color={semantic.action.primary} accessibilityLabel="Đang tải thêm" />
        </View>
      );
    }
    if (list.status === 'loadMoreError') {
      return (
        <Pressable onPress={list.retry} style={styles.footer} accessibilityRole="button" accessibilityLabel="Tải thêm thất bại, thử lại">
          <KoolaText variant="caption" weight="700" tone="primary">Không tải được thêm · Thử lại</KoolaText>
        </Pressable>
      );
    }
    return null;
  };

  return (
    <View style={styles.host}>
      {/* Inline header — dual-layer fade identical to BusinessProfile */}
      <View style={[styles.inlineHeader, { height: headerH, paddingTop: insets.top }]}>
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
              <SvgLinearGradient id="shopHeaderShadow" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={isDark ? '0.48' : '0.18'} />
                <Stop offset="1" stopColor="#000000" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <SvgRect width="100%" height={18} fill="url(#shopHeaderShadow)" />
          </Svg>
        </Animated.View>
        {/* Transparent layer — fades out */}
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
          <KoolaText weight="800" numberOfLines={1} style={[styles.inlineHeaderTitle, { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }]}>
            {headerTitle}
          </KoolaText>
          <View style={styles.inlineHeaderActions}>
            <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
              <MaterialIcons name="search" size={20} color="#FFFFFF" />
            </View>
            <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
              <MaterialIcons name="share" size={18} color="#FFFFFF" />
            </View>
            <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
              <MaterialIcons name="shopping-cart" size={18} color="#FFFFFF" />
            </View>
          </View>
        </Animated.View>
        {/* Solid layer — fades in */}
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
          <KoolaText weight="800" numberOfLines={1} style={[styles.inlineHeaderTitle, { color: tokens.semantic.text.primary, textShadowColor: 'transparent' }]}>
            {headerTitle}
          </KoolaText>
          <View style={styles.inlineHeaderActions}>
            <Pressable onPress={handleSearch} hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
              <MaterialIcons name="search" size={20} color={tokens.semantic.text.primary} />
            </Pressable>
            <Pressable onPress={handleShare} hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
              <MaterialIcons name="share" size={18} color={tokens.semantic.text.primary} />
            </Pressable>
            <Pressable onPress={handleCart} hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
              <MaterialIcons name="shopping-cart" size={18} color={tokens.semantic.text.primary} />
            </Pressable>
          </View>
        </Animated.View>
      </View>

      <AnimatedFlatList
        data={profile.kind === 'ready' ? list.items : []}
        keyExtractor={(item: ProductCard) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }: { item: ProductCard }) => (
          <View style={styles.gridCell}>
            <StorefrontCard item={item} semantic={semantic} styles={styles} onPress={() => handleOpenProduct(item.id)} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        removeClippedSubviews={false}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 0, paddingBottom: 16 + 64 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      />

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <KoolaButton
          title="Nhắn tin"
          icon="chat-bubble-outline"
          variant="primary"
          loading={contacting}
          disabled={contacting || !seller}
          onPress={() => void openSellerChat(sellerId)}
          style={styles.chatBtn}
        />
      </View>
    </View>
  );
};

const StorefrontCard: React.FC<{
  item: ProductCard;
  semantic: SemanticTokens;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}> = React.memo(({ item, semantic, styles, onPress }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;
  const sold = soldLabel(item.soldCount);
  const accent = semantic.action.primary;
  return (
    <Pressable
      onPress={onPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatVnd(item.price)}`}
      android_ripple={{ color: semantic.border.subtle }}>
      <View style={[styles.cardThumb, { backgroundColor: `${accent}14` }]}>
        {showImage ? (
          <Image
            key={item.imageKey ?? undefined}
            source={{ uri: item.imageUrl as string }}
            style={styles.cardImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
            accessible={false}
          />
        ) : (
          <MaterialIcons name={CATEGORY_ICON[item.category] as never} size={40} color={accent} />
        )}
      </View>
      <View style={styles.cardBody}>
        <KoolaText variant="label" weight="700" numberOfLines={2} style={styles.cardTitle}>
          {item.name}
        </KoolaText>
        <KoolaText variant="label" weight="800" style={{ marginTop: 4, color: semantic.text.primary }}>
          {formatVnd(item.price)}
        </KoolaText>
        <View style={styles.cardMeta}>
          <KoolaText variant="caption" tone="muted" numberOfLines={1}>
            {sold ?? ' '}
          </KoolaText>
        </View>
      </View>
    </Pressable>
  );
});

function makeStyles(semantic: SemanticTokens, scheme: string) {
  const shadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm;
  return StyleSheet.create({
    host: { flex: 1, backgroundColor: semantic.bg.canvas },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    backPill: {
      marginTop: 16,
      height: 44,
      paddingHorizontal: 20,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    coverWrap: {
      height: 188,
      marginHorizontal: -16,
      marginBottom: 12,
      overflow: 'hidden',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    coverPlaceholder: {
      backgroundColor: semantic.border.subtle,
    },
    coverImage: { width: '100%', height: '100%' },
    coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
    hero: {
      paddingHorizontal: 12,
      paddingTop: 0,
      paddingBottom: 12,
      marginBottom: 12,
      ...shadow,
    },
    heroHeader: { flexDirection: 'row', alignItems: 'center' },
    avatarOverlapWrap: {
      width: 84,
      height: 84,
      marginTop: -24,
      borderRadius: 42,
      borderWidth: 4,
      borderColor: semantic.surface.level1,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level1,
      ...shadow,
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
    heroOverCover: { marginTop: -48 },
    companyName: { flex: 1, fontSize: 12.5, fontWeight: '800', lineHeight: 16, color: semantic.text.primary },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    badgeItem: { marginRight: 8, marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' },
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
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.lg,
      borderWidth: 1,
      borderColor: semantic.border.subtle,
      paddingVertical: 14,
      marginBottom: 12,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statsDivider: { width: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle, alignSelf: 'stretch', marginHorizontal: 8 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16 },
    sellerAvatarLg: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      overflow: 'hidden',
    },
    sellerLogo: { width: 56, height: 56 },
    headerActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    followBtn: {
      flex: 1,
      height: 44,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    msgBtnSmall: {
      flex: 1,
      height: 44,
      borderRadius: koolaRadii.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 0,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      height: 40,
      gap: 8,
      marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
    chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4 },
    columnWrapper: { justifyContent: 'space-between', marginBottom: 4 },
    gridCell: { width: '49.4%' },
    card: {
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      overflow: 'hidden',
      marginBottom: 0,
      ...shadow,
    },
    cardThumb: {
      width: '100%',
      aspectRatio: 1.15,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    cardImage: { width: '100%', height: '100%' },
    cardBody: { padding: 10 },
    cardTitle: { fontSize: 12, lineHeight: 16, minHeight: 32 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
    footer: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 10,
      backgroundColor: 'transparent',
    },
    chatBtn: { flex: 1 },
  });
}

export default ShoppingStorefrontScreen;
