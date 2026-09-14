import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  InteractionManager,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import KoolaHeader from '../../components/KoolaHeader';
import EmptyConnect from '../../components/connect/EmptyConnect';
import ListErrorState from '../../components/connect/ListErrorState';
import BusinessCardSkeleton from '../../components/connect/BusinessCardSkeleton';
import BusinessCard from '../../components/connect/BusinessCard';
import ConnectContextBanner from '../../components/connect/ConnectContextBanner';
import SortMenu from '../../components/connect/SortMenu';
import ProvincePicker from '../../components/connect/ProvincePicker';
import QrScannerModal from '../main/QrScannerModal';
import { useAccountDiscovery } from '../../hooks/useAccountDiscovery';
import { conversationsApi } from '../../services/api/apiService';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { BUSINESS_CATEGORIES, RELATIONSHIP_FILTERS } from './constants';
import type { BusinessSort } from '../../types';
import {
  KoolaChip,
  KoolaText,
  koolaRadii,
  useKoolaToast,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

type ConnectNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

// ─── Shared account actions ───────────────────────────────────────────────────
// "Nhắn tin" opens a DM with the business account id directly (D7).

function useAccountActions(navigation: ConnectNavProp) {
  const toast = useKoolaToast();
  const navigateToChat = useCallback(
    (conversationId: string) => {
      (navigation as any).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId },
      });
    },
    [navigation],
  );

  const handleMessage = useCallback(
    async (account: BusinessAccountItem) => {
      try {
        const { conversation } = await conversationsApi.startDirectChat(account._id);
        navigateToChat(conversation._id);
      } catch (err) {
        if (__DEV__) console.warn('Start direct chat failed:', err);
        toast.show('Không thể bắt đầu trò chuyện. Bạn thử lại nhé.', 'danger');
      }
    },
    [navigateToChat, toast],
  );

  return { handleMessage, navigateToChat };
}

// ─── RelationshipTabBar ───────────────────────────────────────────────────────

interface RelationshipTabBarProps {
  activeRelationship: string;
  onSelectRelationship: (slug: string) => void;
  semantic: SemanticTokens;
}

const RelationshipTabBar: React.FC<RelationshipTabBarProps> = ({
  activeRelationship,
  onSelectRelationship,
  semantic,
}) => {
  const styles = useMemo(() => makeTabBarStyles(semantic), [semantic]);
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {RELATIONSHIP_FILTERS.map((rel) => {
        const isActive = activeRelationship === rel.slug;
        return (
          <Pressable
            key={rel.slug}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelectRelationship(rel.slug)}
            accessibilityRole="tab"
            accessibilityLabel={rel.label}
            accessibilityState={{ selected: isActive }}>
            <KoolaText
              variant="label"
              weight={isActive ? '700' : '600'}
              tone={isActive ? 'primary' : 'muted'}>
              {rel.label}
            </KoolaText>
          </Pressable>
        );
      })}
    </View>
  );
};

const makeTabBarStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: t.surface.level1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.subtle,
      paddingHorizontal: 16,
    },
    tab: {
      flex: 1,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: t.action.primary,
    },
  });

// ─── FilterBar ──────────────────────────────────────────────────────────────

const CATEGORY_ICON_MAP: Record<string, string> = {
  logistics: 'local-shipping',
  'domestic-supplier': 'store',
  'raw-materials': 'inventory',
  packaging: 'archive',
  manufacturing: 'precision-manufacturing',
  'food-beverage': 'restaurant',
  technology: 'computer',
  finance: 'account-balance',
  'real-estate': 'apartment',
  retail: 'shopping-bag',
  healthcare: 'local-hospital',
  education: 'school',
};

interface FilterBarProps {
  activeCategory: string | null;
  onSelectCategory: (slug: string | null) => void;
  activeRelationship: string;
  activeProvince: string;
  onProvinceChange: (province: string) => void;
  activeSort: BusinessSort;
  onSortChange: (sort: BusinessSort) => void;
  semantic: SemanticTokens;
}

const FilterBar: React.FC<FilterBarProps> = ({
  activeCategory,
  onSelectCategory,
  activeRelationship,
  activeProvince,
  onProvinceChange,
  activeSort,
  onSortChange,
  semantic,
}) => {
  const styles = useMemo(() => makeFilterBarStyles(semantic), [semantic]);
  const showCategories = activeRelationship !== 'all';
  const activeFilterCount =
    (activeCategory ? 1 : 0) +
    (activeProvince ? 1 : 0) +
    (activeSort !== 'latest' ? 1 : 0);

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="toolbar">
        <ProvincePicker
          value={activeProvince}
          onChange={onProvinceChange}
          placeholder="Tỉnh/Thành"
        />
        <SortMenu value={activeSort} onChange={onSortChange} />

        {activeFilterCount > 0 && (
          <View style={styles.countBadge}>
            <KoolaText variant="caption" tone="surface" weight="700">
              {activeFilterCount}
            </KoolaText>
          </View>
        )}

        {showCategories && (
          <>
            <View style={styles.divider} />
            <KoolaChip
              label="Tất cả"
              selected={activeCategory === null}
              onPress={() => onSelectCategory(null)}
              accessibilityState={{ selected: activeCategory === null }}
            />
            {BUSINESS_CATEGORIES.filter((cat) => cat.slug !== 'all').map((cat) => {
              const isActive = activeCategory === cat.slug;
              return (
                <Pressable
                  key={cat.slug}
                  style={[
                    styles.iconChip,
                    isActive && styles.iconChipActive,
                  ]}
                  onPress={() => onSelectCategory(isActive ? null : cat.slug)}
                  accessibilityRole="button"
                  accessibilityLabel={cat.label}
                  accessibilityState={{ selected: isActive }}>
                  <MaterialIcons
                    name={CATEGORY_ICON_MAP[cat.slug] || cat.icon}
                    size={14}
                    color={isActive ? semantic.text.onAction : semantic.action.primary}
                  />
                  <KoolaText
                    variant="caption"
                    weight="700"
                    tone={isActive ? 'surface' : 'muted'}
                    style={styles.iconChipLabel}>
                    {cat.label}
                  </KoolaText>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const makeFilterBarStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    wrapper: {
      backgroundColor: t.surface.level1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.subtle,
    },
    scrollContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    divider: {
      width: StyleSheet.hairlineWidth,
      height: 24,
      backgroundColor: t.border.subtle,
      marginHorizontal: 4,
    },
    iconChip: {
      height: 34,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.bg.canvas,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border.subtle,
      marginRight: 8,
    },
    iconChipActive: {
      backgroundColor: t.action.primary,
      borderColor: t.action.primary,
    },
    iconChipLabel: {
      marginLeft: 4,
    },
    countBadge: {
      width: 22,
      height: 22,
      borderRadius: koolaRadii.pill,
      backgroundColor: t.action.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
  });

// ─── AccountListTab ───────────────────────────────────────────────────────────

const ACCOUNT_CATEGORY_LABELS: Record<string, string> = {};
BUSINESS_CATEGORIES.forEach((c) => { ACCOUNT_CATEGORY_LABELS[c.slug] = c.label; });

interface AccountListTabProps {
  navigation: ConnectNavProp;
  activeCategory: string | null;
  activeRelationship: string;
  activeSort: BusinessSort;
  activeProvince: string;
  onClearFilters: () => void;
  semantic: SemanticTokens;
}

const AccountListTab: React.FC<AccountListTabProps> = ({
  navigation,
  activeCategory,
  activeRelationship,
  activeSort,
  activeProvince,
  onClearFilters,
  semantic,
}) => {
  const tabBarInset = useTabBarBottomInset();
  const styles = useMemo(() => makeListStyles(semantic), [semantic]);
  const { items, loading, refreshing, hasMore, error, loadMore, refresh } =
    useAccountDiscovery({
      businessCategory: activeCategory ?? undefined,
      relationshipType: activeRelationship === 'all' ? undefined : activeRelationship,
      sort: activeSort,
      province: activeProvince || undefined,
    });

  const { handleMessage } = useAccountActions(navigation);

  const renderItem = useCallback(
    ({ item }: { item: BusinessAccountItem }) => (
      <BusinessCard
        item={item}
        onPress={() =>
          (navigation as any).navigate('BusinessProfile', { businessId: item._id })
        }
        onMessagePress={() => handleMessage(item)}
      />
    ),
    [navigation, handleMessage],
  );

  if (error && items.length === 0 && !loading) {
    return (
      <View style={styles.container}>
        <ListErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading && items.length === 0 ? (
        <View>
          <BusinessCardSkeleton />
          <BusinessCardSkeleton />
          <BusinessCardSkeleton />
        </View>
      ) : (
        <FlatList
          removeClippedSubviews={false}
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={
            loading ? null : (
              <EmptyConnect
                activeCategory={activeCategory ?? undefined}
                activeRelationship={activeRelationship === 'all' ? undefined : activeRelationship}
                activeProvince={activeProvince || undefined}
                activeSort={activeSort}
                onClearFilters={onClearFilters}
              />
            )
          }
          ListFooterComponent={
            hasMore ? (
              <ActivityIndicator
                style={styles.footer}
                size="small"
                color={semantic.action.primary}
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={semantic.action.primary}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
        />
      )}
    </View>
  );
};

const makeListStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    footer: {
      paddingVertical: 16,
    },
    listContent: {
      paddingTop: 8,
    },
  });

// ─── ConnectHomeScreen ────────────────────────────────────────────────────────

const BANNER_DISMISSED_KEY = 'connect_banner_dismissed';

const ConnectHomeScreen: React.FC = () => {
  const navigation = useNavigation<ConnectNavProp>();
  const { tokens } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(() => makeScreenStyles(), []);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeRelationship, setActiveRelationship] = useState('all');
  const [activeSort, setActiveSort] = useState<BusinessSort>('latest');
  const [activeProvince, setActiveProvince] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [qrVisible, setQrVisible] = useState(false);

  // ─── First-mount defer: paint chrome immediately, defer heavy AccountListTab ─
  const [contentReady, setContentReady] = useState(false);
  const contentReadyFired = useRef(false);

  useEffect(() => {
    if (contentReadyFired.current) return;
    const task = InteractionManager.runAfterInteractions(() => {
      contentReadyFired.current = true;
      setContentReady(true);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(BANNER_DISMISSED_KEY).then((val) => {
      if (val !== 'true') setBannerDismissed(false);
    });
  }, []);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissed(true);
    AsyncStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveCategory(null);
    setActiveRelationship('all');
    setActiveSort('latest');
    setActiveProvince('');
  }, []);

  const handleSelectRelationship = useCallback((slug: string) => {
    setActiveRelationship(slug);
    setActiveCategory(null);
  }, []);

  // QR scanner callbacks
  const handleQrPress = useCallback(() => setQrVisible(true), []);
  const handleQrClose = useCallback(() => setQrVisible(false), []);
  const handleNavigateProfile = useCallback((userId: string) => {
    (navigation as any).navigate('Profile', { userId });
  }, [navigation]);
  const handleNavigateChat = useCallback((conversationId: string) => {
    (navigation as any).navigate('ChatTab', {
      screen: 'Chat',
      params: { conversationId },
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <KoolaHeader
        searchPlaceholder="Tìm doanh nghiệp..."
        onSearchPress={() => navigation.navigate('BusinessSearch')}
        onQrPress={handleQrPress}
        onAddPress={() =>
          (navigation as any).navigate('PersonalTab', { screen: 'AccountList' })
        }
      />

      <RelationshipTabBar
        activeRelationship={activeRelationship}
        onSelectRelationship={handleSelectRelationship}
        semantic={semantic}
      />

      <FilterBar
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        activeRelationship={activeRelationship}
        activeProvince={activeProvince}
        onProvinceChange={setActiveProvince}
        activeSort={activeSort}
        onSortChange={setActiveSort}
        semantic={semantic}
      />

      {!bannerDismissed && (
        <ConnectContextBanner
          onCreatePress={() =>
            (navigation as any).navigate('PersonalTab', { screen: 'AccountList' })
          }
          onDismiss={handleDismissBanner}
        />
      )}

      {!contentReady ? (
        // Skeleton shell sized to business card list layout
        <View style={{ flex: 1, paddingTop: 8 }}>
          <BusinessCardSkeleton />
          <BusinessCardSkeleton />
          <BusinessCardSkeleton />
          <BusinessCardSkeleton />
        </View>
      ) : (
        <AccountListTab
          navigation={navigation}
          activeCategory={activeRelationship === 'all' ? null : activeCategory}
          activeRelationship={activeRelationship}
          activeSort={activeSort}
          activeProvince={activeProvince}
          onClearFilters={handleClearFilters}
          semantic={semantic}
        />
      )}

      <QrScannerModal
        visible={qrVisible}
        onClose={handleQrClose}
        onNavigateProfile={handleNavigateProfile}
        onNavigateChat={handleNavigateChat}
      />
    </View>
  );
};

const makeScreenStyles = () =>
  StyleSheet.create({
    // Transparent so the ConnectTabStack light field shows through the card
    // gaps — same canvas treatment as the Chat/Shopping/Personal tabs.
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
  });

export default ConnectHomeScreen;
