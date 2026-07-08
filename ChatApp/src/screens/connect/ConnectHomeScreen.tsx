import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
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
import ConnectContextBanner from '../../components/connect/ConnectContextBanner';
import SortMenu from '../../components/connect/SortMenu';
import ProvincePicker from '../../components/connect/ProvincePicker';
import { useAccountDiscovery } from '../../hooks/useAccountDiscovery';
import { conversationsApi } from '../../services/api/apiService';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { BUSINESS_CATEGORIES, RELATIONSHIP_FILTERS } from './constants';
import type { BusinessSort } from '../../types';
import {
  KoolaChip,
  KoolaText,
  koolaColors,
  koolaRadii,
} from '../../ui';

type ConnectNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

// ─── Shared account actions ───────────────────────────────────────────────────
// "Nhắn tin" opens a DM with the business account id directly (D7).

function useAccountActions(navigation: ConnectNavProp) {
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
        console.warn('Start direct chat failed:', err);
      }
    },
    [navigateToChat],
  );

  return { handleMessage };
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

// ─── AccountListTab ───────────────────────────────────────────────────────────
// Replaces BusinessListTab — sources from verified business accounts endpoint.

// Built once at module level so renderItem's useCallback doesn't recreate it.
const ACCOUNT_CATEGORY_LABELS: Record<string, string> = {};
BUSINESS_CATEGORIES.forEach((c) => { ACCOUNT_CATEGORY_LABELS[c.slug] = c.label; });

interface AccountListTabProps {
  navigation: ConnectNavProp;
  activeCategory: string | null;
  activeRelationship: string;
  activeSort: BusinessSort;
  activeProvince: string;
  onClearFilters: () => void;
}

const AccountListTab: React.FC<AccountListTabProps> = ({
  navigation,
  activeCategory,
  activeRelationship,
  activeSort,
  activeProvince,
  onClearFilters,
}) => {
  const tabBarInset = useTabBarBottomInset();
  const { items, loading, refreshing, hasMore, error, loadMore, refresh } =
    useAccountDiscovery({
      businessCategory: activeCategory ?? undefined,
      relationshipType: activeRelationship === 'all' ? undefined : activeRelationship,
      sort: activeSort,
      province: activeProvince || undefined,
    });

  const { handleMessage } = useAccountActions(navigation);

  const renderItem = useCallback(
    ({ item }: { item: BusinessAccountItem }) => {
      const categoryLabel = item.businessCategory
        ? ACCOUNT_CATEGORY_LABELS[item.businessCategory] ?? item.businessCategory
        : '';
      return (
        <Pressable
          style={accountCardStyles.card}
          onPress={() =>
            (navigation as any).navigate('BusinessProfile', { businessId: item._id })
          }
          accessibilityRole="button"
          accessibilityLabel={`Xem hồ sơ ${item.displayName}`}>
          <View style={accountCardStyles.logo}>
            <MaterialIcons name="business" size={22} color={koolaColors.primary} />
          </View>
          <View style={accountCardStyles.content}>
            <View style={accountCardStyles.nameRow}>
              <KoolaText variant="label" weight="700" numberOfLines={1} style={accountCardStyles.name}>
                {item.displayName}
              </KoolaText>
              {item.verificationStatus === 'verified' && (
                <MaterialIcons name="verified" size={14} color={koolaColors.success} />
              )}
            </View>
            <View style={accountCardStyles.meta}>
              {categoryLabel ? (
                <KoolaText variant="caption" tone="primary" weight="700" numberOfLines={1}>
                  {categoryLabel}
                </KoolaText>
              ) : null}
              {item.province ? (
                <>
                  <View style={accountCardStyles.dot} />
                  <MaterialIcons name="location-on" size={11} color={koolaColors.muted} />
                  <KoolaText variant="caption" tone="muted" numberOfLines={1}>
                    {item.province}
                  </KoolaText>
                </>
              ) : null}
            </View>
            {item.tagline ? (
              <KoolaText variant="caption" tone="muted" numberOfLines={2} style={accountCardStyles.tagline}>
                {item.tagline}
              </KoolaText>
            ) : null}
          </View>
          <Pressable
            style={accountCardStyles.cta}
            onPress={(e) => {
              e.stopPropagation();
              handleMessage(item);
            }}
            accessibilityRole="button"
            accessibilityLabel="Nhắn tin">
            <MaterialIcons name="chat-bubble-outline" size={16} color={koolaColors.primary} />
            <KoolaText variant="caption" tone="primary" weight="700">Nhắn tin</KoolaText>
          </Pressable>
        </Pressable>
      );
    },
    [navigation, handleMessage],
  );

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
          contentContainerStyle={[listStyles.listContent, { paddingBottom: tabBarInset }]}
        />
      )}
    </View>
  );
};

const accountCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: koolaColors.surface,
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: koolaColors.faint,
  },
  tagline: {
    marginTop: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.primarySoft,
  },
});

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
    setActiveRelationship(slug);
    setActiveCategory(null);
  }, []);

  return (
    <View style={styles.container}>
      <KoolaHeader
        searchPlaceholder="Tìm doanh nghiệp..."
        onSearchPress={() => navigation.navigate('BusinessSearch')}
        onQrPress={() => {}}
        onAddPress={() =>
          (navigation as any).navigate('PersonalTab', { screen: 'AccountList' })
        }
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
          onCreatePress={() =>
            (navigation as any).navigate('PersonalTab', { screen: 'AccountList' })
          }
          onDismiss={handleDismissBanner}
        />
      )}

      <AccountListTab
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
