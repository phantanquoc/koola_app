import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
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
import { commerceApi, type ProductDetail } from '../../services/api/apiService';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { useShoppingProductHeader } from '../../navigation/ShoppingHeaderContext';
import { formatVnd } from '../../utils/formatVnd';
import { useSellerChat } from './hooks/useSellerChat';
import { CATEGORY_ICON, addProductToCart, soldLabel } from './shoppingCatalog';

type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingProductDetail'>;
type Route = RouteProp<ShoppingTabStackParamList, 'ShoppingProductDetail'>;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; product: ProductDetail }
  | { kind: 'notFound' }
  | { kind: 'error' };

const HERO_ASPECT = 1.4;

const ShoppingProductDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  // useKoolaToast() returns a fresh object each render; keep it out of deps.
  const toastRef = useRef(useKoolaToast());
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const productId = route.params.productId;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const product = state.kind === 'ready' ? state.product : null;
  const reqSeqRef = useRef(0);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++reqSeqRef.current;
      if (!opts?.silent) setState({ kind: 'loading' });
      try {
        const detail = await commerceApi.getProduct(productId);
        if (seq !== reqSeqRef.current) return;
        setState({ kind: 'ready', product: detail });
      } catch (err: unknown) {
        if (seq !== reqSeqRef.current) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        // A silent refresh (image URL renewal) never replaces visible content.
        if (opts?.silent) return;
        setState(status === 404 ? { kind: 'notFound' } : { kind: 'error' });
      }
    },
    [productId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Presigned image URLs expire (≈1h). On the first image error, refetch the
  // detail ONCE for fresh URLs; a second failure falls back to the glyph.
  const imageRefetchedRef = useRef(false);
  const [failedImages, setFailedImages] = useState<Record<number, true>>({});
  const handleImageError = useCallback(
    (index: number) => {
      if (!imageRefetchedRef.current) {
        imageRefetchedRef.current = true;
        void load({ silent: true });
        return;
      }
      setFailedImages((m) => (m[index] ? m : { ...m, [index]: true }));
    },
    [load],
  );

  const [imageIndex, setImageIndex] = useState(0);
  const onGalleryScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, windowWidth));
      setImageIndex((prev) => (prev === i ? prev : i));
    },
    [windowWidth],
  );

  const { openSellerChat, contactingSellerId } = useSellerChat();
  const contacting = !!product && contactingSellerId === product.seller.id;

  const handleViewShop = useCallback(() => {
    if (!product) return;
    navigation.navigate('ShoppingStorefront', { sellerId: product.seller.id });
  }, [product, navigation]);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('ShoppingCart');
  }, [navigation]);

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    if (addProductToCart(product)) {
      toastRef.current.show('Đã thêm vào giỏ hàng', 'success');
    } else {
      toastRef.current.show('Không thể thêm vào giỏ. Bạn thử lại nhé.', 'warning');
    }
  }, [product]);

  // [Mua ngay] = add to cart, then open the cart.
  const handleBuyNow = useCallback(() => {
    if (!product) return;
    if (addProductToCart(product)) {
      navigation.navigate('ShoppingCart');
    } else {
      toastRef.current.show('Không thể thêm vào giỏ. Bạn thử lại nhé.', 'warning');
    }
  }, [product, navigation]);

  const handleShare = useCallback(() => {
    toastRef.current.show('Chia sẻ — đang phát triển', 'info');
  }, []);
  const handleSearch = useCallback(() => {
    toastRef.current.show('Tìm kiếm — đang phát triển', 'info');
  }, []);

  useShoppingProductHeader({
    shopName: product?.seller.displayName ?? 'Chi tiết sản phẩm',
    onBack: useCallback(() => navigation.goBack(), [navigation]),
    onShopPress: product ? handleViewShop : undefined,
    onShare: handleShare,
    onCart: handleOpenCart,
    onSearch: handleSearch,
  });

  // NotchHeader is rendered by ShoppingTabStack as a fixed sibling above the
  // stack (zIndex 10). Content starts right below it.
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + koolaSpacing.sm;

  if (state.kind === 'loading') {
    return (
      <View style={styles.host}>
        <View
          style={{ paddingTop: scrollPadTop }}
          accessibilityRole="progressbar"
          accessibilityLabel="Đang tải sản phẩm">
          <KoolaSkeleton width="100%" height={windowWidth / HERO_ASPECT} radius={0} />
          <View style={styles.section}>
            <KoolaSkeleton width="80%" height={22} radius={koolaRadii.xs} />
            <KoolaSkeleton width="40%" height={14} radius={koolaRadii.xs} style={{ marginTop: 10 }} />
            <KoolaSkeleton width="50%" height={26} radius={koolaRadii.xs} style={{ marginTop: 18 }} />
            <KoolaSkeleton width="100%" height={64} radius={koolaRadii.md} style={{ marginTop: 18 }} />
          </View>
        </View>
      </View>
    );
  }

  if (state.kind === 'notFound' || state.kind === 'error') {
    return (
      <View style={styles.host}>
        <ScrollView contentContainerStyle={[styles.notFound, { paddingTop: scrollPadTop }]}>
          {state.kind === 'notFound' ? (
            <>
              <MaterialIcons name="search-off" size={40} color={semantic.text.faint} />
              <KoolaText tone="muted" style={{ marginTop: 12 }}>Không tìm thấy sản phẩm</KoolaText>
              <KoolaText variant="caption" tone="faint" align="center" style={{ marginTop: 4 }}>
                Sản phẩm có thể đã ngừng bán.
              </KoolaText>
              <Pressable
                onPress={() => navigation.goBack()}
                style={[styles.backPill, { borderColor: semantic.border.strong }]}
                accessibilityRole="button"
                android_ripple={{ color: semantic.border.subtle }}>
                <KoolaText variant="label" weight="700">Quay lại</KoolaText>
              </Pressable>
            </>
          ) : (
            <KoolaErrorState
              title="Không tải được sản phẩm"
              message="Kiểm tra kết nối mạng rồi thử lại."
              onRetry={() => void load()}
            />
          )}
        </ScrollView>
      </View>
    );
  }

  const p = state.product;
  const sold = soldLabel(p.soldCount);
  const accent = semantic.action.primary;
  const images = p.imageUrls
    .map((url, i) => ({ url, key: p.imageKeys[i] ?? String(i), index: i }))
    .filter((img): img is { url: string; key: string; index: number } => !!img.url && !failedImages[img.index]);

  return (
    <View style={styles.host}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: scrollPadTop, paddingBottom: 16 + 64 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}>

        <View style={[styles.heroWrap, { backgroundColor: `${accent}14`, height: windowWidth / HERO_ASPECT }]}>
          {images.length > 0 ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              removeClippedSubviews={false}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(img) => img.key}
              onScroll={onGalleryScroll}
              scrollEventThrottle={32}
              renderItem={({ item: img }) => (
                <Image
                  // Cells are keyed by media key (keyExtractor), so a refreshed
                  // presigned URL for the same image swaps source in place.
                  source={{ uri: img.url }}
                  style={{ width: windowWidth, height: windowWidth / HERO_ASPECT }}
                  resizeMode="cover"
                  onError={() => handleImageError(img.index)}
                  accessibilityIgnoresInvertColors
                  accessible
                  accessibilityLabel={`Ảnh ${img.index + 1} của ${p.name}`}
                />
              )}
            />
          ) : (
            <MaterialIcons name={CATEGORY_ICON[p.category] as never} size={72} color={accent} />
          )}
          {images.length > 1 ? (
            <View style={styles.galleryCounter} accessibilityLabel={`Ảnh ${imageIndex + 1} trên ${images.length}`}>
              <KoolaText variant="caption" weight="700" tone="surface">
                {Math.min(imageIndex, images.length - 1) + 1}/{images.length}
              </KoolaText>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <KoolaText variant="heading" weight="800" style={styles.title}>{p.name}</KoolaText>
          <View style={styles.shopRow}>
            <MaterialIcons name="storefront" size={14} color={semantic.text.muted} />
            <KoolaText variant="caption" tone="muted" style={{ marginLeft: 6 }}>{p.seller.displayName}</KoolaText>
            <View style={[styles.verifiedPill, { backgroundColor: `${semantic.status.success}14` }]}>
              <MaterialIcons name="verified" size={12} color={semantic.status.success} />
              <KoolaText variant="caption" weight="700" style={{ marginLeft: 4, color: semantic.status.success }}>Đã xác minh</KoolaText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.priceRow}>
            <KoolaText variant="title" weight="800" style={{ color: semantic.text.primary }}>{formatVnd(p.price)}</KoolaText>
            {p.originalPrice ? (
              <KoolaText variant="caption" tone="faint" style={styles.strike}>{formatVnd(p.originalPrice)}</KoolaText>
            ) : null}
          </View>
          {sold || p.deliveryText ? (
            <View style={styles.metaRow}>
              {sold ? <KoolaText variant="caption" tone="muted">{sold}</KoolaText> : null}
              {sold && p.deliveryText ? <View style={styles.dot} /> : null}
              {p.deliveryText ? (
                <View style={styles.metaItem}>
                  <MaterialIcons name="local-shipping" size={14} color={semantic.text.muted} />
                  <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>{p.deliveryText}</KoolaText>
                </View>
              ) : null}
            </View>
          ) : null}
          {p.tags.length > 0 ? (
            <View style={styles.tagRow}>
              {p.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <KoolaText variant="caption" tone="muted" style={styles.tagText}>{tag}</KoolaText>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {p.description ? (
          <View style={styles.section}>
            <KoolaText variant="label" weight="700" style={{ marginBottom: 6 }}>Mô tả</KoolaText>
            <KoolaText variant="body" tone="muted" style={{ lineHeight: 20 }}>{p.description}</KoolaText>
          </View>
        ) : null}

        <View style={styles.section}>
          <KoolaText variant="label" weight="700" style={{ marginBottom: 8 }}>Gian hàng</KoolaText>
          <Pressable
            onPress={handleViewShop}
            style={styles.sellerCard}
            accessibilityRole="button"
            accessibilityLabel={`Xem gian hàng ${p.seller.displayName}`}
            android_ripple={{ color: semantic.border.subtle }}>
            <View style={[styles.sellerAvatar, { backgroundColor: `${accent}16` }]}>
              {p.seller.logoUrl ? (
                <Image source={{ uri: p.seller.logoUrl }} style={styles.sellerLogo} accessible={false} />
              ) : (
                <MaterialIcons name="storefront" size={22} color={accent} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <KoolaText variant="label" weight="800" numberOfLines={1} style={{ flexShrink: 1 }}>{p.seller.displayName}</KoolaText>
                <MaterialIcons name="verified" size={14} color={semantic.status.success} style={{ marginLeft: 6 }} />
              </View>
              {p.seller.province ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <MaterialIcons name="place" size={12} color={semantic.text.faint} />
                  <KoolaText variant="caption" tone="faint" style={{ marginLeft: 4 }}>{p.seller.province}</KoolaText>
                </View>
              ) : null}
            </View>
            <MaterialIcons name="chevron-right" size={20} color={semantic.text.faint} />
          </Pressable>
          <Pressable
            onPress={() => void openSellerChat(p.seller.id)}
            disabled={contacting}
            style={[styles.chatLink, { borderColor: semantic.border.strong, opacity: contacting ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Nhắn tin với ${p.seller.displayName}`}
            android_ripple={{ color: semantic.border.subtle }}>
            <MaterialIcons name="chat-bubble-outline" size={16} color={semantic.text.primary} />
            <KoolaText variant="label" weight="700" style={{ marginLeft: 6 }}>Nhắn tin với shop</KoolaText>
          </Pressable>
          <KoolaText variant="caption" tone="faint" style={{ marginTop: 8, lineHeight: 16 }}>
            Phí ship và thời gian giao do shop báo khi nhắn tin.
          </KoolaText>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable
          onPress={handleAddToCart}
          style={[styles.shopBtn, { borderColor: semantic.border.strong }]}
          accessibilityRole="button"
          accessibilityLabel="Thêm vào giỏ"
          android_ripple={{ color: semantic.border.subtle }}>
          <MaterialIcons name="add-shopping-cart" size={18} color={semantic.text.primary} />
          <KoolaText variant="label" weight="700" style={{ marginLeft: 6 }}>Thêm vào giỏ</KoolaText>
        </Pressable>
        <KoolaButton
          title="Mua ngay"
          icon="shopping-bag"
          variant="primary"
          onPress={handleBuyNow}
          style={styles.chatBtn}
        />
      </View>
    </View>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: string) {
  const shadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm;
  return StyleSheet.create({
    host: { flex: 1, backgroundColor: semantic.bg.canvas },
    notFound: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
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
    scrollContent: { paddingBottom: 24 },
    heroWrap: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    galleryCounter: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: koolaRadii.pill,
    },
    section: {
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    title: { fontSize: 18, lineHeight: 24 },
    shopRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
    verifiedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: koolaRadii.pill,
      marginLeft: 8,
    },
    priceRow: { flexDirection: 'row', alignItems: 'center' },
    strike: { marginLeft: 8, textDecorationLine: 'line-through' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
    metaItem: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: semantic.text.faint, marginHorizontal: 8 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
    tagChip: {
      backgroundColor: semantic.surface.level0,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: koolaRadii.xs,
      marginRight: 6,
      marginBottom: 6,
    },
    tagText: { fontSize: 11, lineHeight: 14 },
    sellerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 12,
      ...shadow,
    },
    sellerAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      overflow: 'hidden',
    },
    sellerLogo: { width: 44, height: 44 },
    chatLink: {
      marginTop: 10,
      height: 44,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level1,
    },
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
      backgroundColor: semantic.surface.level1,
    },
    shopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 44,
      paddingHorizontal: 16,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      backgroundColor: semantic.surface.level1,
      ...shadow,
    },
    chatBtn: { flex: 1 },
  });
}

export default ShoppingProductDetailScreen;
