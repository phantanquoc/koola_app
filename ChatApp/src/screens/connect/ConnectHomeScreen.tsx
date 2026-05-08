import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import KoolaHeader from '../../components/KoolaHeader';
import BusinessCard from '../../components/connect/BusinessCard';
import EmptyConnect from '../../components/connect/EmptyConnect';
import { useBusinessList } from '../../hooks/useBusinessList';
import { businessesApi, conversationsApi } from '../../services/api/apiService';
import { BUSINESS_CATEGORIES, RELATIONSHIP_FILTERS } from './constants';
import type { Business } from '../../types';

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
    <View style={tabBarStyles.container}>
      {RELATIONSHIP_FILTERS.map((rel) => {
        const isActive = activeRelationship === rel.slug;
        return (
          <TouchableOpacity
            key={rel.slug}
            style={[tabBarStyles.tab, isActive && tabBarStyles.tabActive]}
            onPress={() => onSelectRelationship(rel.slug)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={rel.label}
            accessibilityState={{ selected: isActive }}>
            <Text style={[tabBarStyles.tabText, isActive && tabBarStyles.tabTextActive]}>
              {rel.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
    borderBottomColor: '#1565C0',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#1565C0',
    fontWeight: '700',
  },
});

// ─── CategoryChipBar ─────────────────────────────────────────────────────────
// Horizontal scrollable chip row for category filtering.
// Only shown when a non-'all' relationship tab is active.

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

interface CategoryChipBarProps {
  activeCategory: string | null;
  onSelectCategory: (slug: string | null) => void;
}

const CategoryChipBar: React.FC<CategoryChipBarProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <View style={chipBarStyles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={chipBarStyles.scrollContent}>
        {/* "Tất cả" chip — clears category filter */}
        <TouchableOpacity
          style={[chipBarStyles.chip, activeCategory === null && chipBarStyles.chipActive]}
          onPress={() => onSelectCategory(null)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: activeCategory === null }}>
          <Text
            style={[
              chipBarStyles.chipText,
              activeCategory === null && chipBarStyles.chipTextActive,
            ]}>
            Tất cả
          </Text>
        </TouchableOpacity>

        {/* Category chips */}
        {BUSINESS_CATEGORIES.filter((cat) => cat.slug !== 'all').map((cat) => {
          const isActive = activeCategory === cat.slug;
          const iconName = CATEGORY_ICON_MAP[cat.slug] || cat.icon;
          return (
            <TouchableOpacity
              key={cat.slug}
              style={[chipBarStyles.chip, isActive && chipBarStyles.chipActive]}
              onPress={() => onSelectCategory(isActive ? null : cat.slug)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={cat.label}
              accessibilityState={{ selected: isActive }}>
              <MaterialIcons
                name={iconName}
                size={14}
                color={isActive ? '#FFFFFF' : '#1565C0'}
                style={chipBarStyles.chipIcon}
              />
              <Text
                style={[chipBarStyles.chipText, isActive && chipBarStyles.chipTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const chipBarStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  chipIcon: {
    marginRight: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});

// ─── BusinessListTab ───────────────────────────────────────────────────────────

interface BusinessListTabProps {
  navigation: ConnectNavProp;
  activeCategory: string | null;
  activeRelationship: string;
  onClearFilters: () => void;
}

const BusinessListTab: React.FC<BusinessListTabProps> = ({
  navigation,
  activeCategory,
  activeRelationship,
  onClearFilters,
}) => {
  const { items, loading, refreshing, hasMore, loadMore, refresh, updateItem } =
    useBusinessList({
      category: activeCategory ?? undefined,
      relationshipType: activeRelationship === 'all' ? undefined : activeRelationship,
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

  return (
    <View style={listStyles.container}>
      {loading && items.length === 0 ? (
        <ActivityIndicator style={listStyles.loader} size="large" color="#1565C0" />
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
                color="#1565C0"
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor="#1565C0"
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
    backgroundColor: '#F3F4F6',
  },
  loader: {
    marginTop: 40,
  },
  footer: {
    paddingVertical: 16,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
});

// ─── ConnectHomeScreen ────────────────────────────────────────────────────────

const ConnectHomeScreen: React.FC = () => {
  const navigation = useNavigation<ConnectNavProp>();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeRelationship, setActiveRelationship] = useState('all');

  const handleClearFilters = useCallback(() => {
    setActiveCategory(null);
    setActiveRelationship('all');
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      <KoolaHeader
        searchPlaceholder="Tìm doanh nghiệp..."
        onSearchPress={() => navigation.navigate('BusinessSearch')}
        onQrPress={() => {}}
        onAddPress={() => navigation.navigate('CreateBusiness')}
      />

      <RelationshipTabBar
        activeRelationship={activeRelationship}
        onSelectRelationship={(slug) => {
          setActiveRelationship(slug);
          setActiveCategory(null);
        }}
      />

      {/* Category chips — only shown for Đối tác / Nhà cung cấp tabs */}
      {activeRelationship !== 'all' && (
        <CategoryChipBar
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
        />
      )}

      <BusinessListTab
        navigation={navigation}
        activeCategory={activeRelationship === 'all' ? null : activeCategory}
        activeRelationship={activeRelationship}
        onClearFilters={handleClearFilters}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
});

export default ConnectHomeScreen;
