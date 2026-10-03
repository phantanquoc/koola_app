import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { useShoppingNavHeader } from '../../navigation/ShoppingHeaderContext';
import type { ShoppingTabStackParamList } from '../../navigation/types';
import { commerceApi, type CommerceOrderPayment } from '../../services/api/apiService';
import { cartStore, type CartGroup } from '../../services/shopping/cartStore';
import { useCart } from '../../services/shopping/useCart';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { formatVnd } from '../../utils/formatVnd';
import { KoolaButton, KoolaText, koolaRadii, useTheme, useKoolaToast } from '../../ui';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

type RoutePropT = RouteProp<ShoppingTabStackParamList, 'ShoppingCheckout'>;
type NavProp = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingCheckout'>;

function newIdempotencyKey(): string {
  try {
    const c: unknown = globalThis.crypto;
    if (c && typeof (c as { randomUUID?: unknown }).randomUUID === 'function') {
      return (c as { randomUUID(): string }).randomUUID();
    }
  } catch {}
  // fallback — uuid v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const ShoppingCheckoutScreen: React.FC = () => {
  const route = useRoute<RoutePropT>();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const toast = useKoolaToast();
  const sellerId = route.params.sellerId;

  useShoppingNavHeader('Đặt hàng', useCallback(() => navigation.goBack(), [navigation]));
  const padTop = getNotchHeaderHeight(insets.top, 'nav') + 12;

  const { groups } = useCart();
  const group: CartGroup | undefined = useMemo(() => groups.find((g) => g.seller.id === sellerId), [groups, sellerId]);

  const [validating, setValidating] = useState(false);
  const [validateErr, setValidateErr] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<CommerceOrderPayment>('cod');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyRef = useRef<string>(newIdempotencyKey());
  const { isConnected } = useNetworkStatus();
  const online = isConnected !== false;

  // Prefill per-account buyer info
  useEffect(() => {
    const last = cartStore.getLastBuyerInfo();
    if (last) {
      setName(last.name);
      setPhone(last.phone);
      setAddress(last.address);
      setNote(last.note ?? '');
    }
  }, []);

  // Revalidate this seller's lines on mount
  const revalidate = useCallback(async () => {
    const ids = (group?.lines ?? cartStore.getLines().filter((l) => l.snapshot.seller.id === sellerId)).map((l) => l.productId);
    if (ids.length === 0) return;
    setValidating(true);
    setValidateErr(false);
    try {
      const res = await commerceApi.validate(ids);
      cartStore.applyValidation(res);
    } catch {
      setValidateErr(true);
    } finally {
      setValidating(false);
    }
  }, [group, sellerId]);

  useFocusEffect(useCallback(() => { void revalidate(); }, [revalidate]));

  const availableLines = useMemo(() => (group?.lines ?? []).filter((l) => l.available), [group]);
  const subtotal = useMemo(() => availableLines.reduce((s, l) => s + l.snapshot.price * l.quantity, 0), [availableLines]);
  const canSubmit = !submitting && online && availableLines.length > 0 && name.trim() && phone.trim() && address.trim();

  const onSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    if (!online) {
      toast.show('Bạn đang ngoại tuyến — không thể đặt hàng.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        sellerId,
        items: availableLines.map((l) => ({ productId: l.productId, qty: l.quantity })),
        buyerInfo: { name: name.trim(), phone: phone.trim(), address: address.trim(), note: note.trim() || undefined },
        payment,
        idempotencyKey: idempotencyRef.current,
      };
      const res = await commerceApi.placeOrder(payload);
      cartStore.setLastBuyerInfo({ name: payload.buyerInfo.name, phone: payload.buyerInfo.phone, address: payload.buyerInfo.address, note: payload.buyerInfo.note });
      cartStore.removeSellerLines(sellerId);
      const code = (res.order as { orderCode?: string })?.orderCode ?? '';
      toast.show(code ? `Đã gửi đơn #${code}` : 'Đã gửi đơn', 'success');
      // Navigate to conversation
      (navigation as unknown as { navigate: (a: string, b: unknown) => void }).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId: res.conversationId },
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (e as { message?: string })?.message ?? 'Đặt hàng thất bại';
      Alert.alert('Lỗi', String(msg));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, online, sellerId, availableLines, name, phone, address, note, payment, navigation, toast]);

  if (!group || availableLines.length === 0) {
    return (
      <View style={[styles.host, { backgroundColor: 'transparent', paddingTop: padTop, paddingHorizontal: 16 }]}>
        <KoolaText tone="muted">Giỏ của shop này trống hoặc sản phẩm không còn bán.</KoolaText>
        <KoolaButton title="Quay lại giỏ hàng" onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <ScrollView contentContainerStyle={{ paddingTop: padTop, paddingBottom: 24 + insets.bottom, paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
        {/* Seller header */}
        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <KoolaText weight="800">{group.seller.displayName}</KoolaText>
          <KoolaText variant="caption" tone="muted">{availableLines.length} loại · {availableLines.reduce((n, l) => n + l.quantity, 0)} sản phẩm</KoolaText>
        </View>

        {/* Items */}
        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          {availableLines.map((l) => (
            <View key={l.productId} style={styles.itemRow}>
              <KoolaText variant="caption" weight="700" style={{ flex: 1 }} numberOfLines={2}>{l.snapshot.name} × {l.quantity}</KoolaText>
              <KoolaText variant="caption" weight="800">{formatVnd(l.snapshot.price * l.quantity)}</KoolaText>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: tokens.semantic.border.subtle }]} />
          <View style={styles.rowBetween}><KoolaText variant="caption" tone="muted">Tạm tính</KoolaText><KoolaText weight="800">{formatVnd(subtotal)}</KoolaText></View>
          <View style={styles.rowBetween}><KoolaText variant="caption" tone="muted">Phí ship: shop sẽ báo</KoolaText></View>
          {validateErr ? <KoolaText variant="caption" tone="faint" style={{ marginTop: 6 }}>Chưa cập nhật được giá mới nhất</KoolaText> : null}
          {validating ? <KoolaText variant="caption" tone="faint" style={{ marginTop: 4 }}>Đang kiểm tra giá...</KoolaText> : null}
        </View>

        {/* Buyer form */}
        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <KoolaText weight="800" style={{ marginBottom: 10 }}>Thông tin nhận hàng</KoolaText>
          <Field label="Họ tên" value={name} onChangeText={setName} placeholder="Nguyễn Văn A" />
          <Field label="Số điện thoại" value={phone} onChangeText={setPhone} placeholder="09..." keyboardType="phone-pad" />
          <Field label="Địa chỉ" value={address} onChangeText={setAddress} placeholder="Số nhà, đường, phường/xã..." multiline />
          <Field label="Ghi chú (tuỳ chọn)" value={note} onChangeText={setNote} placeholder="Giao giờ hành chính..." multiline />
        </View>

        {/* Payment */}
        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <KoolaText weight="800" style={{ marginBottom: 10 }}>Thanh toán</KoolaText>
          <RadioRow label="Thanh toán khi nhận hàng (COD)" selected={payment === 'cod'} onPress={() => setPayment('cod')} />
          <RadioRow label="Chuyển khoản" selected={payment === 'bank'} onPress={() => setPayment('bank')} />
        </View>

        {!online ? <KoolaText variant="caption" tone="faint" style={{ textAlign: 'center', marginBottom: 8 }}>Bạn đang ngoại tuyến — không thể đặt hàng</KoolaText> : null}

        <KoolaButton
          title={submitting ? 'Đang gửi...' : `Đặt hàng · ${formatVnd(subtotal)}`}
          onPress={onSubmit}
          disabled={!canSubmit}
          loading={submitting}
          accessibilityLabel="Đặt hàng"
        />
      </ScrollView>
    </View>
  );
};

const Field: React.FC<{ label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; keyboardType?: 'default' | 'phone-pad'; multiline?: boolean }> = ({ label, value, onChangeText, placeholder, keyboardType, multiline }) => {
  const { tokens } = useTheme();
  return (
    <View style={{ marginBottom: 10 }}>
      <KoolaText variant="caption" weight="700" style={{ marginBottom: 6 }}>{label}</KoolaText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.semantic.text.faint}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary, backgroundColor: tokens.semantic.surface.level0 }]}
      />
    </View>
  );
};

const RadioRow: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({ label, selected, onPress }) => {
  const { tokens } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.radioRow, { borderColor: selected ? tokens.semantic.action.primary : tokens.semantic.border.subtle, backgroundColor: selected ? `${tokens.semantic.action.primary}12` : 'transparent' }]}>
      <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={selected ? tokens.semantic.action.primary : tokens.semantic.text.muted} />
      <KoolaText variant="label" weight={selected ? '700' : '500'} style={{ marginLeft: 8 }}>{label}</KoolaText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: koolaRadii.md, padding: 12, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  radioRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
});

export default ShoppingCheckoutScreen;
