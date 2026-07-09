import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';

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

  return { handleMessage, navigateToChat };
}

// ─── RelationshipTabBar ───────────────────────────────────────────────────────

interface RelationshipTabBarProps {
  activeRelationship: string;
  onSelectRelationship: (slug: string) => void;
  palette: Palette;
}

const RelationshipTabBar: React.FC<RelationshipTabBarProps> = ({
  activeRelationship,
  onSelectRelationship,
  palette,
}) => {
  const styles = useMemo(() => makeTabBarStyles(palette), [palette]);
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

const makeTabBarStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: p.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.line,
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
      borderBottomColor: p.primary,
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
  palette: Palette;
}

const FilterBar: React.FC<FilterBarProps> = ({
  activeCategory,
  onSelectCategory,
  activeRelationship,
  activeProvince,
  onProvinceChange,
  activeSort,
  onSortChange,
  palette,
}) => {
  const styles = useMemo(() => makeFilterBarStyles(palette), [palette]);
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
                    color={isActive ? palette.surface : palette.primary}
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

const makeFilterBarStyles = (p: Palette) =>
  StyleSheet.create({
    wrapper: {
      backgroundColor: p.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.line,
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
      backgroundColor: p.line,
      marginHorizontal: 4,
    },
    iconChip: {
      height: 34,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: p.canvas,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
    },
    iconChipActive: {
      backgroundColor: p.primary,
      borderColor: p.primary,
    },
    countBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
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
  palette: Palette;
}

const AccountListTab: React.FC<AccountListTabProps> = ({
  navigation,
  activeCategory,
  activeRelationship,
  activeSort,
  activeProvince,
  onClearFilters,
  palette,
}) => {
  const tabBarInset = useTabBarBottomInset();
  const styles = useMemo(() => makeListStyles(palette), [palette]);
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
                onClearFilters={onClearFilters}
              />
            )
          }
          ListFooterComponent={
            hasMore ? (
              <ActivityIndicator
                style={styles.footer}
                size="small"
                color={palette.primary}
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={palette.primary}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
        />
      )}
    </View>
  );
};

const makeListStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
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
  const { palette } = useTheme();
  const styles = useMemo(() => makeScreenStyles(palette), [palette]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeRelationship, setActiveRelationship] = useState('all');
  const [activeSort, setActiveSort] = useState<BusinessSort>('latest');
  const [activeProvince, setActiveProvince] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [qrVisible, setQrVisible] = useState(false);

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
        palette={palette}
      />

      <FilterBar
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        activeRelationship={activeRelationship}
        activeProvince={activeProvince}
        onProvinceChange={setActiveProvince}
        activeSort={activeSort}
        onSortChange={setActiveSort}
        palette={palette}
      />

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
        palette={palette}
      />

      <QrScannerModal
        visible={qrVisible}
        onClose={handleQrClose}
        onNavigateProfile={handleNavigateProfile}
        onNavigateChat={handleNavigateChat}
      />
    </View>
  );
};

const makeScreenStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
    },
  });

export default ConnectHomeScreen;
