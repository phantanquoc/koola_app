import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ShoppingTabStackParamList } from '../../navigation/types';
import { useShoppingNavHeader } from '../../navigation/ShoppingHeaderContext';
import { commerceApi, type CommerceListOrdersParams, type CommerceOrder, type CommerceOrderStatus } from '../../services/api/apiService';
import { formatVnd } from '../../utils/formatVnd';
import { KoolaText, koolaRadii, useTheme } from '../../ui';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { useAuth } from '../../contexts/AuthContext';

const STATUSES: (CommerceOrderStatus | undefined)[] = [undefined, 'PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
const LABEL: Record<string, string> = { undefined: 'Tất cả', PENDING: 'Chờ', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', DELIVERED: 'Đã giao', CANCELLED: 'Huỷ' };

const ShoppingOrdersScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ShoppingTabStackParamList, 'ShoppingOrders'>>();
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const { activeAccount } = useAuth();
  const isBusiness = activeAccount?.accountType === 'business';
  useShoppingNavHeader('Đơn hàng shop', useCallback(() => navigation.goBack(), [navigation]));
  const padTop = getNotchHeaderHeight(insets.top, 'nav') + 8;

  const [status, setStatus] = useState<CommerceOrderStatus | undefined>(undefined);
  const [data, setData] = useState<CommerceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!isBusiness) return;
    setLoading(true);
    try {
      const params: CommerceListOrdersParams = { page: 1, limit: 20 };
      if (status !== undefined) params.status = status;
      const res = await commerceApi.listSellerOrders(params);
      setData(res.data as CommerceOrder[]);
      if (status === undefined) {
        try {
          const p = await commerceApi.listSellerOrders({ status: 'PENDING', limit: 1 });
          setPendingCount(p.total);
        } catch {}
      }
    } catch {}
    setLoading(false);
  }, [status, isBusiness]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!isBusiness) {
    return (
      <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas, paddingTop: padTop, paddingHorizontal: 16 }]}>
        <KoolaText weight="800" style={{ marginBottom: 8 }}>Dành cho tài khoản bán hàng</KoolaText>
        <KoolaText tone="muted">Chuyển sang tài khoản bán hàng để quản lý đơn hàng.</KoolaText>
      </View>
    );
  }

  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas, paddingTop: padTop }]}>
      <View style={styles.chips}>
        {STATUSES.map((s) => (
          <Pressable key={String(s)} onPress={() => setStatus(s)} style={[styles.chip, { borderColor: status === s ? tokens.semantic.action.primary : tokens.semantic.border.subtle, backgroundColor: status === s ? `${tokens.semantic.action.primary}14` : 'transparent' }]}>
            <KoolaText variant="caption" weight={status === s ? '800' : '500'}>{LABEL[String(s)]}{s === 'PENDING' && pendingCount ? ` · ${pendingCount}` : ''}</KoolaText>
          </Pressable>
        ))}
      </View>
      <FlatList
        removeClippedSubviews={false}
        data={data}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 + insets.bottom }}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={!loading ? <KoolaText tone="muted" style={{ textAlign: 'center', marginTop: 32 }}>Chưa có đơn</KoolaText> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('ShoppingOrderDetail', { orderId: item.id })} style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
            <View style={styles.rowBetween}><KoolaText weight="800">#{item.orderCode}</KoolaText><View style={[styles.badge, { backgroundColor: badgeColor(item.status, tokens) }]}><KoolaText variant="caption" weight="800" tone="surface">{item.status}</KoolaText></View></View>
            <KoolaText variant="caption" tone="muted">{item.buyerName ?? 'Khách'} · {item.itemCount} sp · {formatVnd(item.total)}</KoolaText>
          </Pressable>
        )}
      />
    </View>
  );
};

function badgeColor(s: CommerceOrderStatus, tokens: ReturnType<typeof useTheme>['tokens']): string {
  switch (s) {
    case 'PENDING': return tokens.semantic.status.warning;
    case 'CONFIRMED': return tokens.semantic.action.primary;
    case 'SHIPPING': return '#0ea5e9';
    case 'DELIVERED': return tokens.semantic.status.success;
    default: return tokens.semantic.text.muted;
  }
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: koolaRadii.md, padding: 12, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});

export default ShoppingOrdersScreen;
