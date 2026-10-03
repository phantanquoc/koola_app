import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PersonalTabStackParamList } from '../../../navigation/types';
import { usePersonalNavHeader } from '../../../navigation/PersonalHeaderContext';
import { getNotchHeaderHeight } from '../../../components/NotchHeader';
import { commerceApi, type CommerceOrder, type CommerceOrderStatus } from '../../../services/api/apiService';
import { formatVnd } from '../../../utils/formatVnd';
import { KoolaButton, KoolaSheet, KoolaText, koolaRadii, useTheme } from '../../../ui';

type RouteT = RouteProp<PersonalTabStackParamList, 'PersonalOrderDetail'>;
type NavT = NativeStackNavigationProp<PersonalTabStackParamList, 'PersonalOrderDetail'>;

const CARRIER_LINKS: Record<string, string> = {
  GHN: 'https://donhang.ghn.vn/?order_code=',
  GHTK: 'https://ghtk.vn/don-hang/',
  VTP: 'https://viettelpost.com.vn/tra-cuu-hanh-trinh-don?code=',
};

const PersonalOrderDetailScreen: React.FC = () => {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  usePersonalNavHeader('Chi tiết đơn', useCallback(() => navigation.goBack(), [navigation]));
  const padTop = getNotchHeaderHeight(insets.top, 'nav') + 12;
  const orderId = route.params.orderId;

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [imageUrls, setImageUrls] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'cancel' | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await commerceApi.getOrder(orderId);
      setOrder(res.order as CommerceOrder);
      setImageUrls(res.itemImageUrls ?? []);
    } catch {}
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const doCancel = async () => {
    setBusy(true);
    try { await commerceApi.cancelOrder(orderId); await load(); setSheet(null); } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể huỷ'); }
    setBusy(false);
  };
  const doReceive = async () => {
    Alert.alert('Xác nhận', 'Xác nhận đã nhận hàng?', [{ text: 'Huỷ', style: 'cancel' }, { text: 'Đã nhận', onPress: async () => { setBusy(true); try { await commerceApi.receiveOrder(orderId); await load(); } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Thất bại'); } setBusy(false); } }]);
  };

  if (!order) return <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas, paddingTop: padTop }]}><KoolaText tone="muted" style={{ textAlign: 'center', marginTop: 24 }}>Đang tải...</KoolaText></View>;

  const canCancel = order.status === 'PENDING' || order.status === 'CONFIRMED';
  const canReceive = order.status === 'SHIPPING';
  const tLink = order.shipping.trackingCode ? (CARRIER_LINKS[order.shipping.carrier ?? ''] ? CARRIER_LINKS[order.shipping.carrier!] + encodeURIComponent(order.shipping.trackingCode) : null) : null;

  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <ScrollView contentContainerStyle={{ paddingTop: padTop, paddingBottom: 24 + insets.bottom, paddingHorizontal: 12 }}>
        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <View style={styles.rowBetween}><KoolaText weight="800">#{order.orderCode}</KoolaText><KoolaText weight="700">{order.status}</KoolaText></View>
          <KoolaText variant="caption" tone="muted">{new Date(order.createdAt ?? '').toLocaleString('vi-VN')}</KoolaText>
          {order.shipping.trackingCode ? <View style={{ marginTop: 6 }}><KoolaText variant="caption">{order.shipping.carrier} · {order.shipping.trackingCode}</KoolaText>{tLink ? <KoolaText variant="caption" tone="primary" onPress={() => Linking.openURL(tLink)}>Tra cứu vận đơn</KoolaText> : null}</View> : null}
          {order.shipping.fee !== null ? <KoolaText variant="caption" style={{ marginTop: 4 }}>Phí ship: {formatVnd(order.shipping.fee)}</KoolaText> : null}
          {order.shipping.expectedDeliveryDate ? <KoolaText variant="caption" tone="muted">Dự kiến giao: {new Date(order.shipping.expectedDeliveryDate).toLocaleDateString('vi-VN')}</KoolaText> : null}
        </View>

        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          {order.items.map((it, idx) => (
            <View key={it.productId} style={styles.itemRow}>
              <KoolaText variant="caption" weight="700" style={{ flex: 1 }} numberOfLines={2}>{it.name} × {it.qty}</KoolaText>
              <KoolaText variant="caption" weight="800">{formatVnd(it.price * it.qty)}</KoolaText>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: tokens.semantic.border.subtle }]} />
          <View style={styles.rowBetween}><KoolaText variant="caption" tone="muted">Tạm tính</KoolaText><KoolaText weight="800">{formatVnd(order.subtotal)}</KoolaText></View>
          <View style={styles.rowBetween}><KoolaText variant="caption" tone="muted">Tổng</KoolaText><KoolaText weight="800">{formatVnd(order.total)}</KoolaText></View>
        </View>

        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <KoolaText weight="700" style={{ marginBottom: 6 }}>Người nhận</KoolaText>
          <KoolaText variant="caption">{order.buyerInfo.name} · {order.buyerInfo.phone}</KoolaText>
          <KoolaText variant="caption" tone="muted">{order.buyerInfo.address}</KoolaText>
          {order.buyerInfo.note ? <KoolaText variant="caption" tone="faint">Ghi chú: {order.buyerInfo.note}</KoolaText> : null}
          <KoolaText variant="caption" tone="faint" style={{ marginTop: 6 }}>Thanh toán: {order.payment === 'cod' ? 'COD' : 'Chuyển khoản'}</KoolaText>
        </View>

        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <KoolaText weight="700" style={{ marginBottom: 6 }}>Lịch sử</KoolaText>
          {order.statusHistory.map((h, i) => (
            <View key={i} style={styles.timelineRow}><KoolaText variant="caption" weight="700">{h.status}</KoolaText><KoolaText variant="caption" tone="faint">{new Date(h.at).toLocaleString('vi-VN')}{h.note ? ` · ${h.note}` : ''}</KoolaText></View>
          ))}
        </View>

        <View style={{ gap: 8, marginTop: 4 }}>
          {canReceive ? <KoolaButton title="Đã nhận hàng" onPress={doReceive} disabled={busy} loading={busy} /> : null}
          {canCancel ? <KoolaButton title="Huỷ đơn" variant="ghost" onPress={() => setSheet('cancel')} disabled={busy} /> : null}
        </View>
      </ScrollView>

      {sheet === 'cancel' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Huỷ đơn</KoolaText>
            <KoolaText variant="caption" tone="muted" style={{ marginBottom: 8 }}>Bạn chắc chắn muốn huỷ đơn này?</KoolaText>
            <KoolaButton title="Xác nhận huỷ" onPress={doCancel} loading={busy} disabled={busy} />
          </View>
        </KoolaSheet>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: koolaRadii.md, padding: 12, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 8 },
});

export default PersonalOrderDetailScreen;
