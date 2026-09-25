import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
  KoolaChip,
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
import { shoppingProducts, type ShoppingProduct } from './shoppingMockData';
import { conversationsApi } from '../../services/api/apiService';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { useShoppingProductHeader } from '../../navigation/ShoppingHeaderContext';

type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingStorefront'>;
type Route = RouteProp<ShoppingTabStackParamList, 'ShoppingStorefront'>;

type SortKey = 'all' | 'bestseller' | 'priceLow';

function parsePriceVnd(s: string): number {
  const digits = s.replace(/[^\d]/g, '');
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

const sellerDescriptions: Record<string, string> = {
  'seller-fresh': 'Rau củ — trái cây Đà Lạt hái mỗi sáng, giao 2h nội thành.',
  'seller-bep': 'Bếp nấu theo đơn, giao nóng 25 phút — món Việt mỗi ngày.',
  'seller-tech': 'Phụ kiện chính hãng, đổi mới 7 ngày — giao hôm nay.',
  'seller-nhaxinh': 'Đồ gia dụng gọn — bền — giao trong ngày.',
  'seller-beauty': 'Mỹ phẩm chính hãng, freeship toàn quốc.',
  'seller-choviet': 'Đặc sản miền Tây — gạo, mắm, khô — giao 4h.',
};

const ShoppingStorefrontScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const toast = useKoolaToast();
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const sellerId = route.params.sellerId;

  const sellerEntry = useMemo(
    () => shoppingProducts.find((p) => p.seller.id === sellerId),
    [sellerId],
  );
  const seller = sellerEntry?.seller ?? null;

  const sellerProducts = useMemo(
    () => shoppingProducts.filter((p) => p.seller.id === sellerId),
    [sellerId],
  );

  const stats = useMemo(() => {
    const count = sellerProducts.length;
    if (count === 0) return { count: 0, avg: '-' };
    const avg = sellerProducts.reduce((s, p) => s + p.rating, 0) / count;
    return { count, avg: avg.toFixed(1) };
  }, [sellerProducts]);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('all');
  const [followed, setFollowed] = useState(false);
  const [contacting, setContacting] = useState(false);

  const handleShare = useCallback(() => {
    toast.show('Chia sẻ — đang phát triển', 'info');
  }, [toast]);
  const handleCart = useCallback(() => {
    toast.show('Giỏ hàng — đang phát triển', 'info');
  }, [toast]);
  const handleSearch = useCallback(() => {
    toast.show('Tìm kiếm — đang phát triển', 'info');
  }, [toast]);

  useShoppingProductHeader({
    shopName: seller?.name ?? 'Gian hàng',
    onBack: useCallback(() => navigation.goBack(), [navigation]),
    onShare: handleShare,
    onCart: handleCart,
    onSearch: handleSearch,
  });

  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + koolaSpacing.sm;

  const handleContactSeller = useCallback(async () => {
    if (!seller) return;
    setContacting(true);
    try {
      const { conversation } = await conversationsApi.startDirectChat(seller.id);
      (navigation as unknown as { navigate: (a: string, b: unknown) => void }).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId: conversation._id },
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg =
        status === 404
          ? 'Gian hàng mẫu chưa có tài khoản thật — sẽ kết nối khi backend sẵn sàng. Bạn có thể nhắn tin qua tab Kết nối.'
          : 'Không thể bắt đầu trò chuyện. Bạn thử lại nhé.';
      toast.show(msg, status === 404 ? 'info' : 'warning');
    } finally {
      setContacting(false);
    }
  }, [seller, navigation, toast]);

  const handleFollow = useCallback(() => {
    if (followed) {
      setFollowed(false);
      toast.show('Đã bỏ theo dõi', 'info');
    } else {
      setFollowed(true);
      toast.show('Đã theo dõi', 'success');
    }
  }, [followed, toast]);

  const handleOpenProduct = useCallback(
    (productId: string) => {
      (navigation.navigate as unknown as (name: string, params: unknown) => void)('ShoppingProductDetail', { productId });
    },
    [navigation],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = sellerProducts;
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.shop.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (sort === 'bestseller') return [...list].sort((a, b) => b.soldCount - a.soldCount);
    if (sort === 'priceLow') return [...list].sort((a, b) => parsePriceVnd(a.price) - parsePriceVnd(b.price));
    return list;
  }, [sellerProducts, query, sort]);

  if (!seller) {
    return (
      <View style={styles.host}>
        <View style={[styles.notFound, { paddingTop: scrollPadTop }]}>
          <MaterialIcons name="storefront" size={40} color={semantic.text.faint} />
          <KoolaText tone="muted" style={{ marginTop: 12 }}>Không tìm thấy gian hàng</KoolaText>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.backPill, { borderColor: semantic.border.strong }]}
            android_ripple={{ color: semantic.border.subtle }}>
            <KoolaText variant="label" weight="700">Quay lại</KoolaText>
          </Pressable>
        </View>
      </View>
    );
  }

  const accent = sellerEntry?.accent ?? semantic.action.primary;
  const descText = sellerDescriptions[seller.id] ?? sellerEntry?.description ?? '';

  return (
    <View style={styles.host}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: scrollPadTop, paddingBottom: 16 + 64 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Header card — no cover banner */}
        <View style={styles.headerCard}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={[styles.sellerAvatarLg, { backgroundColor: `${accent}16`, borderColor: `${accent}28` }]}>
              <MaterialIcons name="storefront" size={28} color={accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <KoolaText variant="heading" weight="800" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {seller.name}
                </KoolaText>
                {seller.verified ? (
                  <MaterialIcons name="verified" size={16} color={semantic.status.success} style={{ marginLeft: 6 }} />
                ) : null}
              </View>
              {seller.province ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <MaterialIcons name="place" size={12} color={semantic.text.faint} />
                  <KoolaText variant="caption" tone="faint" style={{ marginLeft: 4 }}>
                    {seller.province}
                  </KoolaText>
                </View>
              ) : null}
              {descText ? (
                <KoolaText variant="caption" tone="muted" numberOfLines={2} style={{ marginTop: 6, lineHeight: 16 }}>
                  {descText}
                </KoolaText>
              ) : null}
              <View style={styles.statsRow}>
                <View style={styles.statChip}>
                  <MaterialIcons name="inventory-2" size={12} color={semantic.text.muted} />
                  <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>
                    {stats.count} sản phẩm
                  </KoolaText>
                </View>
                <View style={styles.dot} />
                <View style={styles.statChip}>
                  <MaterialIcons name="star" size={12} color={semantic.status.warning} />
                  <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>
                    {stats.avg}
                  </KoolaText>
                </View>
                <View style={styles.dot} />
                <View style={styles.statChip}>
                  <KoolaText variant="caption" weight="700">98%</KoolaText>
                  <KoolaText variant="caption" tone="muted"> phản hồi</KoolaText>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleFollow}
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
              onPress={handleContactSeller}
              disabled={contacting}
              style={[styles.msgBtnSmall, { backgroundColor: semantic.action.primary }]}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
              <MaterialIcons name="chat-bubble-outline" size={16} color={semantic.text.onAction} />
              <KoolaText variant="label" weight="700" style={{ marginLeft: 6, color: semantic.text.onAction }}>
                Nhắn tin
              </KoolaText>
            </Pressable>
          </View>
        </View>

        {/* Search in shop — brown dock like parent ShoppingHome (flat, no border) */}
        <View style={[styles.searchWrap, { backgroundColor: '#F3ECE2' }]}>
          <MaterialIcons name="search" size={18} color={semantic.text.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm trong gian hàng..."
            placeholderTextColor={semantic.text.faint}
            style={[styles.searchInput, { color: semantic.text.primary }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={semantic.text.faint} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter chips */}
        <View style={styles.chipsRow}>
          <KoolaChip
            label="Tất cả"
            selected={sort === 'all'}
            onPress={() => setSort('all')}
          />
          <KoolaChip
            label="Bán chạy"
            selected={sort === 'bestseller'}
            onPress={() => setSort('bestseller')}
          />
          <KoolaChip
            label="Giá thấp nhất"
            selected={sort === 'priceLow'}
            onPress={() => setSort('priceLow')}
          />
        </View>

        {/* Grid */}
        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialIcons name="search-off" size={36} color={semantic.text.faint} />
            <KoolaText tone="muted" style={{ marginTop: 10 }}>Không tìm thấy sản phẩm</KoolaText>
            {query ? (
              <KoolaText variant="caption" tone="faint" style={{ marginTop: 4 }}>
                Thử từ khóa khác nhé
              </KoolaText>
            ) : null}
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((item) => (
              <View key={item.id} style={styles.gridCell}>
                <StorefrontCard
                  item={item}
                  semantic={semantic}
                  styles={styles}
                  onPress={() => handleOpenProduct(item.id)}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <KoolaButton
          title="Nhắn tin"
          icon="chat-bubble-outline"
          variant="primary"
          loading={contacting}
          disabled={contacting}
          onPress={handleContactSeller}
          style={styles.chatBtn}
        />
      </View>
    </View>
  );
};

const StorefrontCard: React.FC<{
  item: ShoppingProduct;
  semantic: SemanticTokens;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}> = React.memo(({ item, semantic, styles, onPress }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.image) && !imageFailed;
  return (
    <Pressable
      onPress={onPress}
      style={styles.card}
      android_ripple={{ color: semantic.border.subtle }}>
      <View style={[styles.cardThumb, { backgroundColor: `${item.accent}14` }]}>
        {showImage ? (
          <Image
            source={item.image as ImageSourcePropType}
            style={styles.cardImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <MaterialIcons name={item.icon as never} size={40} color={item.accent} />
        )}
        {item.badge ? (
          <View style={styles.cardBadge}>
            <KoolaText variant="caption" weight="800" tone="surface" numberOfLines={1}>
              {item.badge}
            </KoolaText>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <KoolaText variant="label" weight="700" numberOfLines={2} style={styles.cardTitle}>
          {item.title}
        </KoolaText>
        <KoolaText variant="label" weight="800" style={{ marginTop: 4, color: semantic.text.primary }}>
          {item.price}
        </KoolaText>
        <View style={styles.cardMeta}>
          <MaterialIcons name="star" size={11} color={semantic.status.warning} />
          <KoolaText variant="caption" weight="700" style={{ marginLeft: 3 }}>
            {item.rating}
          </KoolaText>
          <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>
            · {item.sold}
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
      height: 40,
      paddingHorizontal: 20,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 2 },
    cover: {
      height: 0,
      overflow: 'hidden',
    },
    coverAccentBar: {
      display: 'none',
    },
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
    },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
    statChip: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: semantic.text.faint, marginHorizontal: 8 },
    headerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    followBtn: {
      flex: 1,
      height: 36,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    msgBtnSmall: {
      flex: 1,
      height: 36,
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
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 4 },
    gridCell: { width: '48.8%' },
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
    cardBadge: {
      position: 'absolute',
      left: 8,
      top: 8,
      backgroundColor: 'rgba(0,0,0,0.72)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: koolaRadii.xs,
    },
    cardBody: { padding: 10 },
    cardTitle: { fontSize: 12, lineHeight: 16, minHeight: 32 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
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
