import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
  KoolaEmptyState,
  KoolaText,
  koolaRadii,
  koolaShadows,
  koolaDarkShadows,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { ShoppingTabStackParamList } from '../../navigation/types';
import { commerceApi } from '../../services/api/apiService';
import { cartStore, CART_MAX_QTY, type CartGroup, type CartLine } from '../../services/shopping/cartStore';
import { useCart } from '../../services/shopping/useCart';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { useShoppingNavHeader } from '../../navigation/ShoppingHeaderContext';
import { formatVnd } from '../../utils/formatVnd';
import { useSellerChat } from './hooks/useSellerChat'; // kept for reference, no longer used in cart groups

/**
 * Cart (commerce-catalog D11–D13).
 *
 * - Lines come from the shared, device-persisted cart store, grouped by seller.
 * - On focus (and when connectivity returns while focused) all line ids are
 *   revalidated via POST /commerce/products/validate: unavailable lines are
 *   greyed and excluded from totals; changed prices show "old → new" and the
 *   new price is persisted into the snapshot.
 * - If validation fails the stored snapshots are shown with a notice.
 * - Shipping is "Phí ship: shop sẽ báo" — no hardcoded fee, no MOCK label, no
 *   payment selection (that moves to the `commerce-orders` checkout).
 * - INTERIM (until commerce-orders ships): each group's action is
 *   "Nhắn tin với shop" — opens the direct chat only; it creates no order,
 *   does not clear the cart and shows no success feedback.
 */

type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingCart'>;

type ValidationState = 'idle' | 'validating' | 'fresh' | 'stale';

const ShoppingCartScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);

  useShoppingNavHeader('Giỏ hàng', useCallback(() => navigation.goBack(), [navigation]));
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + koolaSpacing.sm;

  const { lines, groups, totalQuantity } = useCart();
  const [validation, setValidation] = useState<ValidationState>('idle');
  // Fresh presigned thumbnails from the last successful validation.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const focusedRef = useRef(false);
  const seqRef = useRef(0);

  const revalidate = useCallback(async () => {
    const ids = cartStore.getLines().map((l) => l.productId);
    if (ids.length === 0) {
      setValidation('fresh');
      return;
    }
    const seq = ++seqRef.current;
    setValidation('validating');
    try {
      const results = await commerceApi.validate(ids);
      if (seq !== seqRef.current) return;
      cartStore.applyValidation(results);
      setImageUrls(() => {
        const next: Record<string, string> = {};
        for (const r of results) if (r.available && r.imageUrl) next[r.id] = r.imageUrl;
        return next;
      });
      setValidation('fresh');
    } catch {
      if (seq !== seqRef.current) return;
      setValidation('stale');
    }
  }, []);

  // Revalidate every time the cart screen gains focus. On blur, the
  // "Giá đã thay đổi" notices the user has now seen are dismissed so they do
  // not linger on every later visit (the new price itself stays persisted).
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      void revalidate();
      return () => {
        focusedRef.current = false;
        for (const l of cartStore.getLines()) {
          if (l.previousPrice !== null) cartStore.acknowledgePriceChange(l.productId);
        }
      };
    }, [revalidate]),
  );

  // …and when connectivity returns while the cart is open.
  useNetworkStatus({
    onConnectivityChange: (connected) => {
      if (connected && focusedRef.current) void revalidate();
    },
  });

  const unavailableCount = lines.filter((l) => !l.available).length;
  const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const availableQty = groups.reduce((s, g) => s + g.itemCount, 0);

  if (lines.length === 0) {
    return (
      <View style={styles.host}>
        <View style={[styles.emptyHost, { paddingTop: scrollPadTop }]}>
          <KoolaEmptyState
            icon="shopping-cart"
            title="Giỏ hàng trống"
            message="Thêm sản phẩm từ cửa hàng để bắt đầu."
            actionLabel="Tiếp tục mua sắm"
            onActionPress={() => navigation.navigate('ShoppingHome')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.host}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: scrollPadTop, paddingBottom: 16 + insets.bottom }]}
        showsVerticalScrollIndicator={false}>

        {validation === 'stale' ? (
          <View
            style={[styles.notice, { backgroundColor: `${semantic.status.warning}14`, borderColor: `${semantic.status.warning}40` }]}
            accessibilityRole="alert">
            <MaterialIcons name="cloud-off" size={16} color={semantic.status.warning} />
            <KoolaText variant="caption" weight="700" style={{ marginLeft: 8, flex: 1 }}>
              Chưa cập nhật được giá mới nhất
            </KoolaText>
            <Pressable onPress={() => void revalidate()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Thử cập nhật giá lại" style={styles.noticeAction}>
              <KoolaText variant="caption" weight="800" tone="primary">Thử lại</KoolaText>
            </Pressable>
          </View>
        ) : null}

        {groups.map((group) => (
          <SellerGroup
            key={group.seller.id}
            group={group}
            imageUrls={imageUrls}
            semantic={semantic}
            styles={styles}
            onCheckout={() => navigation.navigate('ShoppingCheckout', { sellerId: group.seller.id })}
            onOpenProduct={(id) => navigation.navigate('ShoppingProductDetail', { productId: id })}
          />
        ))}

        {/* Summary — totals exclude unavailable lines; no shipping fee is added. */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <KoolaText variant="caption" tone="muted">Tạm tính ({availableQty} sp)</KoolaText>
            <KoolaText variant="label" weight="800" style={{ color: semantic.action.primary }}>{formatVnd(grandTotal)}</KoolaText>
          </View>
          <KoolaText variant="caption" tone="faint" style={{ marginTop: 4, lineHeight: 15 }}>
            Chưa gồm phí ship — mỗi shop sẽ báo phí khi bạn nhắn tin.
            {unavailableCount > 0 ? ` ${unavailableCount} sản phẩm không còn bán không được tính.` : ''}
          </KoolaText>
          <KoolaText variant="caption" tone="faint" style={{ marginTop: 6 }}>
            {totalQuantity} sản phẩm trong giỏ
          </KoolaText>
        </View>
      </ScrollView>
    </View>
  );
};

const SellerGroup: React.FC<{
  group: CartGroup;
  imageUrls: Record<string, string>;
  semantic: SemanticTokens;
  styles: ReturnType<typeof makeStyles>;
  onCheckout: () => void;
  onOpenProduct: (productId: string) => void;
}> = ({ group, imageUrls, semantic, styles, onCheckout, onOpenProduct }) => {
  const accent = semantic.action.primary;
  return (
    <View style={styles.card}>
      <View style={styles.groupHeader}>
        <View style={[styles.sellerAvatar, { backgroundColor: `${accent}16`, borderColor: `${accent}28` }]}>
          <MaterialIcons name="storefront" size={18} color={accent} />
        </View>
        <KoolaText variant="label" weight="800" numberOfLines={1} style={{ flex: 1 }}>
          {group.seller.displayName}
        </KoolaText>
        <MaterialIcons name="verified" size={14} color={semantic.status.success} accessibilityLabel="Đã xác minh" />
      </View>

      {group.lines.map((line) => (
        <CartRow
          key={line.productId}
          line={line}
          imageUrl={imageUrls[line.productId] ?? null}
          semantic={semantic}
          onOpen={() => onOpenProduct(line.productId)}
        />
      ))}

      <View style={[styles.groupFooter, { borderColor: semantic.border.subtle }]}>
        <View style={styles.summaryRow}>
          <KoolaText variant="caption" tone="muted">Tạm tính shop</KoolaText>
          <KoolaText variant="label" weight="800">{formatVnd(group.subtotal)}</KoolaText>
        </View>
        <View style={styles.summaryRow}>
          <KoolaText variant="caption" tone="muted">Phí ship: shop sẽ báo</KoolaText>
        </View>
        <KoolaButton
          title="Đặt hàng"
          icon="receipt-long"
          variant="primary"
          onPress={onCheckout}
          disabled={group.itemCount === 0}
          style={{ marginTop: 10 }}
          accessibilityLabel={`Đặt hàng từ ${group.seller.displayName}`}
        />
      </View>
    </View>
  );
};

const CartRow: React.FC<{
  line: CartLine;
  imageUrl: string | null;
  semantic: SemanticTokens;
  onOpen: () => void;
}> = ({ line, imageUrl, semantic, onOpen }) => {
  const [failed, setFailed] = useState(false);
  const showImage = !!imageUrl && !failed && line.available;
  const { productId, quantity, snapshot, available, previousPrice } = line;
  const accent = semantic.action.primary;

  return (
    <View
      style={[cartRowStyles.row, { borderColor: semantic.border.subtle }, !available && cartRowStyles.unavailable]}
      accessibilityState={{ disabled: !available }}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Xem ${snapshot.name}`} style={cartRowStyles.main}>
        <View style={[cartRowStyles.thumb, { backgroundColor: `${accent}14` }]}>
          {showImage ? (
            <Image source={{ uri: imageUrl as string }} style={cartRowStyles.image} resizeMode="cover" onError={() => setFailed(true)} accessible={false} />
          ) : (
            <MaterialIcons name="shopping-bag" size={26} color={accent} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <KoolaText variant="caption" weight="700" numberOfLines={2} style={{ lineHeight: 16 }}>{snapshot.name}</KoolaText>
          {available ? (
            <KoolaText variant="label" weight="800" style={{ marginTop: 4, color: semantic.text.primary }}>
              {formatVnd(snapshot.price)}
            </KoolaText>
          ) : (
            <KoolaText variant="caption" weight="700" style={{ marginTop: 4, color: semantic.status.danger }}>
              Sản phẩm không còn bán
            </KoolaText>
          )}
          {available && previousPrice !== null && previousPrice !== snapshot.price ? (
            <KoolaText variant="caption" weight="700" style={{ marginTop: 2, color: semantic.status.warning }} accessibilityLiveRegion="polite">
              Giá đã thay đổi: {formatVnd(previousPrice)} → {formatVnd(snapshot.price)}
            </KoolaText>
          ) : null}
        </View>
      </Pressable>
      <View style={cartRowStyles.actions}>
        {available ? (
          <View style={[cartRowStyles.stepper, { borderColor: semantic.border.subtle, backgroundColor: semantic.surface.level0 }]}>
            <Pressable
              onPress={() => (quantity <= 1 ? cartStore.remove(productId) : cartStore.setQty(productId, quantity - 1))}
              hitSlop={6}
              style={cartRowStyles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel={quantity <= 1 ? `Bỏ ${snapshot.name} khỏi giỏ` : `Giảm số lượng ${snapshot.name}`}
              android_ripple={{ color: semantic.border.subtle }}>
              <MaterialIcons name={quantity <= 1 ? 'delete-outline' : 'remove'} size={16} color={semantic.text.primary} />
            </Pressable>
            <KoolaText variant="label" weight="800" style={cartRowStyles.qty} accessibilityLabel={`Số lượng ${quantity}`}>{quantity}</KoolaText>
            <Pressable
              onPress={() => cartStore.setQty(productId, quantity + 1)}
              disabled={quantity >= CART_MAX_QTY}
              hitSlop={6}
              style={[cartRowStyles.stepBtn, quantity >= CART_MAX_QTY && { opacity: 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel={`Tăng số lượng ${snapshot.name}`}
              android_ripple={{ color: semantic.border.subtle }}>
              <MaterialIcons name="add" size={16} color={semantic.text.primary} />
            </Pressable>
          </View>
        ) : null}
        <Pressable
          onPress={() => cartStore.remove(productId)}
          hitSlop={6}
          style={cartRowStyles.removeBtn}
          accessibilityRole="button"
          accessibilityLabel={`Xóa ${snapshot.name} khỏi giỏ`}>
          <KoolaText variant="caption" weight="700" tone="muted">Xóa</KoolaText>
        </Pressable>
      </View>
    </View>
  );
};

const cartRowStyles = StyleSheet.create({
  row: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  unavailable: { opacity: 0.55 },
  main: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 26, textAlign: 'center' },
  removeBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 },
});

function makeStyles(semantic: SemanticTokens, scheme: string) {
  const shadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm;
  return StyleSheet.create({
    host: { flex: 1, backgroundColor: 'transparent' },
    emptyHost: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 12 },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: koolaRadii.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 10,
    },
    noticeAction: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
    card: {
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 12,
      marginBottom: 10,
      ...shadow,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    sellerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    groupFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 2 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  });
}

export default ShoppingCartScreen;
