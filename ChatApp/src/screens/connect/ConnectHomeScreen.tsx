import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import KoolaHeader from '../../components/KoolaHeader';
import BusinessCard from '../../components/connect/BusinessCard';
import EmptyConnect from '../../components/connect/EmptyConnect';
import ListErrorState from '../../components/connect/ListErrorState';
import BusinessCardSkeleton from '../../components/connect/BusinessCardSkeleton';
import ConnectContextBanner from '../../components/connect/ConnectContextBanner';
import SortMenu from '../../components/connect/SortMenu';
import ProvincePicker from '../../components/connect/ProvincePicker';
import { useBusinessList } from '../../hooks/useBusinessList';
import { businessesApi, conversationsApi } from '../../services/api/apiService';
import { TAB_BAR_FLOATING_INSET } from '../../navigation/MainNavigator';
import { BUSINESS_CATEGORIES, RELATIONSHIP_FILTERS } from './constants';
import type { Business, BusinessSort } from '../../types';
import {
  KoolaChip,
  KoolaText,
  koolaColors,
  koolaRadii,
} from '../../ui';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ConnectNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

// ─── Shared business actions ───────────────────────────────────────────────────

function useBusinessActions(navigation: ConnectNavProp) {
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const navigateToChat = useCallback(
    (conversationId: string) => {
      (navigation as any).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId },
      });
    },
    [navigation],
  );

  const handleConnectAndChat = useCallback(
    async (
      business: Business,
      updateItem: (id: string, updates: Partial<Business>) => void,
    ) => {
      setConnectingId(business._id);
      // Optimistic update
      updateItem(business._id, { isConnected: true });
      try {
        await businessesApi.connect(business._id);
      } catch (err) {
        // Rollback on connect failure
        updateItem(business._id, { isConnected: false });
        console.warn('Connect failed:', err);
        setConnectingId(null);
        return;
      }
      try {
        const { conversation } = await conversationsApi.startDirectChat(business.ownerId);
        navigateToChat(conversation._id);
      } catch (err) {
        console.warn('Start direct chat failed after connect:', err);
      } finally {
        setConnectingId(null);
      }
    },
    [navigateToChat],
  );

  const handleMessage = useCallback(
    async (business: Business) => {
      try {
        const { conversation } = await conversationsApi.startDirectChat(business.ownerId);
        navigateToChat(conversation._id);
      } catch (err) {
        console.warn('Start direct chat failed:', err);
      }
    },
    [navigateToChat],
  );

  return { connectingId, handleConnectAndChat, handleMessage };
}

// ─── RelationshipTabBar ───────────────────────────────────────────────────────
// 3-tab horizontal bar: Tất cả / Đối tác / Nhà cung cấp

interface RelationshipTabBarProps {
  activeRelationship: string;
  onSelectRelationship: (slug: string) => void;
}

const RelationshipTabBar: React.FC<RelationshipTabBarProps> = ({
  activeRelationship,
  onSelectRelationship,
}) => {
  return (
    <View style={tabBarStyles.container} accessibilityRole="tablist">
      {RELATIONSHIP_FILTERS.map((rel) => {
        const isActive = activeRelationship === rel.slug;
        return (
          <Pressable
            key={rel.slug}
            style={[tabBarStyles.tab, isActive && tabBarStyles.tabActive]}
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

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
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
    borderBottomColor: koolaColors.primary,
  },
});

// ─── FilterBar ──────────────────────────────────────────────────────────────
// Unified filter row: category chips + province picker + sort menu.
// Collapses 3 visual layers into 1 scrollable row.

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
}

const FilterBar: React.FC<FilterBarProps> = ({
  activeCategory,
  onSelectCategory,
  activeRelationship,
  activeProvince,
  onProvinceChange,
  activeSort,
  onSortChange,
}) => {
  const showCategories = activeRelationship !== 'all';
  const activeFilterCount =
    (activeCategory ? 1 : 0) +
    (activeProvince ? 1 : 0) +
    (activeSort !== 'latest' ? 1 : 0);

  return (
    <View style={filterBarStyles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={filterBarStyles.scrollContent}
        accessibilityRole="toolbar">
        {/* Province + Sort controls — always visible */}
        <ProvincePicker
          value={activeProvince}
          onChange={onProvinceChange}
          placeholder="Tỉnh/Thành"
        />
        <SortMenu value={activeSort} onChange={onSortChange} />

        {/* Active filter count badge */}
        {activeFilterCount > 0 && (
          <View style={filterBarStyles.countBadge}>
            <KoolaText variant="caption" tone="surface" weight="700">
              {activeFilterCount}
            </KoolaText>
          </View>
        )}

        {/* Category chips — only for specific relationship tabs */}
        {showCategories && (
          <>
            <View style={filterBarStyles.divider} />
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
                    filterBarStyles.iconChip,
                    isActive && filterBarStyles.iconChipActive,
                  ]}
                  onPress={() => onSelectCategory(isActive ? null : cat.slug)}
                  accessibilityRole="button"
                  accessibilityLabel={cat.label}
                  accessibilityState={{ selected: isActive }}>
                  <MaterialIcons
                    name={CATEGORY_ICON_MAP[cat.slug] || cat.icon}
                    size={14}
                    color={isActive ? koolaColors.surface : koolaColors.primary}
                  />
                  <KoolaText
                    variant="caption"
                    weight="700"
                    tone={isActive ? 'surface' : 'muted'}>
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

const filterBarStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: koolaColors.line,
    marginHorizontal: 4,
  },
  iconChip: {
    height: 34,
    borderRadius: koolaRadii.pill,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: koolaColors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
  },
  iconChipActive: {
    backgroundColor: koolaColors.primary,
    borderColor: koolaColors.primary,
  },
  countBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: koolaColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── BusinessListTab ───────────────────────────────────────────────────────────

interface BusinessListTabProps {
  navigation: ConnectNavProp;
  activeCategory: string | null;
  activeRelationship: string;
  activeSort: BusinessSort;
  activeProvince: string;
  onClearFilters: () => void;
}

const BusinessListTab: React.FC<BusinessListTabProps> = ({
  navigation,
  activeCategory,
  activeRelationship,
  activeSort,
  activeProvince,
  onClearFilters,
}) => {
  const { items, loading, refreshing, hasMore, error, loadMore, refresh, updateItem } =
    useBusinessList({
      category: activeCategory ?? undefined,
      relationshipType: activeRelationship === 'all' ? undefined : activeRelationship,
      sort: activeSort,
      province: activeProvince || undefined,
    });

  const { connectingId, handleConnectAndChat, handleMessage } =
    useBusinessActions(navigation);

  const renderItem = useCallback(
    ({ item }: { item: Business }) => (
      <BusinessCard
        business={item}
        onPress={() =>
          navigation.navigate('BusinessProfile', {
            businessId: item._id,
          })
        }
        onConnectAndChatPress={() => handleConnectAndChat(item, updateItem)}
        onMessagePress={() => handleMessage(item)}
        isConnecting={connectingId === item._id}
      />
    ),
    [navigation, handleConnectAndChat, handleMessage, connectingId, updateItem],
  );

  // Error state — show when fetch failed and no cached items
  if (error && items.length === 0 && !loading) {
    return (
      <View style={listStyles.container}>
        <ListErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <View style={listStyles.container}>
      {loading && items.length === 0 ? (
        <View>
          <BusinessCardSkeleton />
          <BusinessCardSkeleton />
          <BusinessCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          ListEmptyComponent={
            loading ? null : (
              <EmptyConnect
                activeCategory={activeCategory ?? undefined}
                activeRelationship={activeRelationship === 'all' ? undefined : activeRelationship}
                onClearFilters={onClearFilters}
              />
            )
          }
          ListFooterComponent={
            hasMore ? (
              <ActivityIndicator
                style={listStyles.footer}
                size="small"
                color={koolaColors.primary}
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={koolaColors.primary}
            />
          }
          contentContainerStyle={listStyles.listContent}
        />
      )}
    </View>
  );
};

const listStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  loader: {
    marginTop: 40,
  },
  footer: {
    paddingVertical: 16,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: TAB_BAR_FLOATING_INSET + 16,
  },
});

// ─── ConnectHomeScreen ────────────────────────────────────────────────────────

const BANNER_DISMISSED_KEY = 'connect_banner_dismissed';

const ConnectHomeScreen: React.FC = () => {
  const navigation = useNavigation<ConnectNavProp>();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeRelationship, setActiveRelationship] = useState('all');
  const [activeSort, setActiveSort] = useState<BusinessSort>('latest');
  const [activeProvince, setActiveProvince] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(true); // default hidden until loaded

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveRelationship(slug);
    setActiveCategory(null);
  }, []);

  return (
    <View style={styles.container}>
      <KoolaHeader
        searchPlaceholder="Tìm doanh nghiệp..."
        onSearchPress={() => navigation.navigate('BusinessSearch')}
        onQrPress={() => {}}
        onAddPress={() => navigation.navigate('CreateBusiness')}
      />

      <RelationshipTabBar
        activeRelationship={activeRelationship}
        onSelectRelationship={handleSelectRelationship}
      />

      {/* Unified filter bar — categories + province + sort in one row */}
      <FilterBar
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        activeRelationship={activeRelationship}
        activeProvince={activeProvince}
        onProvinceChange={setActiveProvince}
        activeSort={activeSort}
        onSortChange={setActiveSort}
      />

      {/* Onboarding banner — shown once for new users, above list */}
      {!bannerDismissed && (
        <ConnectContextBanner
          onCreatePress={() => navigation.navigate('CreateBusiness')}
          onDismiss={handleDismissBanner}
        />
      )}

      <BusinessListTab
        navigation={navigation}
        activeCategory={activeRelationship === 'all' ? null : activeCategory}
        activeRelationship={activeRelationship}
        activeSort={activeSort}
        activeProvince={activeProvince}
        onClearFilters={handleClearFilters}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
});

export default ConnectHomeScreen;
