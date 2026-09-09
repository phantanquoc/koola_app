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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaSkeleton,
  KoolaText,
  koolaRadii,
  koolaDarkShadows,
  koolaShadows,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import { PreviewBanner } from '../../components/PreviewBanner';
import { isPreview, AVAILABILITY_LABELS } from '../../hooks/featureAvailability';
import {
  shoppingAttributeChips,
  shoppingCategories,
  shoppingProducts,
  shoppingSortChips,
  type ShoppingProduct,
} from './shoppingMockData';

/**
 * Shopping home — single-column product list (Figma frame 64:2).
 * Notch is hosted by ShoppingTabStack (fixed chrome); this screen owns
 * search, filter card, and the product list.
 */

type Styles = ReturnType<typeof makeStyles>;
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

// ── Search bar ────────────────────────────────────────────────────────────────
const SearchBar: React.FC<{
  semantic: SemanticTokens;
  styles: Styles;
  value: string;
  onChangeText: (t: string) => void;
}> = ({ semantic, styles, value, onChangeText }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.searchDock, focused && styles.searchDockFocused]}>
      <View style={styles.searchFieldInner}>
        <MaterialIcons name="search" size={20} color={semantic.text.faint} style={styles.searchIcon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Tìm kiếm sản phẩm..."
          placeholderTextColor={semantic.text.faint}
          style={styles.searchInput}
          returnKeyType="search"
          underlineColorAndroid="transparent"
          accessibilityLabel="Tìm kiếm sản phẩm"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa tìm kiếm"
            onPress={() => onChangeText('')}
            hitSlop={12}
            style={styles.searchClear}>
            <MaterialIcons name="close" size={18} color={semantic.text.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

// ── Filter bar: tall LỌC well (left) + two pill rows (right) ─────────────────
const FilterCard: React.FC<{
  semantic: SemanticTokens;
  styles: Styles;
  activeSort: string | null;
  activeAttr: string | null;
  onToggleSort: (label: string) => void;
  onToggleAttr: (label: string) => void;
}> = ({ semantic, styles, activeSort, activeAttr, onToggleSort, onToggleAttr }) => (
  <View style={styles.filterBar}>
    <View style={styles.filterWell}>
      <MaterialIcons name="filter-list" size={20} color={semantic.text.onAction} />
      <KoolaText variant="caption" weight="800" tone="surface" style={styles.filterWellLabel}>
        LỌC
      </KoolaText>
    </View>
    <View style={styles.filterPills}>
      <View style={styles.pillRow}>
        {shoppingSortChips.map((label) => {
          const selected = activeSort === label;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              android_ripple={{ color: semantic.border.subtle }}
              onPress={() => onToggleSort(label)}
              hitSlop={4}
              style={[styles.pill, selected && styles.pillSelected]}>
              <KoolaText
                variant="caption"
                weight={selected ? '700' : '600'}
                tone={selected ? 'surface' : 'muted'}
                numberOfLines={1}>
                {label}
              </KoolaText>
              {selected ? (
                <MaterialIcons name="check" size={13} color={semantic.text.onAction} style={styles.pillCheck} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.pillRow}>
        {shoppingAttributeChips.map((label) => {
          const selected = activeAttr === label;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              android_ripple={{ color: semantic.border.subtle }}
              onPress={() => onToggleAttr(label)}
              hitSlop={4}
              style={[styles.pill, selected && styles.pillSelected]}>
              <KoolaText
                variant="caption"
                weight={selected ? '700' : '600'}
                tone={selected ? 'surface' : 'muted'}
                numberOfLines={1}>
                {label}
              </KoolaText>
              {selected ? (
                <MaterialIcons name="check" size={13} color={semantic.text.onAction} style={styles.pillCheck} />
              ) : null}
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
  semantic: SemanticTokens;
  styles: Styles;
  onOpen: () => void;
  onAdd: () => void;
}> = React.memo(({ item, semantic, styles, onOpen, onAdd }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={item.title}
    android_ripple={{ color: semantic.border.subtle }}
    onPress={onOpen}
    style={styles.productRowCard}>
    <View style={[styles.productThumb, { backgroundColor: `${item.accent}16` }]}>
      <MaterialIcons name={item.icon as never} size={30} color={item.accent} />
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
      android_ripple={{ color: semantic.action.primarySoft }}
      onPress={onAdd}
      hitSlop={8}
      style={styles.rowCartBtn}>
      <MaterialIcons name="shopping-cart" size={18} color={semantic.action.primary} />
    </Pressable>
  </Pressable>
));

const ShoppingHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const { notify, toast } = useComingSoonToast();
  const styles = useMemo(
    () => makeStyles(semantic, resolvedScheme),
    [semantic, resolvedScheme],
  );
  const notchPad = insets.top + 4 + 22 + 4;
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSort, setActiveSort] = useState<string | null>(null);
  const [activeAttr, setActiveAttr] = useState<string | null>(null);

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

  const renderListHeader = () => (
    <View style={styles.contentInset}>
      {shoppingIsPreview && (
        <PreviewBanner message="Mua sắm đang ở chế độ xem trước. Sản phẩm là dữ liệu mẫu." />
      )}
      <SearchBar
        semantic={semantic}
        styles={styles}
        value={query}
        onChangeText={setQuery}
      />
      <FilterCard
        semantic={semantic}
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
                name={category.icon as never}
                size={16}
                color={selected ? semantic.text.onAction : semantic.action.primary}
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
  );

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <MaterialIcons name="search-off" size={36} color={semantic.text.faint} />
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
        semantic={semantic}
        styles={styles}
      />
    ),
    [handleComingSoon, handlePreviewAdd, semantic, styles],
  );

  return (
    <View style={styles.screen}>
      {!contentReady ? (
        <View style={[styles.screen, { paddingTop: notchPad }]}>
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
          removeClippedSubviews={false}
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.listContent, { paddingTop: notchPad, paddingBottom: tabBarInset }]}
          showsVerticalScrollIndicator={false}
          style={styles.screenTransparent}
        />
      )}
      {toast}
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens, scheme: 'light' | 'dark') => {
  const cardShadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.subtle;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: semantic.bg.canvas,
    },
    screenTransparent: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    listContent: {
      paddingHorizontal: 12,
    },
    contentInset: {
      paddingHorizontal: 12,
      paddingTop: 2,
    },
    searchDock: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      borderRadius: koolaRadii.md,
      backgroundColor: scheme === 'dark' ? semantic.surface.level2 : '#E9ECF1',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 10,
      ...cardShadow,
    },
    searchDockFocused: {
      borderWidth: 1.5,
      borderColor: semantic.focus.ring,
    },
    searchFieldInner: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: semantic.text.primary,
      paddingVertical: 0,
    },
    searchDivider: {
      width: StyleSheet.hairlineWidth,
      height: 24,
      backgroundColor: semantic.border.subtle,
      marginHorizontal: 4,
    },
    searchClear: {
      marginLeft: 6,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchActionDock: {
      marginLeft: 8,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    filterWell: {
      width: 52,
      alignSelf: 'stretch',
      borderRadius: koolaRadii.sm,
      backgroundColor: semantic.action.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      paddingVertical: 8,
    },
    filterWellLabel: {
      marginTop: 4,
      letterSpacing: 0.4,
    },
    filterPills: {
      flex: 1,
      gap: 8,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: semantic.surface.level0,
      borderWidth: 1,
      borderColor: semantic.border.subtle,
    },
    pillCheck: {
      marginLeft: 6,
    },
    pillSelected: {
      backgroundColor: semantic.action.primary,
      borderColor: semantic.action.primary,
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
      backgroundColor: semantic.surface.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      marginRight: 8,
    },
    categoryButtonActive: {
      backgroundColor: semantic.action.primary,
      borderColor: semantic.action.primary,
    },
    productRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: koolaRadii.md,
      backgroundColor: semantic.surface.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 10,
      marginBottom: 10,
      overflow: 'hidden',
      ...cardShadow,
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
      backgroundColor: semantic.text.primary,
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
      color: semantic.action.primary,
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
      backgroundColor: semantic.surface.level0,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginRight: 4,
      marginTop: 2,
    },
    rowCartBtn: {
      width: 36,
      height: 36,
      borderRadius: koolaRadii.sm,
      backgroundColor: semantic.action.primarySoft,
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
