import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaSkeleton,
  KoolaText,
  koolaRadii,
  koolaShadows,
  koolaDarkShadows,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import { PreviewBanner } from '../../components/PreviewBanner';
import { isPreview, AVAILABILITY_LABELS } from '../../hooks/featureAvailability';
import { NotchHeader } from '../../components/NotchHeader';
import {
  shoppingAttributeChips,
  shoppingCategories,
  shoppingProducts,
  shoppingSortChips,
  type ShoppingProduct,
} from './shoppingMockData';

/**
 * Shopping home — single-column product list (Figma frame 64:2).
 * Header is owned by NotchHeader (shared with Personal); this screen owns
 * search, filter card, and the product list. Search + filter operate honestly
 * on the mock data; mock-only actions stay honest via coming-soon toast.
 */

type Styles = ReturnType<typeof makeStyles>;

/** Live text search + tapped sort/attribute chips, applied to mock data. */
function filterAndSortProducts(
  query: string,
  activeAttr: string | null,
  activeSort: string | null,
): ShoppingProduct[] {
  let list = shoppingProducts.slice();
  const q = query.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.shop.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (activeAttr) {
    list = list.filter((p) => p.tags.includes(activeAttr));
  }
  if (activeSort === 'Được mua nhiều nhất') {
    list = list.slice().sort((a, b) => b.soldCount - a.soldCount);
  } else if (activeSort === 'Đánh giá cao') {
    list = list.slice().sort((a, b) => b.rating - a.rating);
  }
  return list;
}

// ── Search bar (pill with search input + cart & bell actions) ─────────────────
const SearchBar: React.FC<{
  palette: Palette;
  styles: Styles;
  value: string;
  onChangeText: (t: string) => void;
  onCartPress: () => void;
  onBellPress: () => void;
}> = ({ palette, styles, value, onChangeText, onCartPress, onBellPress }) => (
  <View style={styles.searchBar}>
    <MaterialIcons name="search" size={20} color={palette.primary} style={styles.searchIcon} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="Tìm kiếm sản phẩm..."
      placeholderTextColor={palette.faint}
      style={styles.searchInput}
      returnKeyType="search"
      underlineColorAndroid="transparent"
      accessibilityLabel="Tìm kiếm sản phẩm"
    />
    {value.length > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Xóa tìm kiếm"
        onPress={() => onChangeText('')}
        hitSlop={8}
        style={styles.searchClear}>
        <MaterialIcons name="close" size={16} color={palette.faint} />
      </Pressable>
    ) : null}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Giỏ hàng"
      android_ripple={{ color: palette.line }}
      onPress={onCartPress}
      hitSlop={8}
      style={styles.searchAction}>
      <MaterialIcons name="shopping-cart" size={20} color={palette.primary} />
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Thông báo"
      android_ripple={{ color: palette.line }}
      onPress={onBellPress}
      hitSlop={8}
      style={styles.searchAction}>
      <MaterialIcons name="notifications-none" size={22} color={palette.primary} />
    </Pressable>
  </View>
);

// ── Filter card (left LỌC block + two rows of pills) ─────────────────────────
const FilterCard: React.FC<{
  palette: Palette;
  styles: Styles;
  activeSort: string | null;
  activeAttr: string | null;
  onToggleSort: (label: string) => void;
  onToggleAttr: (label: string) => void;
}> = ({ palette, styles, activeSort, activeAttr, onToggleSort, onToggleAttr }) => (
  <View style={styles.filterCard}>
    <View style={styles.filterLeft}>
      <MaterialIcons name="filter-list" size={18} color={palette.surface} />
      <KoolaText variant="caption" weight="800" tone="surface" style={styles.filterLabel}>
        LỌC
      </KoolaText>
    </View>
    <View style={styles.filterRight}>
      <View style={styles.pillRow}>
        {shoppingSortChips.map((label) => {
          const selected = activeSort === label;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              android_ripple={{ color: palette.line }}
              onPress={() => onToggleSort(label)}
              style={[styles.pill, selected && styles.pillSelected]}>
              <KoolaText variant="caption" weight="800" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
                {label}
              </KoolaText>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.pillRow, styles.pillRowLast]}>
        {shoppingAttributeChips.map((label) => {
          const selected = activeAttr === label;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              android_ripple={{ color: palette.line }}
              onPress={() => onToggleAttr(label)}
              style={[styles.pill, selected && styles.pillSelected]}>
              <KoolaText variant="caption" weight="800" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
                {label}
              </KoolaText>
            </Pressable>
          );
        })}
      </View>
    </View>
  </View>
);

// ── Single-column product row (thumbnail + meta + price + cart) ───────────────
const ProductRow: React.FC<{
  item: ShoppingProduct;
  palette: Palette;
  styles: Styles;
  onOpen: () => void;
  onAdd: () => void;
}> = React.memo(({ item, palette, styles, onOpen, onAdd }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={item.title}
    android_ripple={{ color: palette.line }}
    onPress={onOpen}
    style={styles.productRowCard}>
    <View style={[styles.productThumb, { backgroundColor: `${item.accent}16` }]}>
      <MaterialIcons name={item.icon} size={30} color={item.accent} />
      {item.badge ? (
        <View style={styles.productBadge}>
          <KoolaText variant="caption" weight="800" tone="surface" numberOfLines={1}>
            {item.badge}
          </KoolaText>
        </View>
      ) : null}
    </View>
    <View style={styles.productMeta}>
      <KoolaText variant="label" weight="800" numberOfLines={1} style={styles.productTitle}>
        {item.title}
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={1} style={styles.productShop}>
        {item.shop}
      </KoolaText>
      <View style={styles.priceRow}>
        <KoolaText variant="label" weight="800" style={styles.priceText} numberOfLines={1}>
          {item.price}
        </KoolaText>
        {item.originalPrice ? (
          <KoolaText variant="caption" tone="faint" style={styles.strikeText} numberOfLines={1}>
            {item.originalPrice}
          </KoolaText>
        ) : null}
      </View>
      <View style={styles.tagRow}>
        {item.tags.slice(0, 3).map((tag) => (
          <View key={tag} style={styles.tagChip}>
            <KoolaText variant="caption" tone="muted" numberOfLines={1}>
              {tag}
            </KoolaText>
          </View>
        ))}
      </View>
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Thêm ${item.title} vào giỏ`}
      android_ripple={{ color: palette.primarySoft }}
      onPress={onAdd}
      hitSlop={8}
      style={styles.rowCartBtn}>
      <MaterialIcons name="shopping-cart" size={18} color={palette.primary} />
    </Pressable>
  </Pressable>
));

const ShoppingHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const { palette, resolvedScheme } = useTheme();
  const { notify, toast } = useComingSoonToast();
  const styles = useMemo(
    () => makeStyles(palette, resolvedScheme),
    [palette, resolvedScheme],
  );
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSort, setActiveSort] = useState<string | null>(null);
  const [activeAttr, setActiveAttr] = useState<string | null>(null);

  // ─── First-mount defer: paint shell immediately, defer heavy FlatList ─────
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

  const shoppingIsPreview = isPreview('shopping');

  const handleComingSoon = useCallback(
    () => notify(`${AVAILABILITY_LABELS[shoppingIsPreview ? 'preview' : 'unavailable']} — Tính năng đang được phát triển`),
    [notify, shoppingIsPreview],
  );

  /** Preview-aware add-to-cart: explains preview state, does NOT increment a counter. */
  const handlePreviewAdd = useCallback(
    () => notify(`${AVAILABILITY_LABELS.preview} — không thể thêm vào giỏ hàng thật`),
    [notify],
  );

  const products = useMemo(() => {
    let list = filterAndSortProducts(query, activeAttr, activeSort);
    if (activeCategory !== 'all') {
      list = list.filter((p) => p.category === activeCategory);
    }
    return list;
  }, [query, activeAttr, activeSort, activeCategory]);

  const toggleSort = useCallback((label: string) => {
    setActiveSort((prev) => (prev === label ? null : label));
  }, []);

  const toggleAttr = useCallback((label: string) => {
    setActiveAttr((prev) => (prev === label ? null : label));
  }, []);

  const renderHeader = () => (
    <View>
      <NotchHeader />
      <View style={styles.contentInset}>
        {shoppingIsPreview && (
          <PreviewBanner message="Mua sắm đang ở chế độ xem trước. Sản phẩm là dữ liệu mẫu." />
        )}
        <SearchBar
          palette={palette}
          styles={styles}
          value={query}
          onChangeText={setQuery}
          onCartPress={handleComingSoon}
          onBellPress={handleComingSoon}
        />
        <FilterCard
          palette={palette}
          styles={styles}
          activeSort={activeSort}
          activeAttr={activeAttr}
          onToggleSort={toggleSort}
          onToggleAttr={toggleAttr}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}>
          {shoppingCategories.map((category) => {
            const selected = activeCategory === category.id;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityLabel={category.label}
                accessibilityState={{ selected }}
                onPress={() => setActiveCategory(category.id)}
                style={[styles.categoryButton, selected && styles.categoryButtonActive]}>
                <MaterialIcons
                  name={category.icon}
                  size={16}
                  color={selected ? palette.surface : palette.primary}
                  style={{ marginRight: 6 }}
                />
                <KoolaText
                  variant="caption"
                  weight="800"
                  tone={selected ? 'surface' : 'muted'}
                  numberOfLines={1}>
                  {category.label}
                </KoolaText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <MaterialIcons name="search-off" size={36} color={palette.faint} />
      <KoolaText variant="label" weight="700" tone="muted" style={{ marginTop: 10 }}>
        Không tìm thấy sản phẩm
      </KoolaText>
      <KoolaText variant="caption" tone="faint" align="center" style={{ marginTop: 4 }}>
        Thử từ khóa khác hoặc bỏ bớt bộ lọc
      </KoolaText>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: ShoppingProduct }) => (
      <ProductRow
        item={item}
        onOpen={handleComingSoon}
        onAdd={handlePreviewAdd}
        palette={palette}
        styles={styles}
      />
    ),
    [handleComingSoon, handlePreviewAdd, palette, styles],
  );

  return (
    <View style={styles.screen}>
      {!contentReady ? (
        // Interactive shell: header chrome + skeleton placeholders sized to real layout
        <View style={styles.screen}>
          <NotchHeader />
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={44} radius={koolaRadii.pill} />
            <KoolaSkeleton width="100%" height={76} radius={koolaRadii.md} style={{ marginTop: 10 }} />
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <KoolaSkeleton width={92} height={36} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={92} height={36} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={92} height={36} radius={koolaRadii.pill} />
            </View>
            {[0, 1, 2].map((i) => (
              <KoolaSkeleton key={i} width="100%" height={92} radius={koolaRadii.md} style={{ marginTop: 10 }} />
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
          removeClippedSubviews={false}
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
          showsVerticalScrollIndicator={false}
          style={styles.screen}
        />
      )}
      {toast}
    </View>
  );
};

const makeStyles = (p: Palette, scheme: 'light' | 'dark') => {
  const cardShadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.subtle;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    listContent: {
      paddingHorizontal: 12,
    },
    contentInset: {
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      borderRadius: koolaRadii.pill,
      backgroundColor: p.level0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: p.ink,
      paddingVertical: 0,
    },
    searchClear: {
      marginRight: 2,
      padding: 2,
    },
    searchAction: {
      marginLeft: 10,
      padding: 2,
    },
    filterCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      padding: 10,
      marginBottom: 10,
      ...cardShadow,
    },
    filterLeft: {
      width: 56,
      height: 56,
      borderRadius: koolaRadii.sm,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    filterLabel: {
      marginTop: 2,
    },
    filterRight: {
      flex: 1,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 6,
    },
    pillRowLast: {
      marginBottom: 0,
    },
    pill: {
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: p.level0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      marginRight: 6,
      marginBottom: 2,
    },
    pillSelected: {
      backgroundColor: p.primarySoft,
      borderColor: p.primary,
    },
    categoryRow: {
      paddingRight: 12,
      paddingBottom: 8,
    },
    categoryButton: {
      minHeight: 36,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      marginRight: 8,
    },
    categoryButtonActive: {
      backgroundColor: p.primary,
      borderColor: p.primary,
    },
    productRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      padding: 10,
      marginBottom: 10,
      overflow: 'hidden',
    },
    productThumb: {
      width: 72,
      height: 72,
      borderRadius: koolaRadii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    productBadge: {
      position: 'absolute',
      left: 4,
      top: 4,
      maxWidth: 64,
      borderRadius: koolaRadii.xs,
      backgroundColor: p.ink,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    productMeta: {
      flex: 1,
      marginRight: 8,
    },
    productTitle: {
      marginBottom: 2,
    },
    productShop: {
      marginBottom: 4,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    priceText: {
      color: p.primary,
      marginRight: 6,
    },
    strikeText: {
      textDecorationLine: 'line-through',
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    tagChip: {
      borderRadius: koolaRadii.xs,
      backgroundColor: p.level0,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginRight: 4,
      marginTop: 2,
    },
    rowCartBtn: {
      width: 36,
      height: 36,
      borderRadius: koolaRadii.sm,
      backgroundColor: p.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyWrap: {
      alignItems: 'center',
      paddingTop: 48,
      paddingBottom: 24,
    },
  });
};

export default ShoppingHomeScreen;
