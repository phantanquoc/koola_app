import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { commerceApi, type CommerceOrder, type CommerceOrderStatus } from '../../../services/api/apiService';
import { useAuth } from '../../../contexts/AuthContext';
import { formatVnd } from '../../../utils/formatVnd';
import { KoolaButton, KoolaSheet, KoolaText, koolaRadii, useKoolaToast, useTheme } from '../../../ui';

const STATUS_LABEL: Record<CommerceOrderStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã huỷ',
};

const CARRIER_LINKS: Record<string, string> = {
  GHN: 'https://donhang.ghn.vn/?order_code=',
  GHTK: 'https://ghtk.vn/don-hang/',
  VTP: 'https://viettelpost.com.vn/tra-cuu-hanh-trinh-don?code=',
};

function carrierLink(carrier: string | null, code: string | null): string | null {
  if (!code) return null;
  const base = CARRIER_LINKS[carrier ?? ''];
  if (base) return base + encodeURIComponent(code);
  return null;
}

export interface OrderCardProps {
  orderId: string;
  code: string;
  status: CommerceOrderStatus;
  /** Compact preview — expanded detail is fetched on demand. */
  onExpandedChange?: (order: CommerceOrder | null) => void;
  compact?: boolean;
}

const OrderCard: React.FC<OrderCardProps> = ({ orderId, code, status }) => {
  const { tokens } = useTheme();
  const toast = useKoolaToast();
  const { activeAccount } = useAuth();
  const [detail, setDetail] = useState<CommerceOrder | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Action sheets
  const [sheet, setSheet] = useState<'confirm' | 'ship' | 'reject' | 'cancel' | null>(null);
  const [shippingFee, setShippingFee] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [carrier, setCarrier] = useState('GHN');
  const [trackingCode, setTrackingCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (detail || loading) return;
    setLoading(true);
    try {
      const res = await commerceApi.getOrder(orderId);
      setDetail(res.order as CommerceOrder);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (e as { message?: string })?.message;
      if (msg) toast.show(String(msg), 'warning');
    }
    setLoading(false);
  }, [detail, loading, orderId, toast]);

  const onToggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next) await fetchDetail();
  }, [expanded, fetchDetail]);

  const role: 'buyer' | 'seller' | 'unknown' = ((): 'buyer' | 'seller' | 'unknown' => {
    if (!detail) return 'unknown';
    const me = activeAccount?._id;
    if (me && detail.sellerId === me) return 'seller';
    if (me && detail.buyerId === me) return 'buyer';
    return 'unknown';
  })();

  function apiErrorMessage(e: unknown): string {
    return (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (e as { message?: string })?.message ?? 'Thất bại';
  }

  const doConfirm = async () => {
    setBusy(true);
    try {
      await commerceApi.confirmOrder(orderId, { shippingFee: parseInt(shippingFee, 10) || 0, expectedDeliveryDate: expectedDate });
      setSheet(null); setDetail(null); await fetchDetail();
    } catch (e: unknown) { toast.show(apiErrorMessage(e), 'warning'); }
    setBusy(false);
  };
  const doShip = async () => {
    setBusy(true);
    try {
      await commerceApi.shipOrder(orderId, { carrier, trackingCode: trackingCode || undefined });
      setSheet(null); setDetail(null); await fetchDetail();
    } catch (e: unknown) { toast.show(apiErrorMessage(e), 'warning'); }
    setBusy(false);
  };
  const doReject = async () => {
    setBusy(true);
    try {
      await commerceApi.rejectOrder(orderId, { reason });
      setSheet(null); setDetail(null); await fetchDetail();
    } catch (e: unknown) { toast.show(apiErrorMessage(e), 'warning'); }
    setBusy(false);
  };
  const doCancel = async () => {
    setBusy(true);
    try {
      await commerceApi.cancelOrder(orderId, reason || undefined);
      setSheet(null); setDetail(null); await fetchDetail();
    } catch (e: unknown) { toast.show(apiErrorMessage(e), 'warning'); }
    setBusy(false);
  };
  const doReceive = async () => {
    setBusy(true);
    try {
      await commerceApi.receiveOrder(orderId);
      setSheet(null); setDetail(null); await fetchDetail();
    } catch (e: unknown) { toast.show(apiErrorMessage(e), 'warning'); }
    setBusy(false);
  };

  const tLink = detail ? carrierLink(detail.shipping.carrier, detail.shipping.trackingCode) : null;

  return (
    <View style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
      <Pressable onPress={onToggle} accessibilityRole="button">
        <View style={styles.rowBetween}>
          <KoolaText weight="800">Đơn #{code}</KoolaText>
          <View style={[styles.badge, { backgroundColor: statusColor(status, tokens) }]}>
            <KoolaText variant="caption" weight="800" tone="surface">{STATUS_LABEL[status] ?? status}</KoolaText>
          </View>
        </View>
        {detail ? (
          <View style={{ marginTop: 6 }}>
            <KoolaText variant="caption" tone="muted">{detail.itemCount} sản phẩm · {formatVnd(detail.total)}{detail.shippingFee !== null ? ` (ship ${formatVnd(detail.shippingFee)})` : ''}</KoolaText>
            {tLink ? <KoolaText variant="caption" tone="primary" onPress={() => Linking.openURL(tLink)}>{detail.shipping.carrier} · {detail.shipping.trackingCode} — Tra cứu</KoolaText> : null}
          </View>
        ) : (
          <KoolaText variant="caption" tone="muted" style={{ marginTop: 4 }}>{loading ? 'Đang tải...' : 'Nhấn để xem chi tiết'}</KoolaText>
        )}
      </Pressable>

      {expanded && detail ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          {role === 'seller' && detail.status === 'PENDING' ? (
            <View style={styles.actionRow}>
              <KoolaButton title="Xác nhận" size="sm" onPress={() => setSheet('confirm')} style={{ flex: 1 }} />
              <KoolaButton title="Từ chối" size="sm" variant="ghost" onPress={() => setSheet('reject')} style={{ flex: 1 }} />
            </View>
          ) : null}
          {role === 'seller' && detail.status === 'CONFIRMED' ? (
            <KoolaButton title="Gửi hàng" size="sm" onPress={() => setSheet('ship')} />
          ) : null}
          {role === 'buyer' && (detail.status === 'PENDING' || detail.status === 'CONFIRMED') ? (
            <KoolaButton title="Huỷ đơn" size="sm" variant="ghost" onPress={() => setSheet('cancel')} />
          ) : null}
          {role === 'buyer' && detail.status === 'SHIPPING' ? (
            <KoolaButton title="Đã nhận hàng" size="sm" onPress={doReceive} loading={busy} disabled={busy} />
          ) : null}
          <KoolaText variant="caption" tone="faint">Cập nhật qua message_updated hoặc khi mở lại hội thoại.</KoolaText>
        </View>
      ) : null}

      {sheet === 'confirm' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Xác nhận đơn</KoolaText>
            <KoolaText variant="caption" tone="muted" style={{ marginBottom: 8 }}>Nhập phí ship và ngày giao dự kiến (ISO).</KoolaText>
            <TextInput placeholder="Phí ship (VND)" keyboardType="number-pad" value={shippingFee} onChangeText={setShippingFee} style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary }]} placeholderTextColor={tokens.semantic.text.faint} />
            <TextInput placeholder="2026-10-10" value={expectedDate} onChangeText={setExpectedDate} style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary, marginTop: 8 }]} placeholderTextColor={tokens.semantic.text.faint} />
            <KoolaButton title="Xác nhận" onPress={doConfirm} loading={busy} disabled={busy} style={{ marginTop: 12 }} />
          </View>
        </KoolaSheet>
      )}

      {sheet === 'ship' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Gửi hàng</KoolaText>
            <View style={styles.carrierRow}>
              {['GHN', 'GHTK', 'VTP', 'Khác'].map((c) => (
                <Pressable key={c} onPress={() => setCarrier(c)} style={[styles.carrierChip, { borderColor: carrier === c ? tokens.semantic.action.primary : tokens.semantic.border.subtle, backgroundColor: carrier === c ? `${tokens.semantic.action.primary}14` : 'transparent' }]}>
                  <KoolaText variant="caption" weight={carrier === c ? '800' : '500'}>{c}</KoolaText>
                </Pressable>
              ))}
            </View>
            <TextInput placeholder="Mã vận đơn" value={trackingCode} onChangeText={setTrackingCode} style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary, marginTop: 8 }]} placeholderTextColor={tokens.semantic.text.faint} />
            <KoolaButton title="Đã gửi" onPress={doShip} loading={busy} disabled={busy} style={{ marginTop: 12 }} />
          </View>
        </KoolaSheet>
      )}

      {sheet === 'reject' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Từ chối đơn</KoolaText>
            <TextInput placeholder="Lý do" value={reason} onChangeText={setReason} multiline style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary, minHeight: 80, textAlignVertical: 'top' }]} placeholderTextColor={tokens.semantic.text.faint} />
            <KoolaButton title="Từ chối" onPress={doReject} loading={busy} disabled={!reason.trim() || busy} style={{ marginTop: 12 }} />
          </View>
        </KoolaSheet>
      )}
      {sheet === 'cancel' && (
        <KoolaSheet snapPoints={['50%']} index={0} onClose={() => setSheet(null)}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <KoolaText weight="700" style={{ marginBottom: 8 }}>Huỷ đơn</KoolaText>
            <TextInput placeholder="Lý do (tuỳ chọn)" value={reason} onChangeText={setReason} multiline style={[styles.input, { borderColor: tokens.semantic.border.subtle, color: tokens.semantic.text.primary, minHeight: 60, textAlignVertical: 'top' }]} placeholderTextColor={tokens.semantic.text.faint} />
            <KoolaButton title="Xác nhận huỷ" onPress={doCancel} loading={busy} disabled={busy} style={{ marginTop: 12 }} />
          </View>
        </KoolaSheet>
      )}
    </View>
  );
};

function statusColor(s: CommerceOrderStatus, tokens: ReturnType<typeof useTheme>['tokens']): string {
  switch (s) {
    case 'PENDING': return tokens.semantic.status.warning;
    case 'CONFIRMED': return tokens.semantic.action.primary;
    case 'SHIPPING': return '#0ea5e9';
    case 'DELIVERED': return tokens.semantic.status.success;
    case 'CANCELLED': return tokens.semantic.status.danger;
    default: return tokens.semantic.text.muted;
  }
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: koolaRadii.md, padding: 12, marginBottom: 6, maxWidth: 320 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  actionRow: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  carrierRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  carrierChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
});

export default OrderCard;
