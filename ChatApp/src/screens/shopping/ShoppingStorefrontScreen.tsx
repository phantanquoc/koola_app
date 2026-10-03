import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
  KoolaChip,
  KoolaEmptyState,
  KoolaErrorState,
  KoolaSkeleton,
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
import { CATEGORY_ICON, soldLabel } from './shoppingCatalog';

type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingStorefront'>;
type Route = RouteProp<ShoppingTabStackParamList, 'ShoppingStorefront'>;

const SEARCH_DEBOUNCE_MS = 300;
const SORT_CHIPS: ReadonlyArray<{ sort: CommerceSort; label: string }> = [
  { sort: 'newest', label: 'Mới nhất' },
  { sort: 'bestseller', label: 'Bán chạy' },
  { sort: 'priceLow', label: 'Giá thấp nhất' },
];

type ProfileState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: SellerStorefrontResponse }
  | { kind: 'notFound' }
  | { kind: 'error' };

const ShoppingStorefrontScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const toastRef = useRef(useKoolaToast());
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const sellerId = route.params.sellerId;

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
  // Only list products once the seller is known to be visible.
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

  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + koolaSpacing.sm;

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

  const header = (
    <View>
      {seller ? (
        <View style={styles.headerCard}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={[styles.sellerAvatarLg, { backgroundColor: `${accent}16`, borderColor: `${accent}28` }]}>
              {seller.logoUrl ? (
                <Image source={{ uri: seller.logoUrl }} style={styles.sellerLogo} accessible={false} />
              ) : (
                <MaterialIcons name="storefront" size={28} color={accent} />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <KoolaText variant="heading" weight="800" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {seller.displayName}
                </KoolaText>
                <MaterialIcons name="verified" size={16} color={semantic.status.success} style={{ marginLeft: 6 }} accessibilityLabel="Đã xác minh" />
              </View>
              {seller.province ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <MaterialIcons name="place" size={12} color={semantic.text.faint} />
                  <KoolaText variant="caption" tone="faint" style={{ marginLeft: 4 }}>
                    {seller.province}
                  </KoolaText>
                </View>
              ) : null}
              {seller.tagline || seller.description ? (
                <KoolaText variant="caption" tone="muted" numberOfLines={2} style={{ marginTop: 6, lineHeight: 16 }}>
                  {seller.tagline || seller.description}
                </KoolaText>
              ) : null}
              <View style={styles.statsRow}>
                <View style={styles.statChip}>
                  <MaterialIcons name="inventory-2" size={12} color={semantic.text.muted} />
                  <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>
                    {profile.kind === 'ready' ? profile.data.productCount : 0} sản phẩm
                  </KoolaText>
                </View>
              </View>
            </View>
          </View>
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
        </View>
      ) : (
        <KoolaSkeleton width="100%" height={150} radius={koolaRadii.md} style={{ marginBottom: 12 }} />
      )}

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
        {SORT_CHIPS.map((c) => (
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
        message={debouncedQuery.trim() ? 'Thử từ khóa khác nhé' : 'Gian hàng chưa có sản phẩm nào'}
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
      <FlatList
        data={profile.kind === 'ready' ? list.items : []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => (
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
          { paddingTop: scrollPadTop, paddingBottom: 16 + 64 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
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
    host: { flex: 1, backgroundColor: 'transparent' },
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
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 2 },
    headerCard: {
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 14,
      marginTop: 0,
      marginBottom: 12,
      ...shadow,
    },
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
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
    statChip: { flexDirection: 'row', alignItems: 'center' },
    headerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
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
