import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaChip,
  KoolaSheet,
  KoolaSkeleton,
  KoolaText,
  koolaRadii,
  koolaDarkShadows,
  koolaShadows,
  koolaZIndex,
  useTheme,
} from '../../ui';
import { NOTCH_HEADER_CONTENT_H, NOTCH_WING_INSET } from '../../components/NotchHeader';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
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
 *
 * Chrome layout (fixed, floats over the list):
 *   [flat search pill 40 + filter icon]  →  [chips-only scroller 44]  →  list
 *
 * Search is a flat opaque pill (fill `border.subtle`, no blur/shadow, focus
 * ring is an overlay). The filter entry point ("Lọc" icon + badge) lives inside
 * the dock (divider + icon-only button) so FilterRow below is chips-only.
 * Scroll hides the dock over 120dp with snap at ~60dp; filter row slides into
 * the vacated space (44→40 height compression, same offset — no seam).
 *
 * Notch is hosted by ShoppingTabStack (fixed chrome); this screen owns search,
 * the filter row, the filter sheet and the product list.
 */

// Chrome reserve above the first product row: 4 gap + 40 dock + 8 gap
// + 44 filter row + 12 gap (at rest; collapses 12→8 when chrome hides).
// The list pads by this max reserve so nothing is clipped at scroll 0 while
// rows still slide behind the pill on scroll. The 12→8 collapse is realized
// as an Animated spacer inside overlayChrome (not as FlatList padding) so
// CHROME_RESERVE / listTopPad stay static and the FlatList avoids a
// layout reflow on every scroll frame.
const DOCK_GAP_TOP = 4;
// 40 + hitSlop covers the 44dp minimum touch target (ui-dna.md:275): the pill
// is visually 40dp while the TextInput's hitSlop top/bottom 2 brings its
// effective area to 44dp. CHROME_RESERVE below recomputes from this.
const DOCK_H = 40;
const DOCK_GAP_BOTTOM = 8;
const FILTER_ROW_H = 44;
const FILTER_ROW_H_COLLAPSED = 40;
const FILTER_ROW_GAP_BOTTOM = 12;
const FILTER_ROW_GAP_COLLAPSED = 8;
// Scroll-driven chrome: dock hides over 120dp, snap at midpoint (~60dp).
const DOCK_HIDE_THRESHOLD = 120;
const DOCK_HIDE_MID = DOCK_HIDE_THRESHOLD / 2;
const DOCK_SLIDE = DOCK_H + DOCK_GAP_BOTTOM;
// Vertical gap between product cards. Shared with the skeleton's row spacing
// so the two stay in sync and swapping in real content causes no shift.
const CARD_GAP = 6;
// Tags shown per card (mock data carries up to 3; capped for uniform row height).
const TAGS_PER_CARD = 2;
const CHROME_RESERVE =
  DOCK_GAP_TOP + DOCK_H + DOCK_GAP_BOTTOM + FILTER_ROW_H + FILTER_ROW_GAP_BOTTOM;

// shoppingCategories[0] is the { id: 'all' } sentinel. It stays in the mock
// data file (other code may reference it) but is never rendered as a chip —
// with categories behind the sheet, "no category selected" already means
// all products, so a standalone "Tất cả" chip would be redundant.
const ALL_CATEGORY_ID = 'all';

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
  // Sắp xếp theo dữ liệu mẫu (soldCount/rating) — chỉ để preview, chưa có backend.
  if (activeSort === 'Được mua nhiều nhất') {
    list = list.slice().sort((a, b) => b.soldCount - a.soldCount);
  } else if (activeSort === 'Đánh giá cao') {
    list = list.slice().sort((a, b) => b.rating - a.rating);
  }
  return list;
}

// ── Search dock: flat opaque pill, 40dp (flat dock pass) ────────────────────
// Flat, no blur/shadow — fill is `semantic.border.subtle`. 40 + hitSlop
// covers the 44dp minimum (ui-dna.md:275) without a shadowWrap. Focus ring is
// an absolutely-positioned overlay so it doesn't eat into the content box.
const ShoppingSearchDock: React.FC<{
  semantic: SemanticTokens;
  value: string;
  onChangeText: (t: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onFocusChange?: (f: boolean) => void;
}> = ({ semantic, value, onChangeText, activeFilterCount, onOpenFilters, onFocusChange }) => {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => { setFocused(true); onFocusChange?.(true); }, [onFocusChange]);
  const handleBlur = useCallback(() => { setFocused(false); onFocusChange?.(false); }, [onFocusChange]);

  return (
    <View style={[dockStyles.pill, { backgroundColor: semantic.border.subtle }]}>
      {focused ? (
        <View pointerEvents="none" style={[dockStyles.focusRing, { borderColor: semantic.focus.ring }]} />
      ) : null}
      <View style={dockStyles.contentRow}>
        <MaterialIcons name="search" size={20} color={semantic.text.faint} style={dockStyles.searchIcon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Tìm kiếm sản phẩm..."
          placeholderTextColor={semantic.text.faint}
          style={[dockStyles.searchInput, { color: semantic.text.primary }]}
          returnKeyType="search"
          underlineColorAndroid="transparent"
          accessibilityLabel="Tìm kiếm sản phẩm"
          hitSlop={{ top: 2, bottom: 2 }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa tìm kiếm"
            onPress={() => onChangeText('')}
            hitSlop={6}
            style={dockStyles.searchClear}>
            <MaterialIcons name="close" size={20} color={semantic.text.muted} />
          </Pressable>
        ) : null}
        <View style={[dockStyles.divider, { backgroundColor: semantic.border.strong }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0 ? `Lọc, ${activeFilterCount} bộ lọc đang áp dụng` : 'Lọc sản phẩm'
          }
          onPress={onOpenFilters}
          hitSlop={6}
          style={dockStyles.filterBtn}>
          <MaterialIcons name="filter-list" size={20} color={semantic.action.primary} />
          {activeFilterCount > 0 ? (
            <View style={dockStyles.filterBadge}>
              <KoolaText variant="caption" weight="800" tone="surface" style={dockStyles.filterBadgeText}>
                {activeFilterCount}
              </KoolaText>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
};

const dockStyles = StyleSheet.create({
  pill: {
    height: DOCK_H,
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
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: DOCK_H,
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
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    marginHorizontal: 8,
    opacity: 1,
  },
  filterBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
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
});

// ── Filter row: chips-only scroller (flat dock owns the filter icon) ───────
 // Filter entry point (icon + badge + divider) lives inside the dock pill; this
 // row is only the horizontal chip scroller. Single 44→40dp row.
 // WARNING (ui-dna.md:311): never use `gap` in a row-direction container that
 // has flex:1 children — Hermes on RN 0.76 silently drops children to new
 // lines. Chips use marginRight + flexShrink:0 instead.
const FilterRow: React.FC<{
  semantic: SemanticTokens;
  styles: Styles;
  activeSort: string | null;
  activeAttr: string | null;
  onToggleSort: (label: string) => void;
  onToggleAttr: (label: string) => void;
}> = ({ semantic: _semantic, styles, activeSort, activeAttr, onToggleSort, onToggleAttr }) => (
  <View style={styles.filterRow}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroller}
      contentContainerStyle={styles.chipScrollerContent}>
      {shoppingSortChips.map((label) => {
        const selected = activeSort === label;
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onToggleSort(label)}
            hitSlop={4}
            style={[styles.rowChip, selected && styles.rowChipActive]}>
            <KoolaText
              variant="caption"
              weight="800"
              tone={selected ? 'surface' : 'muted'}
              numberOfLines={1}>
              {label}
            </KoolaText>
          </Pressable>
        );
      })}
      {shoppingAttributeChips.map((label) => {
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
              weight="800"
              tone={selected ? 'surface' : 'muted'}
              numberOfLines={1}>
              {label}
            </KoolaText>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);

// ── Filter sheet: category chips (KoolaSheet, first production use) ──────────
// Sort + attribute chips are NOT duplicated here — they live fully visible in
// the outer filter row, and two controls bound to one piece of state is
// redundant UI. Sheet = "Phân loại" + "Xóa lọc".
//
// The `{ id: 'all' }` entry stays in shoppingMockData (other code may reference
// it) but is filtered out at render: with categories behind the sheet, "no
// category selected" already means all products. No dead end — tapping the
// active category chip clears it (toggle), and "Xóa lọc" clears all three
// groups.
const FilterSheet: React.FC<{
  styles: Styles;
  activeCategory: string;
  hasActiveFilters: boolean;
  onToggleCategory: (id: string) => void;
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
        {shoppingCategories
          .filter((category) => category.id !== ALL_CATEGORY_ID)
          .map((category) => (
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

// ── Single-column product row (thumbnail + meta + price + cart) ───────────────
const ProductRow: React.FC<{
  item: ShoppingProduct;
  semantic: SemanticTokens;
  styles: Styles;
  onOpen: () => void;
  onAdd: () => void;
}> = React.memo(({ item, semantic, styles, onOpen, onAdd }) => {
  // Ảnh mock là bundled asset nên gần như không thể lỗi, nhưng vẫn theo dõi
  // onError để ô thumb không bao giờ là một khối màu trống: hỏng ảnh → rơi về
  // glyph, đúng như khi sản phẩm chưa có `image`.
  const [imageFailed, setImageFailed] = useState(false);
  const onImageError = useCallback(() => setImageFailed(true), []);
  const showImage = Boolean(item.image) && !imageFailed;

  return (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={item.title}
    android_ripple={{ color: semantic.border.subtle }}
    onPress={onOpen}
    style={styles.productRowCard}>
    <View style={[styles.productThumb, { backgroundColor: `${item.accent}16` }]}>
      {showImage ? (
        // Ảnh phủ kín ô vuông, nằm TRÊN nền accent (nền hiện trong lúc decode)
        // và DƯỚI badge — badge render sau nên vẫn nằm trên cùng. Ảnh chỉ để
        // trang trí: Pressable cha đã có accessibilityLabel={item.title}.
        <Image
          source={item.image as ImageSourcePropType}
          style={styles.productThumbImage}
          resizeMode="cover"
          onError={onImageError}
          accessible={false}
          importantForAccessibility="no"
        />
      ) : (
        /* 44: the thumb grew 72 → 104 wide and now fills the card's full
           height, so the glyph scales with it (holding roughly the original
           30/72 ≈ 0.42 ratio) rather than looking lost in the larger area. */
        <MaterialIcons name={item.icon as never} size={44} color={item.accent} />
      )}
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
      {/* Rating + sold count. The star is decorative — the adjacent numbers
          carry the meaning, and the outer Pressable already owns
          accessibilityLabel={item.title} — so the row is wrapped with its own
          accessible/accessibilityLabel instead of leaving the star to float
          unannounced next to a bare "4.8". */}
      <View
        style={styles.ratingRow}
        accessible
        accessibilityLabel={`${item.rating} sao, đã bán ${item.sold}`}>
        <MaterialIcons
          name="star"
          size={12}
          color={semantic.status.warning}
          importantForAccessibility="no"
        />
        <KoolaText variant="caption" weight="700" style={styles.ratingText} numberOfLines={1}>
          {item.rating}
        </KoolaText>
        <KoolaText variant="caption" tone="muted" style={styles.soldText} numberOfLines={1}>
          {' · '}
          {item.sold} đã bán
        </KoolaText>
      </View>
      {/* Cap at 2 tags so every card's tag row is exactly one line and all
          cards share a height. Mock data carries up to 3 tags per product —
          the full array stays intact, only the render trims. */}
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
      accessibilityLabel={`Thêm ${item.title} vào giỏ`}
      android_ripple={{ color: `${semantic.status.danger}1A` }}
      onPress={onAdd}
      hitSlop={8}
      style={styles.rowCartBtn}>
      <MaterialIcons name="shopping-cart" size={16} color={semantic.status.danger} />
    </Pressable>
  </Pressable>
  );
});

const ShoppingHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  // Toast must render above the floating tab dock, not under it.
  const { notify, toast } = useComingSoonToast({ bottom: tabBarInset + 16 });
  const styles = useMemo(
    () => makeStyles(semantic, resolvedScheme),
    [semantic, resolvedScheme],
  );
  const notchPad = insets.top + NOTCH_WING_INSET + NOTCH_HEADER_CONTENT_H + 4;
  // Fixed chrome (dock + filter row) floats over the list at notchPad; the
  // list reserves notchPad + CHROME_RESERVE so the first row clears both with
  // no clipping at scroll 0, and content slides behind the pill on scroll.
  const overlayTop = notchPad;
  const listTopPad = notchPad + CHROME_RESERVE;

  // ── Scroll-driven chrome (plain Animated, no Reanimated) ────────────────
  // Mirrors ConversationListScreen's hysteresis pattern but via Animated.Value
  // so no new dependency. appliedOffset is the hysteresis-filtered offset that
  // interpolations read; raw scroll drives it through a JS listener. All
  // animated props are transform/opacity/height — native-driven.
  const appliedOffset = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<ShoppingProduct>>(null);
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

  const dockTranslateY = appliedOffset.interpolate({
    inputRange: [0, DOCK_HIDE_THRESHOLD],
    outputRange: [0, -DOCK_SLIDE],
    extrapolate: 'clamp',
  });
  const dockOpacity = appliedOffset.interpolate({
    inputRange: [0, DOCK_HIDE_MID, DOCK_HIDE_THRESHOLD],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });
  const filterTranslateY = appliedOffset.interpolate({
    inputRange: [0, DOCK_HIDE_THRESHOLD],
    outputRange: [0, -DOCK_SLIDE],
    extrapolate: 'clamp',
  });
  // Filter row compresses 44→40 while sliding; native-driven height via Animated.
  const filterRowHeight = appliedOffset.interpolate({
    inputRange: [0, DOCK_HIDE_THRESHOLD],
    outputRange: [FILTER_ROW_H, FILTER_ROW_H_COLLAPSED],
    extrapolate: 'clamp',
  });
  // Gap below the filter row: 12 at rest → 8 when chrome is fully hidden.
  // Layout prop (height) so driven with useNativeDriver:false via
  // Animated.timing on appliedOffset; stays inside overlayChrome so
  // CHROME_RESERVE / FlatList paddingTop can remain static.
  const filterRowGapHeight = appliedOffset.interpolate({
    inputRange: [0, DOCK_HIDE_THRESHOLD],
    outputRange: [FILTER_ROW_GAP_BOTTOM, FILTER_ROW_GAP_COLLAPSED],
    extrapolate: 'clamp',
  });

  const snapToNearestDetent = useCallback(() => {
    if (dockFocusedRef.current) {
      Animated.timing(appliedOffset, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      rawOffsetRef.current = 0;
      travelRef.current = 0;
      directionRef.current = -1;
      return;
    }
    // Don't fight the sheet's own settle animation while it is open.
    // Hysteresis already holds the chrome steady; snapping underneath
    // would nudge scroll offset under the sheet.
    // Guard lives inside the callback that already closes over filterSheetOpen
    // — add dep below.
    const v = appliedValueRef.current;
    if (v > 20 && v < 100) {
      const target = v < DOCK_HIDE_MID ? 0 : DOCK_HIDE_THRESHOLD;
      Animated.timing(appliedOffset, { toValue: target, duration: 180, useNativeDriver: false }).start();
      flatListRef.current?.scrollToOffset({ offset: target, animated: true });
      rawOffsetRef.current = target;
      travelRef.current = 0;
      directionRef.current = target === 0 ? -1 : 1;
    }
  }, [appliedOffset]);

  const handleFocusChange = useCallback((focused: boolean) => {
    dockFocusedRef.current = focused;
    if (focused) {
      travelRef.current = 0;
      directionRef.current = -1;
      Animated.timing(appliedOffset, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      if (rawOffsetRef.current > 0) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        rawOffsetRef.current = 0;
      }
    }
  }, [appliedOffset]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = Math.max(0, e.nativeEvent.contentOffset.y);
    if (dockFocusedRef.current) {
      if (appliedValueRef.current !== 0) appliedOffset.setValue(0);
      rawOffsetRef.current = y;
      return;
    }
    const delta = y - rawOffsetRef.current;
    rawOffsetRef.current = y;
    if (y <= 4) {
      travelRef.current = 0;
      directionRef.current = -1;
      appliedOffset.setValue(0);
      return;
    }
    if (delta > 0) {
      travelRef.current = Math.max(0, travelRef.current) + delta;
      directionRef.current = 1;
      appliedOffset.setValue(Math.min(DOCK_HIDE_THRESHOLD, y));
    } else if (delta < 0) {
      travelRef.current = Math.min(0, travelRef.current) + delta;
      if (travelRef.current < -HYSTERESIS) {
        directionRef.current = -1;
        appliedOffset.setValue(Math.min(DOCK_HIDE_THRESHOLD, y));
      }
    }
  }, [appliedOffset]);

  const handleScrollBeginDrag = useCallback(() => { isDraggingRef.current = true; }, []);
  const handleScrollEndDrag = useCallback(() => {
    isDraggingRef.current = false;
    snapToNearestDetent();
  }, [snapToNearestDetent]);
  const handleMomentumScrollEnd = useCallback(() => {
    if (!isDraggingRef.current) snapToNearestDetent();
  }, [snapToNearestDetent]);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSort, setActiveSort] = useState<string | null>(null);
  const [activeAttr, setActiveAttr] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

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

  // Counts all three groups: category (when not the 'all' sentinel) + sort + attr.
  const activeFilterCount =
    (activeCategory !== ALL_CATEGORY_ID ? 1 : 0) + (activeSort ? 1 : 0) + (activeAttr ? 1 : 0);

  const toggleSort = useCallback((label: string) => {
    setActiveSort((prev) => (prev === label ? null : label));
  }, []);

  const toggleAttr = useCallback((label: string) => {
    setActiveAttr((prev) => (prev === label ? null : label));
  }, []);

  // Tapping the active category clears it back to the 'all' sentinel, so there
  // is no dead end once a category is picked.
  const toggleCategory = useCallback((id: string) => {
    setActiveCategory((prev) => (prev === id ? ALL_CATEGORY_ID : id));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveCategory(ALL_CATEGORY_ID);
    setActiveSort(null);
    setActiveAttr(null);
  }, []);

  const openFilterSheet = useCallback(() => setFilterSheetOpen(true), []);
  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);

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
        <View style={[styles.screen, { paddingTop: overlayTop }]}>
          {/* Chrome placeholders use contentInset (12) and row placeholders use
              listContent (6), matching the two different real insets so nothing
              shifts horizontally when content swaps in. */}
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={DOCK_H} radius={koolaRadii.pill} />
            <View style={{ flexDirection: 'row', marginTop: DOCK_GAP_BOTTOM, alignItems: 'center' }}>
              {/* Chips-only row: no Lọc placeholder (filter lives inside dock) */}
              <KoolaSkeleton width={140} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={92} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={84} height={FILTER_ROW_H} radius={koolaRadii.pill} />
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
      ) : (
        <Animated.FlatList
          ref={flatListRef}
          removeClippedSubviews={false}
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.listContent, { paddingTop: listTopPad, paddingBottom: tabBarInset }]}
          showsVerticalScrollIndicator={false}
          style={styles.screenTransparent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        />
      )}
      {contentReady ? (
        <View style={[styles.overlayChrome, { top: overlayTop }]} pointerEvents="box-none">
          <View style={styles.contentInset} pointerEvents="box-none">
            {/* Dock: fades + slides up over 120dp; when fully hidden pointerEvents none so taps reach rows. */}
            <Animated.View
              pointerEvents={dockHidden ? 'none' : 'auto'}
              style={{ transform: [{ translateY: dockTranslateY }], opacity: dockOpacity }}>
              <ShoppingSearchDock
                semantic={semantic}
                value={query}
                onChangeText={setQuery}
                activeFilterCount={activeFilterCount}
                onOpenFilters={openFilterSheet}
                onFocusChange={handleFocusChange}
              />
            </Animated.View>
            {/* Filter row: slides up into vacated dock space, compresses 44->40. Same appliedOffset as dock => no seam. */}
            <Animated.View style={{ transform: [{ translateY: filterTranslateY }], height: filterRowHeight, marginTop: DOCK_GAP_BOTTOM, overflow: 'hidden' }}>
              <View style={{ height: FILTER_ROW_H }}>
                <FilterRow
                  semantic={semantic}
                  styles={styles}
                  activeSort={activeSort}
                  activeAttr={activeAttr}
                  onToggleSort={toggleSort}
                  onToggleAttr={toggleAttr}
                />
              </View>
            </Animated.View>
            {/* Breathing gap between filter row and first card: 12 at rest → 8 when hidden. Spacer lives inside overlayChrome (not FlatList padding) so CHROME_RESERVE / listTopPad stay static and avoid layout reflow on every scroll frame. */}
            <Animated.View style={{ transform: [{ translateY: filterTranslateY }], height: filterRowGapHeight }} />
          </View>
        </View>
      ) : null}
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
      {toast}
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
    // Fixed chrome layer above the list; box-none so taps in the gaps still
    // reach the rows scrolling underneath.
    overlayChrome: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingTop: DOCK_GAP_TOP,
      zIndex: koolaZIndex.sticky,
    },
    // ── Filter row (chips-only) ──
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: FILTER_ROW_H,
    },
    // flex:1 so the scroller takes the space the "Lọc" pill leaves; the pill's
    // flexShrink:0 keeps it from being squeezed.
    chipScroller: {
      flex: 1,
    },
    chipScrollerContent: {
      alignItems: 'center',
      paddingRight: 12,
    },
    rowChip: {
      height: 36,
      minHeight: 36,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.strong,
      marginRight: 8,
    },
    rowChipActive: {
      backgroundColor: semantic.action.primary,
      borderColor: semantic.action.primary,
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
    // image stays inside the square. (productBadge stays absolute safely because
    // it only pins left+top, never right/bottom.)
    // Repeats productThumb's left-only corner radii — productThumb has no
    // overflow:'hidden' of its own (the card clips at its own edge), so without
    // this the image would square off the thumb's rounded left corners.
    productThumbImage: {
      width: '100%',
      height: '100%',
      borderTopLeftRadius: koolaRadii.md,
      borderBottomLeftRadius: koolaRadii.md,
    },
    productBadge: {
      position: 'absolute',
      // Nudged 4→6 now that the thumb is flush in the card's md (14dp) corner:
      // at 4,4 the badge sat inside the corner's curve and read as clipped.
      left: 6,
      top: 6,
      maxWidth: 76,
      borderRadius: koolaRadii.xs,
      backgroundColor: semantic.text.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
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
      color: semantic.status.danger,
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
    ratingText: {
      fontSize: 11,
      lineHeight: 14,
      marginLeft: 3,
    },
    soldText: {
      fontSize: 11,
      lineHeight: 14,
    },
    // nowrap (was 'wrap') is what actually guarantees one line. Capping at 2
    // tags fits every mock combo at default text size. paddingRight reserves
    // a lane clear of the absolute rowCartBtn (30 wide + 10 right inset + 6
    // breathing gap) so long tags truncate against that edge instead of
    // running underneath the button — this reservation is local to tagRow
    // only, the title/shop/price/rating rows above keep productMeta's full
    // width. Tag chips already have flexShrink:1 + numberOfLines={1}, so
    // they truncate rather than collide with the reserved lane.
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      paddingRight: 46,
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
      backgroundColor: `${semantic.status.danger}1A`,
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
