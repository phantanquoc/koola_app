import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, FlatList, InteractionManager, RefreshControl, ActivityIndicator, StyleSheet, TextInput, AccessibilityInfo, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
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
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import { prefersReducedMotion } from '../../ui/tokens/motion';
import { ChromeHeaderBox, getChromeBoxHeight } from '../../components/ChromeHeaderBox';
import { ChromeGlassSheet } from '../../components/ChromeGlassSheet';
import { HeaderDockAction, HeaderDockGhostAction } from '../../components/HeaderSearchDock';
import { MOCK_BUSINESSES } from './mockBusinesses';
import { filterMocks, mergeDiscoveryItems } from './mockFilters';
import { BUSINESS_CATEGORIES } from './constants';

const SUB_MENU_BAR_H = 40;
/** Bar stack order — above the glass sheet (zIndex 10), below the header box (20). */
const SUB_MENU_BAR_Z = 11;

/**
 * Sub-menu relationship bar — the Connect counterpart of Chat's sub-tab bar.
 * Text-only, three evenly divided items, no pill backgrounds and no horizontal
 * scroller. Active item = primary-coloured label + the same 20×2 gradient
 * underline Chat uses; the gradient is painted via SVG (not gradient-filled
 * text, which would need either a masked-view dependency or `SvgText` and so
 * bypass `KoolaText`'s font-scaling contract).
 */
const RelationshipSubMenu: React.FC<{ activeRelationship: string; onSelectRelationship: (slug: string) => void }> = ({ activeRelationship, onSelectRelationship }) => {
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const isDark = resolvedScheme === 'dark';
  const gradOrange = isDark ? '#FF9A3D' : '#FF8A1A';
  const gradBlue = isDark ? '#4D8DF7' : '#2563EB';
  const instanceId = React.useId();
  const gradId = `connectSubMenu-${instanceId.replace(/:/g, '_')}`;

  return (
    <View style={subMenuStyles.row}>
      {RELATIONSHIP_FILTERS.map((rel) => {
        const selected = activeRelationship === rel.slug;
        return (
          <Pressable
            key={rel.slug}
            accessibilityRole="button"
            accessibilityLabel={rel.label}
            accessibilityState={{ selected }}
            onPress={() => { if (selected && rel.slug !== 'all') onSelectRelationship('all'); else if (!selected) onSelectRelationship(rel.slug); }}
            style={subMenuStyles.item}>
            <KoolaText
              variant="caption"
              weight="700"
              numberOfLines={1}
              style={{ color: selected ? semantic.action.primary : semantic.text.muted }}>
              {rel.label}
            </KoolaText>
            {selected ? (
              <View style={subMenuStyles.underline}>
                <Svg width={20} height={2} viewBox="0 0 20 2">
                  <Defs>
                    <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={gradOrange} />
                      <Stop offset="1" stopColor={gradBlue} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="20" height="2" rx="1" fill={`url(#${gradId})`} />
                </Svg>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

const subMenuStyles = StyleSheet.create({
  // No `gap`: RN 0.76/Hermes breaks row containers that combine `gap` with
  // `flex: 1` children. Space-between + child flex handles the division.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: SUB_MENU_BAR_H,
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  underline: {
    position: 'absolute',
    bottom: 5,
    width: 20,
    height: 2,
    borderRadius: 1,
  },
});

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
  const styles = useMemo(() => makeStyles(), []);
  const isDark = resolvedScheme === 'dark';
  const blockH = getChromeBoxHeight(insets.top);
  const subMenuTop = blockH;
  // Resting inset = header block + sub-menu bar. No filter-row strip: the
  // sub-menu bar IS the strip, and it collapses into the header on scroll.
  const listTopPad = blockH + SUB_MENU_BAR_H;
  const { notify: notifyComingSoon, toast: comingSoonToast } = useComingSoonToast();
  // Both wordmark-row icons go through the shared ghost geometry so they stay
  // in sync with HeaderSearchDock (size 36, glyph 20, muted, ghost press).
  const headerActions = (
    <>
      <HeaderDockGhostAction icon="chat-bubble-outline" onPress={() => notifyComingSoon()} accessibilityLabel="Tin nhắn" />
      <HeaderDockGhostAction icon="notifications-none" onPress={() => notifyComingSoon()} accessibilityLabel="Thông báo" />
    </>
  );

  const hiddenProgress = useSharedValue(0);
  const scrolledProgress = useSharedValue(0);
  const prevOffsetY = useSharedValue(0);
  const travel = useSharedValue(0);
  // UI-thread copy of the platform reduce-motion flag. Read synchronously by the
  // scroll worklet (calling prefersReducedMotion() inside a worklet would hop
  // threads), kept in sync when the system setting toggles mid-session.
  const reduceMotionSV = useSharedValue(prefersReducedMotion());
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
      reduceMotionSV.value = enabled;
    });
    return () => {
      if (sub && typeof (sub as { remove?: () => void }).remove === 'function') {
        (sub as { remove: () => void }).remove();
      }
    };
  }, [reduceMotionSV]);

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const offsetY = Math.max(0, event.contentOffset.y);
      if (offsetY > 8 && scrolledProgress.value !== 1) {
        scrolledProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      } else if (offsetY <= 4 && scrolledProgress.value !== 0) {
        scrolledProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
      // Reduce-motion: keep the sub-menu bar pinned visible and skip every
      // scroll-driven animation (the lift shadow above still applies — it is
      // depth, not motion).
      if (reduceMotionSV.value) {
        if (hiddenProgress.value !== 0) hiddenProgress.value = 0;
        travel.value = 0;
        prevOffsetY.value = offsetY;
        return;
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
      } else if (travel.value < -20 && hiddenProgress.value !== 0) {
        hiddenProgress.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      }
    },
  });

  const subMenuVisibilityStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, hiddenProgress.value));
    const h = t * t * (3 - 2 * t);
    return {
      height: SUB_MENU_BAR_H * (1 - h),
      opacity: 1 - h,
      transform: [{ translateY: -SUB_MENU_BAR_H * h }],
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
    const mocks = filterMocks(MOCK_BUSINESSES, {
      category: effectiveCategory,
      province: activeProvince || undefined,
      relationship: activeRelationship,
      sort: activeSort,
    });
    return mergeDiscoveryItems(mocks, items as unknown as typeof mocks);
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

  const activeSecondaryFilterCount =
    (activeSort !== 'latest' ? 1 : 0) + (activeProvince ? 1 : 0) + (activeCategory !== null ? 1 : 0);
  const handleQrPress = useCallback(() => setQrVisible(true), []);
  const handleFilterPress = useCallback(() => setFilterSheetOpen(true), []);

  // Sheets are hosted once and stay mounted only while open; shared by the
  // normal and error branches so both states keep the dock actions working.
  const bottomSheets = (
    <>
      {filterSheetOpen ? <ConnectFilterSheet styles={styles} activeCategory={activeCategory} activeProvince={activeProvince} activeSort={activeSort} hasActiveFilters={activeSecondaryFilterCount > 0} onToggleCategory={toggleCategory} onProvinceChange={setActiveProvince} onSortChange={setActiveSort} onClear={handleClearFilters} onClose={closeFilterSheet} bottomInset={insets.bottom} /> : null}
      <QrScannerModal visible={qrVisible} onClose={handleQrClose} onNavigateProfile={handleNavigateProfile} onNavigateChat={handleNavigateChat} />
    </>
  );

  // Single chrome composition shared by the normal list, the skeleton, and the
  // error branch — glass-less header box (the sheet paints the glass), the
  // unified glass sheet, and the text sub-menu bar. Extracted so the three
  // states cannot drift into different chrome shapes. headerActions (message +
  // notif) live INSIDE the shared box so we keep one top:0 sheet — no second
  // NotchHeader that would clip the dock.
  const chrome = contentReady ? (
    <>
      <ChromeGlassSheet blockH={blockH} barH={SUB_MENU_BAR_H} hiddenProgress={hiddenProgress} scrolledProgress={scrolledProgress} />
      <ChromeHeaderBox
        insetsTop={insets.top}
        isDark={isDark}
        contentReady={contentReady}
        withGlass={false}
        onSearchPress={handleSearchPress}
        headerActions={headerActions}
        hiddenProgress={hiddenProgress}
        rightActions={
          <>
            <HeaderDockAction
              icon="qr-code-scanner"
              onPress={handleQrPress}
              accessibilityLabel="Quét mã QR"
              accessibilityHint="Mở quét mã QR"
            />
            <HeaderDockAction
              icon="filter-alt"
              onPress={handleFilterPress}
              accessibilityLabel="Bộ lọc"
              accessibilityHint="Mở bộ lọc tìm kiếm"
              badgeCount={activeSecondaryFilterCount}
              badgeAccessibilityText={`${activeSecondaryFilterCount} bộ lọc đang áp dụng`}
            />
          </>
        }
      />
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: 'absolute', top: subMenuTop, left: 0, right: 0, overflow: 'hidden', zIndex: SUB_MENU_BAR_Z }, subMenuVisibilityStyle]}>
        <RelationshipSubMenu activeRelationship={activeRelationship} onSelectRelationship={handleSelectRelationship} />
      </Animated.View>
    </>
  ) : null;

  if (error && displayItems.length === 0 && !loading) {
    return (
      <View style={styles.screen}>
        {chrome}
        <View style={{ paddingTop: listTopPad }}><ListErrorState message={error} onRetry={refresh} /></View>
        {bottomSheets}
        {comingSoonToast}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {!contentReady ? (
        <View style={[styles.screen, { paddingTop: listTopPad }]}>
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={SUB_MENU_BAR_H} radius={koolaRadii.pill} />
          </View>
          <View style={styles.listContent}>
            {[0, 1, 2].map((i) => <KoolaSkeleton key={i} width="100%" height={88} radius={koolaRadii.md} style={{ marginTop: i === 0 ? 8 : 6 }} />)}
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
      {chrome}
      {bottomSheets}
      {comingSoonToast}
    </View>
  );
};

const makeStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    screenTransparent: { flex: 1, backgroundColor: 'transparent' },
    listContent: { paddingHorizontal: 6 },
    contentInset: { paddingHorizontal: 12 },
    sheetContent: { paddingHorizontal: 20, paddingTop: 4 },
    sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetClearBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    sheetSectionTitle: { marginTop: 12, marginBottom: 8 },
    sheetChipRow: { flexDirection: 'row', flexWrap: 'wrap' },
    sheetChipWrap: { marginRight: 8, marginBottom: 8 },
  });

export default ConnectHomeScreen;
