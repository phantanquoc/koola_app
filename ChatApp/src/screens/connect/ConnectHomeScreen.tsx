import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, FlatList, Animated, InteractionManager, ScrollView, RefreshControl, ActivityIndicator, StyleSheet, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import EmptyConnect from '../../components/connect/EmptyConnect';
import ListErrorState from '../../components/connect/ListErrorState';
import BusinessCardSkeleton from '../../components/connect/BusinessCardSkeleton';
import BusinessCard from '../../components/connect/BusinessCard';
import ConnectContextBanner from '../../components/connect/ConnectContextBanner';
import QrScannerModal from '../main/QrScannerModal';
import { useAccountDiscovery } from '../../hooks/useAccountDiscovery';
import { conversationsApi } from '../../services/api/apiService';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { BUSINESS_CATEGORIES, RELATIONSHIP_FILTERS } from './constants';
import { VN_PROVINCES, normalizeVN } from '../../constants/provinces';
import type { BusinessSort } from '../../types';
import { KoolaChip, KoolaSheet, KoolaSkeleton, KoolaText, koolaRadii, koolaZIndex, useKoolaToast, useTheme } from '../../ui';
import { NOTCH_HEADER_CONTENT_H, NOTCH_WING_INSET } from '../../components/NotchHeader';
import type { SemanticTokens } from '../../ui/tokens/semantic';

const DOCK_GAP_TOP = 4;
const DOCK_H = 40;
const DOCK_GAP_BOTTOM = 8;
const FILTER_ROW_H = 44;
const FILTER_ROW_H_COLLAPSED = 40;
const FILTER_ROW_GAP_BOTTOM = 12;
const FILTER_ROW_GAP_COLLAPSED = 8;
const DOCK_HIDE_THRESHOLD = 120;
const DOCK_HIDE_MID = DOCK_HIDE_THRESHOLD / 2;
const DOCK_SLIDE = DOCK_H + DOCK_GAP_BOTTOM;
const CHROME_RESERVE = DOCK_GAP_TOP + DOCK_H + DOCK_GAP_BOTTOM + FILTER_ROW_H + FILTER_ROW_GAP_BOTTOM;

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

const ConnectSearchDock: React.FC<{ semantic: SemanticTokens; onSearchPress: () => void; activeFilterCount: number; onOpenFilters: () => void; onFocusChange?: (f: boolean) => void }> = ({ semantic, onSearchPress, activeFilterCount, onOpenFilters, onFocusChange }) => {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => { setFocused(true); onFocusChange?.(true); }, [onFocusChange]);
  const handleBlur = useCallback(() => { setFocused(false); onFocusChange?.(false); }, [onFocusChange]);
  return (
    <View style={[dockStyles.pill, { backgroundColor: semantic.border.subtle }]}>
      {focused ? <View pointerEvents="none" style={[dockStyles.focusRing, { borderColor: semantic.focus.ring }]} /> : null}
      <View style={dockStyles.contentRow}>
        <MaterialIcons name="search" size={20} color={semantic.text.faint} style={dockStyles.searchIcon} />
        <Pressable style={{ flex: 1 }} onPress={onSearchPress} accessibilityRole="button" accessibilityLabel="Tìm doanh nghiệp">
          <TextInput editable={false} pointerEvents="none" placeholder="Tìm doanh nghiệp..." placeholderTextColor={semantic.text.faint} style={[dockStyles.searchInput, { color: semantic.text.primary }]} onFocus={handleFocus} onBlur={handleBlur} />
        </Pressable>
        <View style={[dockStyles.divider, { backgroundColor: semantic.border.strong }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={activeFilterCount > 0 ? 'Lọc, ' + activeFilterCount + ' bộ lọc đang áp dụng' : 'Lọc'} onPress={onOpenFilters} hitSlop={6} style={dockStyles.filterBtn}>
          <MaterialIcons name="filter-list" size={20} color={semantic.action.primary} />
          {activeFilterCount > 0 ? <View style={dockStyles.filterBadge}><KoolaText variant="caption" weight="800" tone="surface" style={dockStyles.filterBadgeText}>{activeFilterCount}</KoolaText></View> : null}
        </Pressable>
      </View>
    </View>
  );
};
const dockStyles = StyleSheet.create({
  pill: { height: DOCK_H, borderRadius: koolaRadii.pill, overflow: 'hidden', justifyContent: 'center' },
  focusRing: { ...StyleSheet.absoluteFillObject, borderRadius: koolaRadii.pill, borderWidth: 1.5 },
  contentRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 8 },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 15, height: DOCK_H, paddingVertical: 0, textAlignVertical: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 20, marginHorizontal: 8, opacity: 1 },
  filterBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: -2, right: -4, minWidth: 16, height: 16, borderRadius: koolaRadii.pill, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444' },
  filterBadgeText: { fontSize: 10, lineHeight: 12 },
});

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
        <View style={styles.sheetChipRow}><View style={styles.sheetChipWrap}><KoolaChip label={activeProvince ? activeProvince : 'Tất cả tỉnh/thành'} selected={!!activeProvince} onPress={() => setProvinceOpen(true)} /></View>{!!activeProvince ? <View style={styles.sheetChipWrap}><KoolaChip label="Xóa tỉnh/thành" selected={false} onPress={() => onProvinceChange('')} /></View> : null}</View>
        <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Ngành nghề</KoolaText>
        <View style={styles.sheetChipRow}>{BUSINESS_CATEGORIES.filter((c) => c.slug !== 'all').map((cat) => <View key={cat.slug} style={styles.sheetChipWrap}><KoolaChip label={cat.label} selected={activeCategory === cat.slug} onPress={() => onToggleCategory(cat.slug)} /></View>)}</View>
      </View>
      {provinceOpen ? <ProvincePickerSheet value={activeProvince} onChange={(v) => { onProvinceChange(v); setProvinceOpen(false); }} onClose={() => setProvinceOpen(false)} /> : null}
    </KoolaSheet>
  );
};

const BANNER_DISMISSED_KEY = 'connect_banner_dismissed';

const ConnectHomeScreen: React.FC = () => {
  const navigation = useNavigation<ConnectNavProp>();
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const notchPad = insets.top + NOTCH_WING_INSET + NOTCH_HEADER_CONTENT_H + 4;
  const overlayTop = notchPad;
  const listTopPad = notchPad + CHROME_RESERVE;

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
  const activeFilterCount = (activeCategory !== null ? 1 : 0) + (activeProvince ? 1 : 0) + (activeSort !== 'latest' ? 1 : 0);
  const handleQrPress = useCallback(() => setQrVisible(true), []);
  const handleQrClose = useCallback(() => setQrVisible(false), []);
  const handleNavigateProfile = useCallback((userId: string) => { (navigation as any).navigate('Profile', { userId }); }, [navigation]);
  const handleNavigateChat = useCallback((conversationId: string) => { (navigation as any).navigate('ChatTab', { screen: 'Chat', params: { conversationId } }); }, [navigation]);
  const openFilterSheet = useCallback(() => setFilterSheetOpen(true), []);
  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);
  const handleSearchPress = useCallback(() => navigation.navigate('BusinessSearch'), [navigation]);
  const toggleCategory = useCallback((slug: string) => { setActiveCategory((prev) => (prev === slug ? null : slug)); }, []);

  const appliedOffset = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<BusinessAccountItem>>(null);
  const rawOffsetRef = useRef(0);
  const appliedValueRef = useRef(0);
  const travelRef = useRef(0);
  const directionRef = useRef<1 | -1 | 0>(0);
  const isDraggingRef = useRef(false);
  const dockFocusedRef = useRef(false);
  const [dockHidden, setDockHidden] = useState(false);
  useEffect(() => {
    const id = appliedOffset.addListener(({ value }: { value: number }) => {
      appliedValueRef.current = value;
      const hidden = value >= DOCK_HIDE_THRESHOLD - 1;
      setDockHidden((prev) => (prev === hidden ? prev : hidden));
    });
    return () => appliedOffset.removeListener(id);
  }, [appliedOffset]);
  const HYSTERESIS = 10;
  const dockTranslateY = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [0, -DOCK_SLIDE], extrapolate: 'clamp' });
  const dockOpacity = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_MID, DOCK_HIDE_THRESHOLD], outputRange: [1, 0.5, 0], extrapolate: 'clamp' });
  const filterTranslateY = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [0, -DOCK_SLIDE], extrapolate: 'clamp' });
  const filterRowHeight = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [FILTER_ROW_H, FILTER_ROW_H_COLLAPSED], extrapolate: 'clamp' });
  const filterRowGapHeight = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [FILTER_ROW_GAP_BOTTOM, FILTER_ROW_GAP_COLLAPSED], extrapolate: 'clamp' });
  const snapToNearestDetent = useCallback(() => {
    if (dockFocusedRef.current) {
      Animated.timing(appliedOffset, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      rawOffsetRef.current = 0; travelRef.current = 0; directionRef.current = -1; return;
    }
    const v = appliedValueRef.current;
    if (v > 20 && v < 100) {
      const target = v < DOCK_HIDE_MID ? 0 : DOCK_HIDE_THRESHOLD;
      Animated.timing(appliedOffset, { toValue: target, duration: 180, useNativeDriver: false }).start();
      flatListRef.current?.scrollToOffset({ offset: target, animated: true });
      rawOffsetRef.current = target; travelRef.current = 0; directionRef.current = target === 0 ? -1 : 1;
    }
  }, [appliedOffset]);
  const handleFocusChange = useCallback((focused: boolean) => {
    dockFocusedRef.current = focused;
    if (focused) {
      travelRef.current = 0; directionRef.current = -1;
      Animated.timing(appliedOffset, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      if (rawOffsetRef.current > 0) { flatListRef.current?.scrollToOffset({ offset: 0, animated: true }); rawOffsetRef.current = 0; }
    }
  }, [appliedOffset]);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = Math.max(0, e.nativeEvent.contentOffset.y);
    if (dockFocusedRef.current) { if (appliedValueRef.current !== 0) appliedOffset.setValue(0); rawOffsetRef.current = y; return; }
    const delta = y - rawOffsetRef.current; rawOffsetRef.current = y;
    if (y <= 4) { travelRef.current = 0; directionRef.current = -1; appliedOffset.setValue(0); return; }
    if (delta > 0) { travelRef.current = Math.max(0, travelRef.current) + delta; directionRef.current = 1; appliedOffset.setValue(Math.min(DOCK_HIDE_THRESHOLD, y)); }
    else if (delta < 0) { travelRef.current = Math.min(0, travelRef.current) + delta; if (travelRef.current < -HYSTERESIS) { directionRef.current = -1; appliedOffset.setValue(Math.min(DOCK_HIDE_THRESHOLD, y)); } }
  }, [appliedOffset]);
  const handleScrollBeginDrag = useCallback(() => { isDraggingRef.current = true; }, []);
  const handleScrollEndDrag = useCallback(() => { isDraggingRef.current = false; snapToNearestDetent(); }, [snapToNearestDetent]);
  const handleMomentumScrollEnd = useCallback(() => { if (!isDraggingRef.current) snapToNearestDetent(); }, [snapToNearestDetent]);

  const renderItem = useCallback(({ item }: { item: BusinessAccountItem }) => (
    <BusinessCard item={item} onPress={() => (navigation as any).navigate('BusinessProfile', { businessId: item._id })} onMessagePress={() => handleMessage(item)} />
  ), [navigation, handleMessage]);

  if (error && items.length === 0 && !loading) {
    return (
      <View style={styles.screen}>
        <View style={{ paddingTop: overlayTop }}><View style={styles.contentInset}><ConnectSearchDock semantic={semantic} onSearchPress={handleSearchPress} activeFilterCount={activeFilterCount} onOpenFilters={openFilterSheet} onFocusChange={handleFocusChange} /></View></View>
        <ListErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {!contentReady ? (
        <View style={[styles.screen, { paddingTop: overlayTop }]}>
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={DOCK_H} radius={koolaRadii.pill} />
            <View style={{ flexDirection: 'row', marginTop: DOCK_GAP_BOTTOM, alignItems: 'center' }}>
              <KoolaSkeleton width={80} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={90} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={110} height={FILTER_ROW_H} radius={koolaRadii.pill} />
            </View>
          </View>
          <View style={styles.listContent}>
            {[0, 1, 2].map((i) => <KoolaSkeleton key={i} width="100%" height={88} radius={koolaRadii.md} style={{ marginTop: i === 0 ? FILTER_ROW_GAP_BOTTOM : 6 }} />)}
          </View>
        </View>
      ) : (
        <Animated.FlatList ref={flatListRef} removeClippedSubviews={false} data={items} keyExtractor={(item) => item._id} renderItem={renderItem} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50}
          ListHeaderComponent={!bannerDismissed ? <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}><ConnectContextBanner onCreatePress={() => (navigation as any).navigate('PersonalTab', { screen: 'AccountList' })} onDismiss={handleDismissBanner} /></View> : null}
          ListEmptyComponent={loading ? null : <EmptyConnect activeCategory={effectiveCategory} activeRelationship={activeRelationship === 'all' ? undefined : activeRelationship} activeProvince={activeProvince || undefined} activeSort={activeSort} onClearFilters={handleClearFilters} />}
          ListFooterComponent={hasMore ? <ActivityIndicator style={{ paddingVertical: 16 }} size="small" color={semantic.action.primary} /> : null}
          onEndReached={loadMore} onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={semantic.action.primary} />}
          contentContainerStyle={[styles.listContent, { paddingTop: listTopPad, paddingBottom: tabBarInset }]}
          showsVerticalScrollIndicator={false} style={styles.screenTransparent}
          onScroll={handleScroll} scrollEventThrottle={16} onScrollBeginDrag={handleScrollBeginDrag} onScrollEndDrag={handleScrollEndDrag} onMomentumScrollEnd={handleMomentumScrollEnd}
        />
      )}
      {contentReady ? (
        <View style={[styles.overlayChrome, { top: overlayTop }]} pointerEvents="box-none">
          <View style={styles.contentInset} pointerEvents="box-none">
            <Animated.View pointerEvents={dockHidden ? 'none' : 'auto'} style={{ transform: [{ translateY: dockTranslateY }], opacity: dockOpacity }}>
              <ConnectSearchDock semantic={semantic} onSearchPress={handleSearchPress} activeFilterCount={activeFilterCount} onOpenFilters={openFilterSheet} onFocusChange={handleFocusChange} />
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: filterTranslateY }], height: filterRowHeight, marginTop: DOCK_GAP_BOTTOM, overflow: 'hidden' }}>
              <View style={{ height: FILTER_ROW_H }}><FilterRow styles={styles} activeRelationship={activeRelationship} onSelectRelationship={handleSelectRelationship} /></View>
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: filterTranslateY }], height: filterRowGapHeight }} />
          </View>
        </View>
      ) : null}
      {filterSheetOpen ? <ConnectFilterSheet styles={styles} activeCategory={activeCategory} activeProvince={activeProvince} activeSort={activeSort} hasActiveFilters={activeFilterCount > 0} onToggleCategory={toggleCategory} onProvinceChange={setActiveProvince} onSortChange={setActiveSort} onClear={handleClearFilters} onClose={closeFilterSheet} bottomInset={insets.bottom} /> : null}
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
    overlayChrome: { position: 'absolute', left: 0, right: 0, paddingTop: DOCK_GAP_TOP, zIndex: koolaZIndex.sticky },
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
