import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, FlatList, InteractionManager, ScrollView, RefreshControl, ActivityIndicator, StyleSheet, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { Easing, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import EmptyConnect from '../../components/connect/EmptyConnect';
import ListErrorState from '../../components/connect/ListErrorState';
import BusinessCard from '../../components/connect/BusinessCard';
import ConnectContextBanner from '../../components/connect/ConnectContextBanner';
import QrScannerModal from '../main/QrScannerModal';
import { useAccountDiscovery } from '../../hooks/useAccountDiscovery';
import { conversationsApi } from '../../services/api/apiService';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { RELATIONSHIP_FILTERS } from './constants';
import { VN_PROVINCES, normalizeVN } from '../../constants/provinces';
import type { BusinessSort } from '../../types';
import { KoolaChip, KoolaSheet, KoolaSkeleton, KoolaText, koolaRadii, useKoolaToast, useTheme } from '../../ui';
import { ChromeHeaderBox, getChromeBoxHeight } from '../../components/ChromeHeaderBox';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { MOCK_BUSINESSES } from './mockBusinesses';
import { BUSINESS_CATEGORIES } from './constants';

const FILTER_ROW_H = 44;
const FILTER_GAP = 8;

const FilterRow: React.FC<{ styles: ReturnType<typeof makeStyles>; activeRelationship: string; onSelectRelationship: (slug: string) => void }> = ({ styles, activeRelationship, onSelectRelationship }) => (
  <View style={styles.filterRow}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chipScrollerContent}>
      {RELATIONSHIP_FILTERS.map((rel) => {
        const selected = activeRelationship === rel.slug;
        return (
          <Pressable key={rel.slug} accessibilityRole="button" accessibilityLabel={rel.label} accessibilityState={{ selected }} onPress={() => { if (selected && rel.slug !== 'all') onSelectRelationship('all'); else if (!selected) onSelectRelationship(rel.slug); }} hitSlop={4} style={[styles.rowChip, selected && styles.rowChipActive]}>
            <KoolaText variant="caption" weight="800" tone={selected ? 'surface' : 'muted'} numberOfLines={1}>{rel.label}</KoolaText>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);

const SORT_OPTIONS: { value: BusinessSort; label: string }[] = [
  { value: 'latest', label: 'Mới nhất' },
  { value: 'popular', label: 'Nhiều kết nối' },
  { value: 'name', label: 'Tên A→Z' },
];

const ProvincePickerSheet: React.FC<{ value: string; onChange: (v: string) => void; onClose: () => void }> = ({ value, onChange, onClose }) => {
  const [query, setQuery] = useState('');
  const { tokens } = useTheme();
  const s = tokens.semantic;
  const filtered = useMemo(() => {
    if (!query.trim()) return VN_PROVINCES;
    const n = normalizeVN(query.trim());
    return VN_PROVINCES.filter((p) => normalizeVN(p).includes(n));
  }, [query]);
  return (
    <KoolaSheet snapPoints={['60%']} index={0} onClose={onClose}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: s.bg.canvas, borderRadius: koolaRadii.sm, paddingHorizontal: 12, height: 44, marginBottom: 12 }}>
          <MaterialIcons name="search" size={20} color={s.text.faint} style={{ marginRight: 6 }} />
          <TextInput style={{ flex: 1, fontSize: 15, color: s.text.primary, paddingVertical: 0 }} placeholder="Tìm tỉnh/thành..." placeholderTextColor={s.text.faint} value={query} onChangeText={setQuery} autoFocus returnKeyType="search" />
          {query.length > 0 ? <Pressable onPress={() => setQuery('')} hitSlop={6} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="close" size={20} color={s.text.faint} /></Pressable> : null}
        </View>
        <FlatList data={filtered} keyExtractor={(item) => item} keyboardShouldPersistTaps="handled"
          ListHeaderComponent={value ? <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: s.border.subtle }} onPress={() => onChange('')}><KoolaText tone="danger" weight="600">Xóa bộ lọc</KoolaText><MaterialIcons name="close" size={18} color={s.status.danger} /></Pressable> : null}
          renderItem={({ item }) => {
            const isSelected = item === value;
            return <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: s.border.subtle, backgroundColor: isSelected ? s.action.primarySoft : 'transparent' }} onPress={() => onChange(item)}><KoolaText tone={isSelected ? 'primary' : 'ink'} weight={isSelected ? '600' : '400'}>{item}</KoolaText>{isSelected ? <MaterialIcons name="check" size={20} color={s.action.primary} /> : null}</Pressable>;
          }}
        />
      </View>
    </KoolaSheet>
  );
};

const ConnectFilterSheet: React.FC<{ styles: ReturnType<typeof makeStyles>; activeCategory: string | null; activeProvince: string; activeSort: BusinessSort; hasActiveFilters: boolean; onToggleCategory: (slug: string) => void; onProvinceChange: (v: string) => void; onSortChange: (v: BusinessSort) => void; onClear: () => void; onClose: () => void; bottomInset: number }> = ({ styles, activeCategory, activeProvince, activeSort, hasActiveFilters, onToggleCategory, onProvinceChange, onSortChange, onClear, onClose, bottomInset }) => {
  const [provinceOpen, setProvinceOpen] = useState(false);
  return (
    <KoolaSheet snapPoints={['42%']} index={0} onClose={onClose}>
      <View style={[styles.sheetContent, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.sheetHeaderRow}><KoolaText variant="heading" weight="800">Bộ lọc</KoolaText>{hasActiveFilters ? <Pressable accessibilityRole="button" accessibilityLabel="Xóa lọc" onPress={onClear} hitSlop={8} style={styles.sheetClearBtn}><KoolaText variant="label" weight="700" tone="primary">Xóa lọc</KoolaText></Pressable> : null}</View>
        <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Sắp xếp</KoolaText>
        <View style={styles.sheetChipRow}>{SORT_OPTIONS.map((opt) => <View key={opt.value} style={styles.sheetChipWrap}><KoolaChip label={opt.label} selected={activeSort === opt.value} onPress={() => onSortChange(opt.value)} /></View>)}</View>
        <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Khu vực</KoolaText>
        <View style={styles.sheetChipRow}><View style={styles.sheetChipWrap}><KoolaChip label={activeProvince ? activeProvince : 'Tất cả tỉnh/thành'} selected={Boolean(activeProvince)} onPress={() => setProvinceOpen(true)} /></View>{activeProvince ? <View style={styles.sheetChipWrap}><KoolaChip label="Xóa tỉnh/thành" selected={false} onPress={() => onProvinceChange('')} /></View> : null}</View>
        <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Ngành nghề</KoolaText>
        <View style={styles.sheetChipRow}>{BUSINESS_CATEGORIES.filter((c) => c.slug !== 'all').map((cat) => <View key={cat.slug} style={styles.sheetChipWrap}><KoolaChip label={cat.label} selected={activeCategory === cat.slug} onPress={() => onToggleCategory(cat.slug)} /></View>)}</View>
      </View>
      {provinceOpen ? <ProvincePickerSheet value={activeProvince} onChange={(v) => { onProvinceChange(v); setProvinceOpen(false); }} onClose={() => setProvinceOpen(false)} /> : null}
    </KoolaSheet>
  );
};

const BANNER_DISMISSED_KEY = 'connect_banner_dismissed';

type ConnectNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

function useAccountActions(navigation: ConnectNavProp) {
  const toast = useKoolaToast();
  const navigateToChat = useCallback((conversationId: string) => {
    (navigation as any).navigate('ChatTab', { screen: 'Chat', params: { conversationId } });
  }, [navigation]);
  const handleMessage = useCallback(async (account: BusinessAccountItem) => {
    try { const { conversation } = await conversationsApi.startDirectChat(account._id); navigateToChat(conversation._id); }
    catch (err) { if (__DEV__) console.warn('Start direct chat failed:', err); toast.show('Không thể bắt đầu trò chuyện. Bạn thử lại nhé.', 'danger'); }
  }, [navigateToChat, toast]);
  return { handleMessage };
}

const ConnectHomeScreen: React.FC = () => {
  const navigation = useNavigation<ConnectNavProp>();
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const isDark = resolvedScheme === 'dark';
  const blockH = getChromeBoxHeight(insets.top);
  const filterTop = blockH + FILTER_GAP;
  const listTopPad = blockH + FILTER_GAP + FILTER_ROW_H + FILTER_GAP;

  const hiddenProgress = useSharedValue(0);
  const scrolledProgress = useSharedValue(0);
  const prevOffsetY = useSharedValue(0);
  const travel = useSharedValue(0);

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const offsetY = Math.max(0, event.contentOffset.y);
      if (offsetY > 8 && scrolledProgress.value !== 1) {
        scrolledProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      } else if (offsetY <= 4 && scrolledProgress.value !== 0) {
        scrolledProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
      if (offsetY <= 4) {
        if (hiddenProgress.value !== 0) {
          hiddenProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
        }
        travel.value = 0;
        prevOffsetY.value = offsetY;
        return;
      }
      const delta = offsetY - prevOffsetY.value;
      if (delta === 0) return;
      // Accumulate travel in dominant direction; reset on direction flip.
      if ((delta > 0 && travel.value < 0) || (delta < 0 && travel.value > 0)) {
        travel.value = delta;
      } else {
        travel.value += delta;
      }
      prevOffsetY.value = offsetY;
      if (travel.value > 8 && hiddenProgress.value !== 1) {
        hiddenProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      } else if (travel.value < -8 && hiddenProgress.value !== 0) {
        hiddenProgress.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }
    },
  });

  const filterVisibilityStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, hiddenProgress.value));
    const h = t * t * (3 - 2 * t);
    return {
      height: FILTER_ROW_H * (1 - h),
      opacity: 1 - h,
      transform: [{ translateY: -FILTER_ROW_H * h }],
    };
  }, []);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeRelationship, setActiveRelationship] = useState('all');
  const [activeSort, setActiveSort] = useState<BusinessSort>('latest');
  const [activeProvince, setActiveProvince] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [qrVisible, setQrVisible] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const contentReadyFired = useRef(false);

  useEffect(() => { if (contentReadyFired.current) return; const task = InteractionManager.runAfterInteractions(() => { contentReadyFired.current = true; setContentReady(true); }); return () => task.cancel(); }, []);
  useEffect(() => { AsyncStorage.getItem(BANNER_DISMISSED_KEY).then((val) => { if (val !== 'true') setBannerDismissed(false); }); }, []);
  const handleDismissBanner = useCallback(() => { setBannerDismissed(true); AsyncStorage.setItem(BANNER_DISMISSED_KEY, 'true'); }, []);
  const handleClearFilters = useCallback(() => { setActiveCategory(null); setActiveRelationship('all'); setActiveSort('latest'); setActiveProvince(''); }, []);
  const handleSelectRelationship = useCallback((slug: string) => {
    if (slug === activeRelationship) { if (slug !== 'all') { setActiveRelationship('all'); setActiveCategory(null); } return; }
    setActiveRelationship(slug); setActiveCategory(null);
  }, [activeRelationship]);

  const effectiveCategory = activeRelationship === 'all' ? undefined : (activeCategory ?? undefined);
  const { items, loading, refreshing, hasMore, error, loadMore, refresh } = useAccountDiscovery({
    businessCategory: effectiveCategory,
    relationshipType: activeRelationship === 'all' ? undefined : activeRelationship,
    sort: activeSort,
    province: activeProvince || undefined,
  });
  const { handleMessage } = useAccountActions(navigation);
  const displayItems = useMemo(() => {
    const hasActive =
      effectiveCategory || activeProvince || (activeRelationship !== 'all') || activeSort !== 'latest';
    let mocks = MOCK_BUSINESSES as any[];
    if (hasActive) {
      mocks = mocks.filter((m) => {
        if (effectiveCategory && m.businessCategory !== effectiveCategory) return false;
        if (activeProvince && m.province !== activeProvince) return false;
        if (activeRelationship !== 'all' && m.relationshipType && m.relationshipType !== activeRelationship) return false;
        return true;
      });
      if (activeSort === 'popular') mocks = [...mocks].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
      if (activeSort === 'name') mocks = [...mocks].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
    }
    const realIds = new Set(mocks.map((m) => m._id));
    const reals = (items as any[]).filter((it) => !realIds.has(it._id));
    if (items.length === 0) return mocks as any;
    return [...mocks, ...reals] as any;
  }, [items, effectiveCategory, activeProvince, activeRelationship, activeSort]);
  const handleQrClose = useCallback(() => setQrVisible(false), []);
  const handleNavigateProfile = useCallback((userId: string) => { (navigation as any).navigate('Profile', { userId }); }, [navigation]);
  const handleNavigateChat = useCallback((conversationId: string) => { (navigation as any).navigate('ChatTab', { screen: 'Chat', params: { conversationId } }); }, [navigation]);
  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);
  const handleSearchPress = useCallback(() => navigation.navigate('BusinessSearch'), [navigation]);
  const toggleCategory = useCallback((slug: string) => { setActiveCategory((prev) => (prev === slug ? null : slug)); }, []);

  const renderItem = useCallback(({ item }: { item: BusinessAccountItem }) => (
    <BusinessCard item={item as any} onPress={() => (navigation as any).navigate('BusinessProfile', { businessId: item._id })} onMessagePress={() => handleMessage(item)} />
  ), [navigation, handleMessage]);

  if (error && displayItems.length === 0 && !loading) {
    return (
      <View style={styles.screen}>
        <ChromeHeaderBox insetsTop={insets.top} isDark={isDark} contentReady={contentReady} onSearchPress={handleSearchPress} />
        <View style={{ paddingTop: listTopPad }}><ListErrorState message={error} onRetry={refresh} /></View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {!contentReady ? (
        <View style={[styles.screen, { paddingTop: blockH }]}>
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={36} radius={koolaRadii.pill} />
            <View style={{ flexDirection: 'row', marginTop: FILTER_GAP, alignItems: 'center' }}>
              <KoolaSkeleton width={80} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={90} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={110} height={FILTER_ROW_H} radius={koolaRadii.pill} />
            </View>
          </View>
          <View style={styles.listContent}>
            {[0, 1, 2].map((i) => <KoolaSkeleton key={i} width="100%" height={88} radius={koolaRadii.md} style={{ marginTop: i === 0 ? FILTER_GAP : 6 }} />)}
          </View>
        </View>
      ) : (
        <Animated.FlatList removeClippedSubviews={false} data={displayItems as any} keyExtractor={(item: any) => item._id} renderItem={renderItem as any} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50}
          ListHeaderComponent={!bannerDismissed ? <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}><ConnectContextBanner onCreatePress={() => (navigation as any).navigate('PersonalTab', { screen: 'AccountList' })} onDismiss={handleDismissBanner} /></View> : null}
          ListEmptyComponent={loading ? null : <EmptyConnect activeCategory={effectiveCategory} activeRelationship={activeRelationship === 'all' ? undefined : activeRelationship} activeProvince={activeProvince || undefined} activeSort={activeSort} onClearFilters={handleClearFilters} />}
          ListFooterComponent={hasMore ? <ActivityIndicator style={{ paddingVertical: 16 }} size="small" color={semantic.action.primary} /> : null}
          onEndReached={loadMore} onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={semantic.action.primary} />}
          contentContainerStyle={[styles.listContent, { paddingTop: listTopPad, paddingBottom: tabBarInset }]}
          showsVerticalScrollIndicator={false} style={styles.screenTransparent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}
      {contentReady ? (
        <>
          <ChromeHeaderBox insetsTop={insets.top} isDark={isDark} contentReady={contentReady} onSearchPress={handleSearchPress} hiddenProgress={hiddenProgress} scrolledProgress={scrolledProgress} />
          <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', top: filterTop, left: 0, right: 0, paddingHorizontal: 12, overflow: 'hidden' }, filterVisibilityStyle]}>
            <FilterRow styles={styles} activeRelationship={activeRelationship} onSelectRelationship={handleSelectRelationship} />
          </Animated.View>
        </>
      ) : null}
      {filterSheetOpen ? <ConnectFilterSheet styles={styles} activeCategory={activeCategory} activeProvince={activeProvince} activeSort={activeSort} hasActiveFilters={activeCategory !== null || Boolean(activeProvince) || activeSort !== 'latest'} onToggleCategory={toggleCategory} onProvinceChange={setActiveProvince} onSortChange={setActiveSort} onClear={handleClearFilters} onClose={closeFilterSheet} bottomInset={insets.bottom} /> : null}
      <QrScannerModal visible={qrVisible} onClose={handleQrClose} onNavigateProfile={handleNavigateProfile} onNavigateChat={handleNavigateChat} />
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens, _scheme: 'light' | 'dark') =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    screenTransparent: { flex: 1, backgroundColor: 'transparent' },
    listContent: { paddingHorizontal: 6 },
    contentInset: { paddingHorizontal: 12 },
    filterRow: { flexDirection: 'row', alignItems: 'center', height: FILTER_ROW_H },
    chipScroller: { flex: 1 },
    chipScrollerContent: { alignItems: 'center', paddingRight: 12 },
    rowChip: { height: 36, minHeight: 36, borderRadius: koolaRadii.pill, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: semantic.surface.level2, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.strong, marginRight: 8 },
    rowChipActive: { backgroundColor: semantic.action.primary, borderColor: semantic.action.primary },
    sheetContent: { paddingHorizontal: 20, paddingTop: 4 },
    sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetClearBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    sheetSectionTitle: { marginTop: 12, marginBottom: 8 },
    sheetChipRow: { flexDirection: 'row', flexWrap: 'wrap' },
    sheetChipWrap: { marginRight: 8, marginBottom: 8 },
  });

export default ConnectHomeScreen;
