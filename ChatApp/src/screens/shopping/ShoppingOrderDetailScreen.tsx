import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ShoppingTabStackParamList } from '../../navigation/types';
import { useShoppingNavHeader } from '../../navigation/ShoppingHeaderContext';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { commerceApi, type CommerceOrder } from '../../services/api/apiService';
import { formatVnd } from '../../utils/formatVnd';
import { KoolaButton, KoolaSheet, KoolaText, koolaRadii, useTheme } from '../../ui';

type RouteT = RouteProp<ShoppingTabStackParamList, 'ShoppingOrderDetail'>;
type NavT = NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingOrderDetail'>;

const CARRIER_LINKS: Record<string, string> = {
  GHN: 'https://donhang.ghn.vn/?order_code=',
  GHTK: 'https://ghtk.vn/don-hang/',
  VTP: 'https://viettelpost.com.vn/tra-cuu-hanh-trinh-don?code=',
};

const ShoppingOrderDetailScreen: React.FC = () => {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  useShoppingNavHeader('Chi tiết đơn (shop)', useCallback(() => navigation.goBack(), [navigation]));
  const padTop = getNotchHeaderHeight(insets.top, 'nav') + 12;
  const orderId = route.params.orderId;

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'confirm' | 'ship' | 'reject' | null>(null);
  const [shippingFee, setShippingFee] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [carrier, setCarrier] = useState('GHN');
  const [trackingCode, setTrackingCode] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await commerceApi.getOrder(orderId);
      setOrder(res.order as CommerceOrder);
    } catch {}
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  const doConfirm = async () => {
    setBusy(true);
    try { await commerceApi.confirmOrder(orderId, { shippingFee: parseInt(shippingFee, 10) || 0, expectedDeliveryDate: expectedDate }); setSheet(null); await load(); } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Thất bại'); }
    setBusy(false);
  };
  const doShip = async () => {
    setBusy(true);
    try { await commerceApi.shipOrder(orderId, { carrier, trackingCode: trackingCode || undefined }); setSheet(null); await load(); } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Thất bại'); }
    setBusy(false);
  };
  const doReject = async () => {
    setBusy(true);
    try { await commerceApi.rejectOrder(orderId, { reason }); setSheet(null); await load(); } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Thất bại'); }
    setBusy(false);
  };
  const doCancel = async () => {
    setBusy(true);
    try { await commerceApi.cancelOrder(orderId, reason || undefined); setSheet(null); await load(); } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Thất bại'); }
    setBusy(false);
  };

  if (!order) return <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas, paddingTop: padTop }]}><KoolaText tone="muted" style={{ textAlign: 'center', marginTop: 24 }}>Đang tải...</KoolaText></View>;

  const tLink = order.shipping.trackingCode && CARRIER_LINKS[order.shipping.carrier ?? ''] ? CARRIER_LINKS[order.shipping.carrier!] + encodeURIComponent(order.shipping.trackingCode) : null;

  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      <ScrollView contentContainerStyle={{ paddingTop: padTop, paddingBottom: 24 + insets.bottom, paddingHorizontal: 12 }}>
        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <View style={styles.rowBetween}><KoolaText weight="800">#{order.orderCode}</KoolaText><KoolaText weight="700">{order.status}</KoolaText></View>
          <KoolaText variant="caption" tone="muted">{order.buyerName ?? order.buyerId} · {order.buyerInfo.phone}</KoolaText>
          <KoolaText variant="caption" tone="muted">{order.buyerInfo.address}</KoolaText>
          {order.shipping.trackingCode ? <View style={{ marginTop: 6 }}><KoolaText variant="caption">{order.shipping.carrier} · {order.shipping.trackingCode}</KoolaText>{tLink ? <KoolaText variant="caption" tone="primary" onPress={() => Linking.openURL(tLink)}>Tra cứu vận đơn</KoolaText> : null}</View> : null}
          {order.shipping.fee !== null ? <KoolaText variant="caption" style={{ marginTop: 4 }}>Phí ship: {formatVnd(order.shipping.fee)}</KoolaText> : null}
        </View>

        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          {order.items.map((it) => (
            <View key={it.productId} style={styles.itemRow}>
              <KoolaText variant="caption" weight="700" style={{ flex: 1 }} numberOfLines={2}>{it.name} × {it.qty}</KoolaText>
              <KoolaText variant="caption" weight="800">{formatVnd(it.price * it.qty)}</KoolaText>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: tokens.semantic.border.subtle }]} />
          <View style={styles.rowBetween}><KoolaText variant="caption" tone="muted">Tổng</KoolaText><KoolaText weight="800">{formatVnd(order.total)}</KoolaText></View>
        </View>

        <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
          <KoolaText weight="700" style={{ marginBottom: 6 }}>Lịch sử</KoolaText>
          {order.statusHistory.map((h, i) => (
            <View key={i} style={styles.timelineRow}><KoolaText variant="caption" weight="700">{h.status}</KoolaText><KoolaText variant="caption" tone="faint">{new Date(h.at).toLocaleString('vi-VN')}{h.note ? ` · ${h.note}` : ''}</KoolaText></View>
          ))}
        </View>

        <View style={{ gap: 8, marginTop: 4 }}>
          {order.status === 'PENDING' ? <><KoolaButton title="Xác nhận" onPress={() => setSheet('confirm')} disabled={busy} /><KoolaButton title="Từ chối" variant="ghost" onPress={() => setSheet('reject')} disabled={busy} /><KoolaButton title="Huỷ đơn" variant="ghost" onPress={() => setSheet('reject')} disabled={busy} /></> : null}
          {order.status === 'CONFIRMED' ? <KoolaButton title="Gửi hàng" onPress={() => setSheet('ship')} disabled={busy} /> : null}
        </View>
      </ScrollView>

      {sheet === 'confirm' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Xác nhận đơn</KoolaText>
            <TextInput placeholder="Phí ship (VND)" keyboardType="number-pad" value={shippingFee} onChangeText={setShippingFee} style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary }]} placeholderTextColor={tokens.semantic.text.faint} />
            <TextInput placeholder="Ngày giao dự kiến YYYY-MM-DD" value={expectedDate} onChangeText={setExpectedDate} style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary, marginTop: 8 }]} placeholderTextColor={tokens.semantic.text.faint} />
            <KoolaButton title="Xác nhận" onPress={doConfirm} loading={busy} disabled={busy} style={{ marginTop: 12 }} />
          </View>
        </KoolaSheet>
      )}
      {sheet === 'ship' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Gửi hàng</KoolaText>
            <TextInput placeholder="Mã vận đơn" value={trackingCode} onChangeText={setTrackingCode} style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary }]} placeholderTextColor={tokens.semantic.text.faint} />
            <KoolaButton title="Đã gửi" onPress={doShip} loading={busy} disabled={busy} style={{ marginTop: 12 }} />
          </View>
        </KoolaSheet>
      )}
      {sheet === 'reject' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Từ chối / Huỷ</KoolaText>
            <TextInput placeholder="Lý do" value={reason} onChangeText={setReason} multiline style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary, minHeight: 80, textAlignVertical: 'top' }]} placeholderTextColor={tokens.semantic.text.faint} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <KoolaButton title="Từ chối" onPress={doReject} loading={busy} disabled={!reason.trim() || busy} style={{ flex: 1 }} />
              <KoolaButton title="Huỷ" variant="secondary" onPress={doCancel} loading={busy} disabled={!reason.trim() || busy} style={{ flex: 1 }} />
            </View>
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
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
});

export default ShoppingOrderDetailScreen;
