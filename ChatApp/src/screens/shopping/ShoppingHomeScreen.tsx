import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  InteractionManager,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaChip,
  KoolaEmptyState,
  KoolaErrorState,
  KoolaSheet,
  KoolaSkeleton,
  KoolaText,
  koolaRadii,
  koolaDarkShadows,
  koolaShadows,
  useKoolaToast,
  useTheme,
} from '../../ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { ShoppingTabStackParamList } from '../../navigation/types';
import { commerceApi } from '../../services/api/apiService';
import type { CommerceCategory, CommerceSort, ProductCard } from '../../services/api/apiService';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { formatVnd } from '../../utils/formatVnd';
import { useCommerceProductList } from './hooks/useCommerceProductList';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useSellerChat } from './hooks/useSellerChat';
import {
  CATEGORY_ICON,
  SHOPPING_CATEGORIES,
  SHOPPING_SORT_CHIPS,
  SHOPPING_TAG_CHIPS,
  addProductToCart,
  soldLabel,
} from './shoppingCatalog';
import { ChromeGlassSheet } from '../../components/ChromeGlassSheet';
import { ChromeHeaderBox, getChromeBoxHeight } from '../../components/ChromeHeaderBox';

/**
 * Shopping home — single-column product list (Figma frame 64:2).
 *
 * Chrome: shared ChromeGlassSheet + ChromeHeaderBox (single source with
 * Chat/Connect). Header is fixed — no scroll-hide animation (choice B).
 * FilterRow stays scroll-fixed directly below the header block (glass
 * extends through it: barH = FILTER_ROW_H).
 */

const FILTER_ROW_H = 72;
const FILTER_ROW_GAP_BOTTOM = 12;
// Vertical gap between product cards. Shared with the skeleton's row spacing
// so the two stay in sync and swapping in real content causes no shift.
const CARD_GAP = 6;
// Tags shown per card (capped for uniform row height).
const TAGS_PER_CARD = 2;
// Search input → server query debounce (spec: 300 ms).
const SEARCH_DEBOUNCE_MS = 300;

type Styles = ReturnType<typeof makeStyles>;
// Filtering, sorting and pagination are done by the server
// (GET /commerce/products) — never in the client.

// ── Inline search field rendered inside ChromeHeaderBox dock slot ────────────
// 36dp pill to match CHROME_BOX_DOCK_H; fill is `border.subtle`.
const SHOPPING_DOCK_H = 36;

const ShoppingHeaderSearch: React.FC<{
  semantic: SemanticTokens;
  value: string;
  onChangeText: (t: string) => void;
}> = ({ semantic, value, onChangeText }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[shoppingDockStyles.pill, { backgroundColor: semantic.border.subtle }]}>
      {focused ? (
        <View pointerEvents="none" style={[shoppingDockStyles.focusRing, { borderColor: semantic.focus.ring }]} />
      ) : null}
      <View style={shoppingDockStyles.contentRow}>
        <MaterialIcons name="search" size={20} color={semantic.text.faint} style={shoppingDockStyles.searchIcon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Tìm kiếm sản phẩm..."
          placeholderTextColor={semantic.text.faint}
          style={[shoppingDockStyles.searchInput, { color: semantic.text.primary }]}
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
            hitSlop={6}
            style={shoppingDockStyles.searchClear}>
            <MaterialIcons name="close" size={20} color={semantic.text.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const shoppingDockStyles = StyleSheet.create({
  pill: {
    height: SHOPPING_DOCK_H,
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  focusRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: koolaRadii.pill,
    borderWidth: 1.5,
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: SHOPPING_DOCK_H,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  searchClear: {
    marginLeft: 6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── Filter row: 2 hàng + nút Lọc cao 2 hàng bên phải ─────────────────────
 // Bố cục yêu cầu:
 //   [Được mua nhiều nhất] [Giá thấp nhất]     ┌──────┐
 //   [Organic] [Chứng nhận] [Đã xác minh]     │ Lọc  │  ← cao 68 = 30+8+30, canh phải
 //                                            └──────┘
 // Hàng 1 = 2 chip dài (sort), hàng 2 = 3 chip ngắn (attr).
 // Nút Lọc bên phải cao bằng 2 hàng chip, icon filter-list, badge đỏ khi có filter.
const FilterRow: React.FC<{
  semantic: SemanticTokens;
  styles: Styles;
  activeSort: CommerceSort | null;
  activeAttr: string | null;
  activeFilterCount: number;
  onToggleSort: (sort: Exclude<CommerceSort, 'newest'>) => void;
  onToggleAttr: (label: string) => void;
  onOpenFilters: () => void;
}> = ({ semantic, styles, activeSort, activeAttr, activeFilterCount, onToggleSort, onToggleAttr, onOpenFilters }) => (
  <View style={styles.filterRow}>
    <View style={styles.chipGrid}>
      <View style={styles.chipRowTop}>
        {SHOPPING_SORT_CHIPS.map(({ sort, label }) => {
          const selected = activeSort === sort;
          return (
            <Pressable
              key={sort}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => onToggleSort(sort)}
              hitSlop={4}
              style={[styles.rowChip, selected && styles.rowChipActive]}>
              <KoolaText
                variant="caption"
                weight="700"
                tone={selected ? 'surface' : 'muted'}
                style={styles.rowChipText}
                numberOfLines={1}>
                {label}
              </KoolaText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.chipRowBottom}>
        {SHOPPING_TAG_CHIPS.map((label) => {
          const selected = activeAttr === label;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => onToggleAttr(label)}
              hitSlop={4}
              style={[styles.rowChip, selected && styles.rowChipActive]}>
              <KoolaText
                variant="caption"
                weight="700"
                tone={selected ? 'surface' : 'muted'}
                style={styles.rowChipText}
                numberOfLines={1}>
                {label}
              </KoolaText>
            </Pressable>
          );
        })}
      </View>
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={activeFilterCount > 0 ? `Lọc, ${activeFilterCount} bộ lọc đang áp dụng` : 'Lọc'}
      onPress={onOpenFilters}
      hitSlop={4}
      style={styles.filterTallBtn}>
      <MaterialIcons name="filter-alt" size={20} color={semantic.action.primary} />
      {activeFilterCount > 0 ? (
        <View style={styles.filterTallBadge}>
          <KoolaText variant="caption" weight="800" tone="surface" style={styles.filterBadgeText}>
            {activeFilterCount}
          </KoolaText>
        </View>
      ) : null}
    </Pressable>
  </View>
);

// ── Filter sheet: category chips (KoolaSheet, first production use) ──────────
// Sort + attribute chips are NOT duplicated here — they live fully visible in
// the outer filter row, and two controls bound to one piece of state is
// redundant UI. Sheet = "Phân loại" + "Xóa lọc".
//
// "No category selected" (null) means all products, so there is no "Tất cả"
// chip. No dead end — tapping the active category chip clears it (toggle), and
// "Xóa lọc" clears all three groups.
const FilterSheet: React.FC<{
  styles: Styles;
  activeCategory: CommerceCategory | null;
  hasActiveFilters: boolean;
  onToggleCategory: (id: CommerceCategory) => void;
  onClear: () => void;
  onClose: () => void;
  bottomInset: number;
}> = ({ styles, activeCategory, hasActiveFilters, onToggleCategory, onClear, onClose, bottomInset }) => (
  <KoolaSheet snapPoints={['42%']} index={0} onClose={onClose}>
    <View style={[styles.sheetContent, { paddingBottom: bottomInset + 16 }]}>
      <View style={styles.sheetHeaderRow}>
        <KoolaText variant="heading" weight="800">
          Bộ lọc
        </KoolaText>
        {hasActiveFilters ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa lọc"
            onPress={onClear}
            hitSlop={8}
            style={styles.sheetClearBtn}>
            <KoolaText variant="label" weight="700" tone="primary">
              Xóa lọc
            </KoolaText>
          </Pressable>
        ) : null}
      </View>

      <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>
        Phân loại
      </KoolaText>
      <View style={styles.sheetChipRow}>
        {SHOPPING_CATEGORIES.map((category) => (
          <View key={category.id} style={styles.sheetChipWrap}>
            <KoolaChip
              label={category.label}
              selected={activeCategory === category.id}
              onPress={() => onToggleCategory(category.id)}
              accessibilityLabel={category.label}
            />
          </View>
        ))}
      </View>
    </View>
  </KoolaSheet>
);

// ── Single-column product row (thumbnail + meta + price + [+ giỏ]) ────────────
const ProductRow: React.FC<{
  item: ProductCard;
  semantic: SemanticTokens;
  styles: Styles;
  onOpen: (item: ProductCard) => void;
  onAddToCart: (item: ProductCard) => void;
  onChat: (item: ProductCard) => void;
  /** True while a chat with THIS row's seller is being opened. */
  chatBusy: boolean;
}> = React.memo(({ item, semantic, styles, onOpen, onAddToCart, onChat, chatBusy }) => {
  // Server images are presigned URLs (≈1h). On the first image error,
  // refetch the product detail ONCE for a fresh URL (design D6, same as PDP);
  // the glyph shows only if the refresh keeps failing.
  const [imageUrl, setImageUrl] = useState(item.imageUrl);
  const imageRefreshedRef = useRef(false);
  useEffect(() => {
    setImageUrl(item.imageUrl);
    imageRefreshedRef.current = false;
  }, [item.id, item.imageUrl]);
  const onImageError = useCallback(() => {
    if (!imageRefreshedRef.current) {
      imageRefreshedRef.current = true;
      commerceApi.getProduct(item.id).then(
        (detail) => {
          if (detail.imageUrls[0]) {
            setImageUrl(detail.imageUrls[0]);
          } else {
            setImageUrl(null);
          }
        },
        () => {
          // Refetch failed — collapse to the glyph fallback.
          setImageUrl(null);
        },
      );
      return;
    }
    setImageUrl(null);
  }, [item.id]);
  const showImage = Boolean(imageUrl);
  const sold = soldLabel(item.soldCount);
  const accent = semantic.action.primary;

  return (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${item.name}, ${formatVnd(item.price)}`}
    android_ripple={{ color: semantic.border.subtle }}
    onPress={() => onOpen(item)}
    style={styles.productRowCard}>
    <View style={[styles.productThumb, { backgroundColor: `${accent}12` }]}>
      {showImage ? (
        // Ảnh phủ kín ô vuông, nằm TRÊN nền accent (nền hiện trong lúc decode).
        // Ảnh chỉ để trang trí: Pressable cha đã có accessibilityLabel.
        // key = imageKey so a refreshed presigned URL for the same image does
        // not remount/flash the row.
        <Image
          key={item.imageKey ?? undefined}
          source={{ uri: imageUrl as string }}
          style={styles.productThumbImage}
          resizeMode="cover"
          onError={onImageError}
          accessible={false}
          importantForAccessibility="no"
        />
      ) : (
        /* 44: the thumb fills the card's full height, so the glyph scales
           with it rather than looking lost in the larger area. */
        <MaterialIcons name={CATEGORY_ICON[item.category] as never} size={44} color={accent} />
      )}
    </View>
    <View style={styles.productMeta}>
      <KoolaText variant="label" weight="800" numberOfLines={1} style={styles.productTitle}>
        {item.name}
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={1} style={styles.productShop}>
        {item.seller?.displayName ?? 'Cửa hàng'}
      </KoolaText>
      <View style={styles.priceRow}>
        <KoolaText variant="label" weight="800" style={styles.priceText} numberOfLines={1}>
          {formatVnd(item.price)}
        </KoolaText>
        {item.originalPrice ? (
          <KoolaText variant="caption" tone="faint" style={styles.strikeText} numberOfLines={1}>
            {formatVnd(item.originalPrice)}
          </KoolaText>
        ) : null}
      </View>
      {/* Real server soldCount (soldLabel, hidden at 0) + delivery text.
          Rating is not displayed (no reviews yet). The row keeps a fixed line
          so every card shares a height. */}
      <View style={styles.ratingRow}>
        <KoolaText variant="caption" tone="muted" style={styles.soldText} numberOfLines={1}>
          {[sold, item.deliveryText || null].filter(Boolean).join(' · ') || ' '}
        </KoolaText>
      </View>
      {/* Cap at 2 tags so every card's tag row is exactly one line and all
          cards share a height. The full array stays intact, only the render
          trims. */}
      <View style={styles.tagRow}>
        {item.tags.slice(0, TAGS_PER_CARD).map((tag) => (
          <View key={tag} style={styles.tagChip}>
            <KoolaText variant="caption" tone="muted" numberOfLines={1} style={styles.tagText}>
              {tag}
            </KoolaText>
          </View>
        ))}
      </View>
    </View>
    {/* Sibling of productMeta, NOT a child of it or of tagRow: the 30dp button
        is taller than the 18dp tag chip, so while it sat inside tagRow it drove
        that row's height and opened a ~12dp hole above the chips. Out of flow it
        pins to the card's own bottom-right corner and the rows keep their
        1-2dp rhythm. */}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Nhắn tin với ${item.seller?.displayName ?? 'Cửa hàng'}`}
      android_ripple={{ color: `${semantic.action.primary}1A` }}
      onPress={() => onChat(item)}
      disabled={chatBusy || !item.seller?.id}
      hitSlop={6}
      style={[styles.rowCartBtn, styles.rowChatBtn, (chatBusy || !item.seller?.id) && { opacity: 0.5 }]}>
      <MaterialIcons name="chat-bubble-outline" size={16} color={semantic.action.primary} />
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Thêm ${item.name} vào giỏ`}
      android_ripple={{ color: `${semantic.action.primary}1A` }}
      onPress={() => onAddToCart(item)}
      hitSlop={6}
      style={styles.rowCartBtn}>
      <MaterialIcons name="add-shopping-cart" size={16} color={semantic.action.primary} />
    </Pressable>
  </Pressable>
  );
});

const ShoppingHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(
    () => makeStyles(semantic, resolvedScheme),
    [semantic, resolvedScheme],
  );
  const isDark = resolvedScheme === 'dark';
  const blockH = getChromeBoxHeight(insets.top);
  const listTopPad = blockH + FILTER_ROW_H + FILTER_ROW_GAP_BOTTOM;

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CommerceCategory | null>(null);
  const [activeSort, setActiveSort] = useState<Exclude<CommerceSort, 'newest'> | null>(null);
  const [activeAttr, setActiveAttr] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Server-driven search: the request only fires after 300 ms of quiet.
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

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

  const shoppingNav = useNavigation<NativeStackNavigationProp<ShoppingTabStackParamList>>();
  // useKoolaToast() returns a fresh object every render — hold it in a ref so
  // memoized row callbacks stay stable.
  const koolaToastRef = useRef(useKoolaToast());

  // ── Server-driven list (search / category / tag / sort / pagination) ────
  const listQuery = useMemo(
    () => ({
      q: debouncedQuery,
      category: activeCategory ?? undefined,
      tag: activeAttr ?? undefined,
      sort: activeSort ?? undefined,
    }),
    [debouncedQuery, activeCategory, activeAttr, activeSort],
  );
  // `enabled: contentReady` keeps the first-mount cost pattern: the request
  // starts after the tab transition settles (InteractionManager), and the
  // skeleton covers both the transition and the first page.
  const list = useCommerceProductList(listQuery, { enabled: contentReady });

  const handleOpenProduct = useCallback((item: ProductCard) => {
    shoppingNav.navigate('ShoppingProductDetail', { productId: item.id });
  }, [shoppingNav]);

  // Real direct chat with the seller's business account.
  const { openSellerChat, contactingSellerId } = useSellerChat();

  const handleAddToCart = useCallback((item: ProductCard) => {
    if (addProductToCart(item)) {
      koolaToastRef.current.show(`Đã thêm "${item.name}" vào giỏ`, 'success');
    } else {
      koolaToastRef.current.show('Không thể thêm vào giỏ. Bạn thử lại nhé.', 'warning');
    }
  }, []);

  // Counts all three groups: category + sort + attr.
  const activeFilterCount =
    (activeCategory ? 1 : 0) + (activeSort ? 1 : 0) + (activeAttr ? 1 : 0);

  const toggleSort = useCallback((sort: Exclude<CommerceSort, 'newest'>) => {
    setActiveSort((prev) => (prev === sort ? null : sort));
  }, []);

  const toggleAttr = useCallback((label: string) => {
    setActiveAttr((prev) => (prev === label ? null : label));
  }, []);

  // Tapping the active category clears it, so there is no dead end once a
  // category is picked.
  const toggleCategory = useCallback((id: CommerceCategory) => {
    setActiveCategory((prev) => (prev === id ? null : id));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveCategory(null);
    setActiveSort(null);
    setActiveAttr(null);
  }, []);

  const openFilterSheet = useCallback(() => setFilterSheetOpen(true), []);
  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);

  const renderSkeletonRows = (count: number) => (
    <View accessibilityLabel="Đang tải sản phẩm" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <KoolaSkeleton
          key={i}
          width="100%"
          height={99}
          radius={koolaRadii.md}
          style={{ marginTop: i === 0 ? 0 : CARD_GAP }}
        />
      ))}
    </View>
  );

  const renderEmpty = () => {
    if (list.status === 'initialLoading') return renderSkeletonRows(4);
    if (list.status === 'error') {
      return (
        <KoolaErrorState
          title="Không tải được sản phẩm"
          message="Kiểm tra kết nối mạng rồi thử lại."
          onRetry={list.retry}
          style={styles.emptyWrap}
        />
      );
    }
    const hasFilters = activeFilterCount > 0 || debouncedQuery.trim().length > 0;
    return (
      <KoolaEmptyState
        icon="search-off"
        title="Không tìm thấy sản phẩm"
        message={hasFilters ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc' : 'Chưa có sản phẩm nào được bán'}
        actionLabel={activeFilterCount > 0 ? 'Xóa lọc' : undefined}
        onActionPress={activeFilterCount > 0 ? clearFilters : undefined}
        style={styles.emptyWrap}
      />
    );
  };

  const renderFooter = () => {
    if (list.status === 'loadingMore') {
      return (
        <View style={styles.footer}>
          <ActivityIndicator color={semantic.action.primary} accessibilityLabel="Đang tải thêm" />
        </View>
      );
    }
    if (list.status === 'loadMoreError') {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tải thêm thất bại, thử lại"
          onPress={list.retry}
          style={styles.footer}>
          <KoolaText variant="caption" weight="700" tone="primary">
            Không tải được thêm · Thử lại
          </KoolaText>
        </Pressable>
      );
    }
    return null;
  };

  const handleChatSeller = useCallback(
    (item: ProductCard) => {
      if (!item.seller?.id) return;
      void openSellerChat(item.seller.id);
    },
    [openSellerChat],
  );

  const renderItem = useCallback(
    ({ item }: { item: ProductCard | undefined }) => {
      if (!item?.seller) return null;
      return (
        <ProductRow
          item={item}
          onOpen={handleOpenProduct}
          onAddToCart={handleAddToCart}
          onChat={handleChatSeller}
          chatBusy={contactingSellerId === item.seller?.id}
          semantic={semantic}
          styles={styles}
        />
      );
    },
    [handleOpenProduct, handleAddToCart, handleChatSeller, contactingSellerId, semantic, styles],
  );

  const handleSearchPress = useCallback(() => {}, []);

  if (!contentReady) {
    return (
      <View style={styles.screen}>
        <View style={[styles.screen, { paddingTop: blockH }]}>
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={SHOPPING_DOCK_H} radius={koolaRadii.pill} />
            <View style={{ marginTop: 8, height: FILTER_ROW_H }}>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <KoolaSkeleton width="50%" height={32} radius={koolaRadii.pill} />
                  <KoolaSkeleton width="50%" height={32} radius={koolaRadii.pill} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <KoolaSkeleton width="33%" height={32} radius={koolaRadii.pill} />
                  <KoolaSkeleton width="33%" height={32} radius={koolaRadii.pill} />
                  <KoolaSkeleton width="33%" height={32} radius={koolaRadii.pill} />
                </View>
              </View>
            </View>
          </View>
          <View style={styles.listContent}>
            {[0, 1, 2].map((i) => (
              <KoolaSkeleton
                key={i}
                width="100%"
                height={99}
                radius={koolaRadii.md}
                style={{ marginTop: i === 0 ? FILTER_ROW_GAP_BOTTOM : CARD_GAP }}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ChromeGlassSheet blockH={blockH} barH={FILTER_ROW_H + FILTER_ROW_GAP_BOTTOM} />
      <ChromeHeaderBox
        insetsTop={insets.top}
        isDark={isDark}
        contentReady={contentReady}
        withGlass={false}
        onSearchPress={handleSearchPress}
        dockContent={<ShoppingHeaderSearch semantic={semantic} value={query} onChangeText={setQuery} />}
      />
      <View pointerEvents="box-none" style={{ position: 'absolute', top: blockH, left: 0, right: 0, zIndex: 11 }}>
        <View style={[styles.filterBarWrap]}>
          <FilterRow
            semantic={semantic}
            styles={styles}
            activeSort={activeSort}
            activeAttr={activeAttr}
            activeFilterCount={activeFilterCount}
            onToggleSort={toggleSort}
            onToggleAttr={toggleAttr}
            onOpenFilters={openFilterSheet}
          />
        </View>
      </View>
      <FlatList
        removeClippedSubviews={false}
        data={list.items}
        keyExtractor={(item: ProductCard | undefined, index: number) => item?.id ?? String(index)}
        renderItem={renderItem}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        contentContainerStyle={[styles.listContent, { paddingTop: listTopPad, paddingBottom: tabBarInset }]}
        showsVerticalScrollIndicator={false}
        style={styles.screenTransparent}
      />
      {filterSheetOpen ? (
        <FilterSheet
          styles={styles}
          activeCategory={activeCategory}
          hasActiveFilters={activeFilterCount > 0}
          onToggleCategory={toggleCategory}
          onClear={clearFilters}
          onClose={closeFilterSheet}
          bottomInset={insets.bottom}
        />
      ) : null}
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens, scheme: 'light' | 'dark') => {
  const cardShadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.subtle;
  return StyleSheet.create({
    // Transparent so the ShoppingTabStack light field reads through the list
    // gaps, matching the Personal tab (design D1). The stack host already
    // paints `bg.canvas` under this screen, so there is no flash of white.
    screen: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    screenTransparent: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    // Product cards sit near the screen edges (6) while the floating chrome
    // above them stays inset further (contentInset, 12). That mismatch is
    // deliberate: this screen already floats a glass search dock over the list
    // and sits under the floating tab dock, and both of those read as chrome
    // hovering ABOVE content precisely because they are narrower than what
    // scrolls beneath them. Matching all edges at 6 would flatten the dock
    // into the content plane and lose that separation.
    // Card shadow (subtle: offset 0/3, radius 10) is vertical-dominant with no
    // meaningful horizontal spread, so 6 does not clip it at either edge.
    listContent: {
      paddingHorizontal: 6,
    },
    contentInset: {
      paddingHorizontal: 12,
    },
    // Filter bar below the chrome block: static, scrolls with content.
    filterBarWrap: {
      paddingHorizontal: 12,
      height: FILTER_ROW_H,
    },
    // ── Filter row: 2 hàng + nút Lọc cao 2 hàng ──
    filterRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      height: FILTER_ROW_H,
    },
    chipGrid: {
      flex: 1,
      gap: 8,
      justifyContent: 'center',
    },
    chipRowTop: {
      flexDirection: 'row',
      gap: 6,
    },
    chipRowBottom: {
      flexDirection: 'row',
      gap: 6,
    },
    rowChip: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      height: 32,
      minHeight: 32,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.strong,
    },
    rowChipText: {
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
    },
    rowChipActive: {
      backgroundColor: semantic.action.primary,
      borderColor: semantic.action.primary,
    },
    filterTallBtn: {
      width: 44,
      height: FILTER_ROW_H,
      borderRadius: koolaRadii.md,
      backgroundColor: semantic.surface.level2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.strong,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    },
    filterTallBadge: {
      position: 'absolute',
      top: 6,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EF4444',
    },
    filterBadgeText: {
      fontSize: 10,
      lineHeight: 12,
    },
    // ── Filter sheet ──
    sheetContent: {
      paddingHorizontal: 20,
      paddingTop: 4,
    },
    sheetHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    sheetClearBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    sheetSectionTitle: {
      marginTop: 12,
      marginBottom: 8,
    },
    sheetChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    sheetChipWrap: {
      marginRight: 8,
      marginBottom: 8,
    },
    // ── Product row ──
    productRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: koolaRadii.md,
      backgroundColor: semantic.surface.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      // No blanket padding — the thumbnail bleeds to the top/bottom/left
      // edges, so the 10dp inset lives on the content that still needs it
      // (productMeta paddingVertical/marginLeft/marginRight). rowCartBtn is
      // an absolute sibling of productMeta anchored to THIS card, so its own
      // right/bottom offsets supply its inset independently.
      // overflow:'hidden' is what clips the bled thumb to the card's radius —
      // rowCartBtn's right:10/bottom:6 sit well inside the md (14dp) corner
      // radius, so it isn't clipped by this.
      marginBottom: CARD_GAP,
      overflow: 'hidden',
      ...cardShadow,
    },
    productThumb: {
      // Square, DERIVED rather than hardcoded. `alignSelf: 'stretch'` makes the
      // cross-axis height resolve to the row's content height (set by the meta
      // block, which is the tallest child), then `aspectRatio: 1` derives width
      // from that height — so the thumb stays exactly square automatically.
      //
      // No fixed width on purpose: a literal 102 would be a visual no-op today
      // and would rot into a squat rectangle the moment the card grows (e.g.
      // caption/label scale to 1.6x for accessibility, which makes the meta
      // block taller). Height must keep deriving from the meta block, never the
      // reverse, or cross-card height uniformity breaks.
      alignSelf: 'stretch',
      aspectRatio: 1,
      // Flush in the card's left edge, so only the left corners round — and
      // they must match the CARD's radius (md), not the old sm. Right corners
      // stay square where the image butts against the text column.
      borderTopLeftRadius: koolaRadii.md,
      borderBottomLeftRadius: koolaRadii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Fills productThumb via PERCENTAGE sizing, deliberately NOT absolute
    // positioning. productThumb has no width of its own: `alignSelf:'stretch'`
    // resolves its height from the row, then `aspectRatio: 1` derives the width
    // from that height. An absolutely-positioned child pinning all four edges
    // (StyleSheet.absoluteFillObject → right/bottom: 0) needs its containing
    // block's width already resolved, which here is still pending on the
    // aspectRatio pass — Yoga/Fabric then falls back to the row's full width and
    // the image bleeds across the whole card, over the title/price/tags.
    // `width/height: '100%'` resolves in the same pass as the parent, so the
    // image stays inside the square.
    // Repeats productThumb's left-only corner radii — productThumb has no
    // overflow:'hidden' of its own (the card clips at its own edge), so without
    // this the image would square off the thumb's rounded left corners.
    productThumbImage: {
      width: '100%',
      height: '100%',
      borderTopLeftRadius: koolaRadii.md,
      borderBottomLeftRadius: koolaRadii.md,
    },
    productMeta: {
      flex: 1,
      // Carries the inset the card's removed `padding: 10` used to provide.
      // paddingVertical here is what now sets the card's height, which the
      // stretched thumbnail then matches. marginRight is a plain right inset
      // from the card edge for the title/shop/price/rating rows — the cart
      // button is a sibling of this block (absolute, own right/bottom
      // offsets), not something this margin needs to make room for.
      paddingVertical: 6,
      marginLeft: 10,
      marginRight: 10,
    },
    // Sizes step DOWN from the `label`/`caption` variant defaults so the card
    // reads denser: hierarchy now comes from weight + color, not size. Line
    // heights come down with them (~1.4 ratio, matching label 14/20 and
    // caption 12/16) so the text box stops reserving the taller variant line.
    productTitle: {
      fontSize: 12,
      lineHeight: 16,
      marginBottom: 1,
    },
    productShop: {
      fontSize: 11,
      lineHeight: 14,
      marginBottom: 2,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 2,
    },
    priceText: {
      fontSize: 13,
      lineHeight: 18,
      color: semantic.text.primary,
      marginRight: 6,
    },
    strikeText: {
      fontSize: 11,
      lineHeight: 14,
      textDecorationLine: 'line-through',
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 2,
    },
    soldText: {
      fontSize: 11,
      lineHeight: 14,
    },
    // nowrap (was 'wrap') is what actually guarantees one line. Capping at 2
    // tags keeps every card one tag-line tall. paddingRight reserves a lane
    // clear of the two absolute action buttons (chat + cart: 2×30 wide + 6 gap
    // between + 10 right inset − 10 already provided by productMeta's
    // marginRight + 6 breathing gap = 72) so long tags truncate against that
    // edge instead of running underneath the buttons — this reservation is
    // local to tagRow only, the title/shop/price rows above keep productMeta's
    // full width. Tag chips already have flexShrink:1 + numberOfLines={1}, so
    // they truncate rather than collide with the reserved lane.
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      paddingRight: 72,
    },
    tagChip: {
      flexShrink: 1,
      borderRadius: koolaRadii.xs,
      backgroundColor: semantic.surface.level0,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginRight: 4,
      marginTop: 1,
    },
    tagText: {
      fontSize: 10,
      lineHeight: 13,
    },
    rowCartBtn: {
      // Absolutely positioned sibling of productMeta inside productRowCard —
      // out of flow, so its 30dp height no longer drives tagRow's height (that
      // was the earlier bug: tagRow inflated to 30dp with empty space above
      // the 18dp chips). productRowCard is the anchor because its width is
      // resolved by the FlatList row, not derived (unlike productThumb, whose
      // width comes FROM aspectRatio+stretch — an absolute right/bottom child
      // there hits the same Yoga trap productThumbImage's comment describes).
      // right: 10 matches productMeta's marginLeft/marginRight. bottom: 6
      // matches productMeta's paddingVertical, so the button stays level
      // with the tag row's bottom text baseline instead of floating above
      // it now that the text block's own bottom inset is 6, not 10.
      // productRowCard has overflow:'hidden' but 6 sits well inside its md
      // (14dp) corner radius, so the button isn't clipped.
      position: 'absolute',
      right: 10,
      bottom: 6,
      width: 30,
      height: 30,
      borderRadius: koolaRadii.sm,
      backgroundColor: `${semantic.action.primary}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Chat button sits immediately left of the [+ giỏ] button: 10 right inset
    // + 30 cart width + 6 gap.
    rowChatBtn: {
      right: 46,
    },
    emptyWrap: {
      alignItems: 'center',
      paddingTop: 48,
      paddingBottom: 24,
    },
    // Infinite-scroll footer (spinner / retry). 44dp min touch target.
    footer: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
  });
};

export default ShoppingHomeScreen;
