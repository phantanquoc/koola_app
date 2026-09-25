import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
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

type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingProductDetail'>;
type Route = RouteProp<ShoppingTabStackParamList, 'ShoppingProductDetail'>;

const ShoppingProductDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const toast = useKoolaToast();
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);

  // product header is set after product is resolved (below)

  const product: ShoppingProduct | undefined = useMemo(
    () => shoppingProducts.find((p) => p.id === route.params.productId),
    [route.params.productId],
  );

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
    shopName: product?.shop ?? 'Chi tiết sản phẩm',
    onBack: useCallback(() => navigation.goBack(), [navigation]),
    onShare: handleShare,
    onCart: handleCart,
    onSearch: handleSearch,
  });

  const [imageFailed, setImageFailed] = useState(false);
  const [contacting, setContacting] = useState(false);

  // NotchHeader is rendered by ShoppingTabStack as a fixed sibling above the
  // stack (zIndex 10). Content starts right below it — same pattern as
  // UpgradeScreen / SettingsDetailScreen in PersonalTab.
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + koolaSpacing.sm;

  const handleContactSeller = useCallback(async () => {
    if (!product) return;
    setContacting(true);
    try {
      const { conversation } = await conversationsApi.startDirectChat(product.seller.id);
      (navigation as unknown as { navigate: (a: string, b: unknown) => void }).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId: conversation._id },
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg =
        status === 404
          ? 'Gian hang mau chua co tai khoan that — se ket noi khi backend san sang. Ban co the nhan tin qua tab Ket noi.'
          : 'Khong the bat dau tro chuyen. Ban thu lai nhe.';
      toast.show(msg, status === 404 ? 'info' : 'warning');
    } finally {
      setContacting(false);
    }
  }, [product, navigation, toast]);

  const handleViewShop = useCallback(() => {
    if (!product) return;
    (navigation.navigate as unknown as (name: string, params: unknown) => void)('ShoppingStorefront', { sellerId: product.seller.id });
  }, [product, navigation]);

  if (!product) {
    return (
      <View style={styles.host}>
        <ScrollView contentContainerStyle={[styles.notFound, { paddingTop: scrollPadTop }]}>
          <MaterialIcons name="search-off" size={40} color={semantic.text.faint} />
          <KoolaText tone="muted" style={{ marginTop: 12 }}>Khong tim thay san pham</KoolaText>
        </ScrollView>
      </View>
    );
  }

  const showImage = Boolean(product.image) && !imageFailed;

  return (
    <View style={styles.host}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: scrollPadTop, paddingBottom: 16 + 64 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}>

        <View style={[styles.heroWrap, { backgroundColor: `${product.accent}14` }]}>
          {showImage ? (
            <Image
              source={product.image as ImageSourcePropType}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MaterialIcons name={product.icon as never} size={72} color={product.accent} />
          )}
          {product.badge ? (
            <View style={styles.heroBadge}>
              <KoolaText variant="caption" weight="800" tone="surface">{product.badge}</KoolaText>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <KoolaText variant="heading" weight="800" style={styles.title}>{product.title}</KoolaText>
          <View style={styles.shopRow}>
            <MaterialIcons name="storefront" size={14} color={semantic.text.muted} />
            <KoolaText variant="caption" tone="muted" style={{ marginLeft: 6 }}>{product.shop}</KoolaText>
            {product.seller.verified ? (
              <View style={[styles.verifiedPill, { backgroundColor: `${semantic.status.success}14` }]}>
                <MaterialIcons name="verified" size={12} color={semantic.status.success} />
                <KoolaText variant="caption" weight="700" style={{ marginLeft: 4, color: semantic.status.success }}>Da xac minh</KoolaText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.priceRow}>
            <KoolaText variant="title" weight="800" style={{ color: semantic.text.primary }}>{product.price}</KoolaText>
            {product.originalPrice ? (
              <KoolaText variant="caption" tone="faint" style={styles.strike}>{product.originalPrice}</KoolaText>
            ) : null}
          </View>
          <KoolaText variant="caption" tone="faint" style={{ marginTop: 4 }}>Gia tham khao · thoa thuan khi trao doi</KoolaText>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialIcons name="star" size={14} color={semantic.status.warning} />
              <KoolaText variant="caption" weight="700" style={{ marginLeft: 4 }}>{product.rating}</KoolaText>
              <KoolaText variant="caption" tone="muted"> · {product.sold} da quan tam</KoolaText>
            </View>
            <View style={styles.dot} />
            <KoolaText variant="caption" tone="muted">{product.delivery}</KoolaText>
          </View>
          <View style={styles.tagRow}>
            {product.tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <KoolaText variant="caption" tone="muted" style={styles.tagText}>{tag}</KoolaText>
              </View>
            ))}
          </View>
        </View>

        {product.description ? (
          <View style={styles.section}>
            <KoolaText variant="label" weight="700" style={{ marginBottom: 6 }}>Mo ta</KoolaText>
            <KoolaText variant="body" tone="muted" style={{ lineHeight: 20 }}>{product.description}</KoolaText>
          </View>
        ) : null}

        <View style={styles.section}>
          <KoolaText variant="label" weight="700" style={{ marginBottom: 8 }}>Gian hang</KoolaText>
          <Pressable onPress={handleViewShop} style={styles.sellerCard} android_ripple={{ color: semantic.border.subtle }}>
            <View style={[styles.sellerAvatar, { backgroundColor: `${product.accent}16` }]}>
              <MaterialIcons name="storefront" size={22} color={product.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <KoolaText variant="label" weight="800" numberOfLines={1} style={{ flexShrink: 1 }}>{product.seller.name}</KoolaText>
                {product.seller.verified ? (
                  <MaterialIcons name="verified" size={14} color={semantic.status.success} style={{ marginLeft: 6 }} />
                ) : null}
              </View>
              {product.seller.province ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <MaterialIcons name="place" size={12} color={semantic.text.faint} />
                  <KoolaText variant="caption" tone="faint" style={{ marginLeft: 4 }}>{product.seller.province}</KoolaText>
                </View>
              ) : null}
            </View>
            <MaterialIcons name="chevron-right" size={20} color={semantic.text.faint} />
          </Pressable>
          <KoolaText variant="caption" tone="faint" style={{ marginTop: 8, lineHeight: 16 }}>
            App chi la noi trung bay — gia va giao nhan do hai ben tu thoa thuan khi nhan tin.
          </KoolaText>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable
          onPress={handleViewShop}
          style={[styles.shopBtn, { borderColor: semantic.border.strong }]}
          android_ripple={{ color: semantic.border.subtle }}>
          <MaterialIcons name="storefront" size={18} color={semantic.text.primary} />
          <KoolaText variant="label" weight="700" style={{ marginLeft: 6 }}>Xem gian hang</KoolaText>
        </Pressable>
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

function makeStyles(semantic: SemanticTokens, scheme: string) {
  const shadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm;
  return StyleSheet.create({
    host: { flex: 1, backgroundColor: 'transparent' },
    notFound: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 24 },
    heroWrap: {
      width: '100%',
      aspectRatio: 1.4,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    heroImage: { width: '100%', height: '100%' },
    heroBadge: {
      position: 'absolute',
      left: 12,
      top: 12,
      backgroundColor: 'rgba(0,0,0,0.72)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: koolaRadii.xs,
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
      backgroundColor: 'transparent',
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
