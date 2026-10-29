import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PersonalTabStackParamList } from '../../../navigation/types';
import { usePersonalNavHeader } from '../../../navigation/PersonalHeaderContext';
import { commerceApi, type CommerceOrder, type CommerceOrderStatus } from '../../../services/api/apiService';
import { formatVnd } from '../../../utils/formatVnd';
import { KoolaText, koolaRadii, useTheme } from '../../../ui';
import { getNotchHeaderHeight } from '../../../components/NotchHeader';

const STATUSES: (CommerceOrderStatus | undefined)[] = [undefined, 'PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
const LABEL: Record<string, string> = { undefined: 'Tất cả', PENDING: 'Chờ', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', DELIVERED: 'Đã giao', CANCELLED: 'Huỷ' };

const PersonalOrdersScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  usePersonalNavHeader('Đơn hàng của tôi', useCallback(() => navigation.goBack(), [navigation]));
  const padTop = getNotchHeaderHeight(insets.top, 'nav') + 8;

  const [status, setStatus] = useState<CommerceOrderStatus | undefined>(undefined);
  const [data, setData] = useState<CommerceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [page] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: import('../../../services/api/apiService').CommerceListOrdersParams = { page, limit: 20 };
      if (status !== undefined) params.status = status;
      const res = await commerceApi.listMyOrders(params);
      setData(res.data as CommerceOrder[]);
    } catch {}
    setLoading(false);
  }, [status, page]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas, paddingTop: padTop }]}>
      <View style={styles.chips}>
        {STATUSES.map((s) => (
          <Pressable key={String(s)} onPress={() => setStatus(s)} style={[styles.chip, { borderColor: status === s ? tokens.semantic.action.primary : tokens.semantic.border.subtle, backgroundColor: status === s ? `${tokens.semantic.action.primary}14` : 'transparent' }]}>
            <KoolaText variant="caption" weight={status === s ? '800' : '500'}>{LABEL[String(s)]}</KoolaText>
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
        ListEmptyComponent={!loading ? <KoolaText tone="muted" style={{ textAlign: 'center', marginTop: 32 }}>Chưa có đơn hàng</KoolaText> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('PersonalOrderDetail', { orderId: item.id })} style={[styles.card, { backgroundColor: tokens.semantic.surface.level1, borderColor: tokens.semantic.border.subtle }]}>
            <View style={styles.rowBetween}><KoolaText weight="800">#{item.orderCode}</KoolaText><KoolaText variant="caption" weight="700">{item.status}</KoolaText></View>
            <KoolaText variant="caption" tone="muted">{item.itemCount} sp · {formatVnd(item.total)}</KoolaText>
            <KoolaText variant="caption" tone="faint">{new Date(item.createdAt ?? '').toLocaleDateString('vi-VN')}</KoolaText>
          </Pressable>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: koolaRadii.md, padding: 12, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

export default PersonalOrdersScreen;
