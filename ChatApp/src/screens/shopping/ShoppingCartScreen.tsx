import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
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
import { useShoppingNavHeader } from '../../navigation/ShoppingHeaderContext';

type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingCart'>;
type Route = RouteProp<ShoppingTabStackParamList, 'ShoppingCart'>;

function parsePriceVnd(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}
function formatVnd(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ';
}

// Mock shipping + payment — user will edit later.
const SHIPPING_FEE = 15000;
const PAYMENT_METHODS = [
  { id: 'cod', label: 'Thanh toán khi nhận hàng (COD)', icon: 'local-shipping' as const, desc: 'Trả tiền mặt khi nhận hàng' },
  { id: 'bank', label: 'Chuyển khoản', icon: 'account-balance' as const, desc: 'Vietcombank • 0123456789 • KOOLA' },
  { id: 'momo', label: 'Ví MoMo / ZaloPay', icon: 'phone-iphone' as const, desc: 'Quét mã QR khi trao đổi với shop' },
];

const ShoppingCartScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const toast = useKoolaToast();
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);

  useShoppingNavHeader('Giỏ hàng', useCallback(() => navigation.goBack(), [navigation]));
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + koolaSpacing.sm;

  // Resolve initial product from params. If none, show 2 mock items so screen is not empty.
  const initialProduct: ShoppingProduct | undefined = useMemo(
    () => (route.params?.productId ? shoppingProducts.find((p) => p.id === route.params!.productId) : undefined),
    [route.params?.productId],
  );

  const fallbackItems = useMemo(() => shoppingProducts.slice(0, 2), []);
  const baseItems: ShoppingProduct[] = initialProduct ? [initialProduct] : fallbackItems;

  const [qtyById, setQtyById] = useState<Record<string, number>>(() =>
    Object.fromEntries(baseItems.map((p) => [p.id, 1])),
  );
  const [selectedPay, setSelectedPay] = useState('cod');
  const [contacting, setContacting] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);

  const seller = baseItems[0]?.seller ?? null;
  const accent = baseItems[0]?.accent ?? semantic.action.primary;

  const subtotal = useMemo(
    () => baseItems.reduce((s, p) => s + parsePriceVnd(p.price) * (qtyById[p.id] ?? 1), 0),
    [baseItems, qtyById],
  );
  const total = subtotal + SHIPPING_FEE;
  const itemCount = useMemo(() => Object.values(qtyById).reduce((a, b) => a + b, 0), [qtyById]);

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
      toast.show(
        status === 404
          ? 'Gian hàng mẫu chưa có tài khoản thật — sẽ kết nối khi backend sẵn sàng.'
          : 'Không thể bắt đầu trò chuyện. Bạn thử lại nhé.',
        status === 404 ? 'info' : 'warning',
      );
    } finally {
      setContacting(false);
    }
  }, [seller, navigation, toast]);

  const handlePlaceOrder = useCallback(async () => {
    // Mock: currently just contact seller; later will be real checkout.
    await handleContactSeller();
  }, [handleContactSeller]);

  const inc = (id: string) => setQtyById((m) => ({ ...m, [id]: Math.min(99, (m[id] ?? 1) + 1) }));
  const dec = (id: string) => setQtyById((m) => ({ ...m, [id]: Math.max(1, (m[id] ?? 1) - 1) }));

  return (
    <View style={styles.host}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: scrollPadTop, paddingBottom: 16 + insets.bottom }]}
        showsVerticalScrollIndicator={false}>

        {/* Seller */}
        {seller ? (
          <View style={styles.sellerCard}>
            <View style={[styles.sellerAvatar, { backgroundColor: `${accent}16`, borderColor: `${accent}28` }]}>
              <MaterialIcons name="storefront" size={20} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <KoolaText variant="label" weight="800" numberOfLines={1} style={{ flexShrink: 1 }}>{seller.name}</KoolaText>
                {seller.verified ? <MaterialIcons name="verified" size={14} color={semantic.status.success} style={{ marginLeft: 6 }} /> : null}
              </View>
              {seller.province ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <MaterialIcons name="place" size={11} color={semantic.text.faint} />
                  <KoolaText variant="caption" tone="faint" style={{ marginLeft: 4 }}>{seller.province}</KoolaText>
                </View>
              ) : null}
            </View>
            <View style={styles.sellerBadge}>
              <KoolaText variant="caption" weight="700" style={{ color: semantic.status.success, fontSize: 11 }}>{itemCount} sản phẩm</KoolaText>
            </View>
          </View>
        ) : null}

        {/* Cart items */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <KoolaText variant="label" weight="800">Sản phẩm</KoolaText>
            <KoolaText variant="caption" tone="muted">{baseItems.length} loại</KoolaText>
          </View>
          {baseItems.map((item) => (
            <CartRow
              key={item.id}
              item={item}
              qty={qtyById[item.id] ?? 1}
              semantic={semantic}
              onInc={() => inc(item.id)}
              onDec={() => dec(item.id)}
            />
          ))}
        </View>

        {/* Delivery */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="local-shipping" size={16} color={semantic.text.muted} />
            <KoolaText variant="label" weight="800" style={{ marginLeft: 6 }}>Giao hàng</KoolaText>
          </View>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <KoolaText variant="caption" weight="700">Giao trong ngày · {baseItems[0]?.delivery ?? 'Thỏa thuận'}</KoolaText>
              <KoolaText variant="caption" tone="faint" style={{ marginTop: 2, lineHeight: 15 }}>
                Phí ship tạm tính {formatVnd(SHIPPING_FEE)} — miễn phí nếu gần bạn (thỏa thuận khi nhắn tin).
              </KoolaText>
            </View>
            <Pressable onPress={() => toast.show('Đổi địa chỉ — đang phát triển', 'info')} style={styles.linkBtn} hitSlop={8}>
              <KoolaText variant="caption" weight="700" style={{ color: semantic.action.primary }}>Đổi</KoolaText>
            </Pressable>
          </View>
          <View style={[styles.addrBox, { backgroundColor: semantic.surface.level0, borderColor: semantic.border.subtle }]}>
            <MaterialIcons name="place" size={14} color={semantic.text.muted} />
            <KoolaText variant="caption" tone="muted" style={{ marginLeft: 6, flex: 1 }}>Địa chỉ giao hàng sẽ được xác nhận khi liên hệ nhà cung cấp.</KoolaText>
          </View>
        </View>

        {/* Payment */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="payments" size={16} color={semantic.text.muted} />
            <KoolaText variant="label" weight="800" style={{ marginLeft: 6 }}>Thanh toán</KoolaText>
            <View style={styles.mockPill}>
              <KoolaText variant="caption" weight="700" style={{ color: semantic.text.muted, fontSize: 10 }}>MOCK</KoolaText>
            </View>
          </View>
          {PAYMENT_METHODS.map((m) => {
            const selected = selectedPay === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => setSelectedPay(m.id)}
                style={[
                  styles.payRow,
                  { borderColor: selected ? semantic.action.primary : semantic.border.subtle, backgroundColor: selected ? `${semantic.action.primary}0A` : 'transparent' },
                ]}>
                <View style={[styles.radio, { borderColor: selected ? semantic.action.primary : semantic.border.strong }]}>
                  {selected ? <View style={[styles.radioDot, { backgroundColor: semantic.action.primary }]} /> : null}
                </View>
                <View style={[styles.payIcon, { backgroundColor: `${semantic.action.primary}12` }]}>
                  <MaterialIcons name={m.icon as never} size={16} color={semantic.action.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <KoolaText variant="caption" weight="700">{m.label}</KoolaText>
                  <KoolaText variant="caption" tone="faint" style={{ marginTop: 1, fontSize: 11 }}>{m.desc}</KoolaText>
                </View>
              </Pressable>
            );
          })}
          <KoolaText variant="caption" tone="faint" style={{ marginTop: 8, lineHeight: 15 }}>
            Đây là luồng mock — thanh toán thực tế được thỏa thuận trực tiếp với nhà cung cấp qua tin nhắn.
          </KoolaText>
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <KoolaText variant="caption" tone="muted">Tạm tính ({itemCount} sp)</KoolaText>
            <KoolaText variant="caption" weight="700">{formatVnd(subtotal)}</KoolaText>
          </View>
          <View style={styles.summaryRow}>
            <KoolaText variant="caption" tone="muted">Phí giao hàng (tạm tính)</KoolaText>
            <KoolaText variant="caption" weight="700">{formatVnd(SHIPPING_FEE)}</KoolaText>
          </View>
          <View style={[styles.divider, { backgroundColor: semantic.border.subtle }]} />
          <View style={styles.summaryRow}>
            <KoolaText variant="label" weight="800">Tổng cộng</KoolaText>
            <KoolaText variant="label" weight="800" style={{ color: semantic.action.primary }}>{formatVnd(total)}</KoolaText>
          </View>
          <Pressable onPress={() => setNoteExpanded((v) => !v)} style={styles.noteToggle} hitSlop={6}>
            <MaterialIcons name={noteExpanded ? 'expand-less' : 'expand-more'} size={16} color={semantic.text.muted} />
            <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>Giá tham khảo — chốt khi trao đổi</KoolaText>
          </Pressable>
          {noteExpanded ? (
            <KoolaText variant="caption" tone="faint" style={{ marginTop: 6, lineHeight: 15 }}>
              App chỉ là nơi trưng bày. Giá, phí ship và thời gian giao do hai bên tự thỏa thuận khi nhắn tin với nhà cung cấp.
            </KoolaText>
          ) : null}
        </View>

        {/* Actions — inline, no sticky dock */}
        <View style={styles.actionsCard}>
          <View style={styles.actionsTotalRow}>
            <KoolaText variant="caption" tone="faint">Tổng · {itemCount} sp</KoolaText>
            <KoolaText variant="label" weight="800" style={{ color: semantic.action.primary }}>{formatVnd(total)}</KoolaText>
          </View>
          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleContactSeller}
              disabled={contacting}
              style={[styles.outlineBtn, { borderColor: semantic.border.strong, opacity: contacting ? 0.6 : 1 }]}
              android_ripple={{ color: semantic.border.subtle }}>
              <MaterialIcons name="chat-bubble-outline" size={18} color={semantic.text.primary} />
              <KoolaText variant="label" weight="700" style={{ marginLeft: 6 }}>Nhắn tin</KoolaText>
            </Pressable>
            <KoolaButton
              title="Xác nhận đặt hàng"
              icon="payments"
              variant="primary"
              loading={contacting}
              disabled={contacting}
              onPress={handlePlaceOrder}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {/* Help */}
        <View style={styles.helpRow}>
          <MaterialIcons name="help-outline" size={14} color={semantic.text.faint} />
          <KoolaText variant="caption" tone="faint" style={{ marginLeft: 6, flex: 1, lineHeight: 15 }}>
            Cần hỗ trợ? Nhấn “Xác nhận đặt hàng” để mở đoạn chat với gian hàng và thống nhất đơn hàng.
          </KoolaText>
        </View>
      </ScrollView>
    </View>
  );
};

const CartRow: React.FC<{
  item: ShoppingProduct;
  qty: number;
  semantic: SemanticTokens;
  onInc: () => void;
  onDec: () => void;
}> = ({ item, qty, semantic, onInc, onDec }) => {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(item.image) && !failed;
  return (
    <View style={[cartRowStyles.row, { borderColor: semantic.border.subtle }]}>
      <View style={[cartRowStyles.thumb, { backgroundColor: `${item.accent}14` }]}>
        {showImage ? (
          <Image source={item.image as ImageSourcePropType} style={cartRowStyles.image} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <MaterialIcons name={item.icon as never} size={28} color={item.accent} />
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <KoolaText variant="caption" weight="700" numberOfLines={2} style={{ lineHeight: 16 }}>{item.title}</KoolaText>
        <KoolaText variant="caption" tone="faint" numberOfLines={1} style={{ marginTop: 2, fontSize: 11 }}>{item.shop}</KoolaText>
        <KoolaText variant="label" weight="800" style={{ marginTop: 4, color: semantic.text.primary }}>{item.price}</KoolaText>
      </View>
      <View style={[cartRowStyles.stepper, { borderColor: semantic.border.subtle, backgroundColor: semantic.surface.level0 }]}>
        <Pressable onPress={onDec} hitSlop={8} style={cartRowStyles.stepBtn} android_ripple={{ color: semantic.border.subtle }}>
          <MaterialIcons name="remove" size={16} color={semantic.text.primary} />
        </Pressable>
        <KoolaText variant="label" weight="800" style={cartRowStyles.qty}>{qty}</KoolaText>
        <Pressable onPress={onInc} hitSlop={8} style={cartRowStyles.stepBtn} android_ripple={{ color: semantic.border.subtle }}>
          <MaterialIcons name="add" size={16} color={semantic.text.primary} />
        </Pressable>
      </View>
    </View>
  );
};

const cartRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, overflow: 'hidden', marginLeft: 8 },
  stepBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 22, textAlign: 'center' },
});

function makeStyles(semantic: SemanticTokens, scheme: string) {
  const shadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm;
  return StyleSheet.create({
    host: { flex: 1, backgroundColor: 'transparent' },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 12 },
    sellerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 12,
      marginBottom: 10,
      ...shadow,
    },
    sellerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginRight: 10 },
    sellerBadge: { backgroundColor: `${semantic.status.success}14`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    card: {
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 12,
      marginBottom: 10,
      ...shadow,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    mockPill: { marginLeft: 8, backgroundColor: semantic.surface.level0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
    rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    linkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    addrBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
    payRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8, gap: 10 },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 8, height: 8, borderRadius: 4 },
    payIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
    noteToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    helpRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4, marginTop: 4 },
    actionsCard: {
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 12,
      marginTop: 2,
      marginBottom: 10,
      ...shadow,
    },
    actionsTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    outlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 44,
      paddingHorizontal: 14,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      backgroundColor: semantic.surface.level1,
      ...shadow,
    },
  });
}

export default ShoppingCartScreen;
