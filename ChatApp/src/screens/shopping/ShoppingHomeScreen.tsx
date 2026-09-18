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
import { BlurView } from '@sbaiahmed1/react-native-blur';
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
 *   [glass search pill 48]  →  [Lọc pill + category scroller 44]  →  list
 *
 * The old chrome stacked a flat search bar, a tall blue "LỌC" well and two
 * wrapping pill rows (~264dp above the first product), which broke two DNA
 * rules: max 2 filter rows above content, and ~120px max filter height. Sort
 * and attribute chips now live in a bottom sheet behind the compact "Lọc" pill,
 * and the search surface matches the Chat tab's glass dock so the app has one
 * search language.
 *
 * Notch is hosted by ShoppingTabStack (fixed chrome); this screen owns search,
 * the filter row, the filter sheet and the product list.
 */

// Chrome reserve above the first product row: 4 gap + 48 dock + 8 gap
// + 44 filter row + 8 gap. The list pads by this so nothing is clipped at
// scroll 0 while rows still slide behind the glass pill on scroll.
const DOCK_GAP_TOP = 4;
// 36 = the COLLAPSED end-state height of ChatSearchDock (which morphs 48→36).
// This dock is static at that collapsed size. CHROME_RESERVE below recomputes
// from this, so the list's paddingTop tracks it automatically.
const DOCK_H = 36;
const DOCK_GAP_BOTTOM = 8;
const FILTER_ROW_H = 44;
const FILTER_ROW_GAP_BOTTOM = 8;
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

// ── Search dock: fixed glass pill, static 36dp height (no scroll morph) ─────
// Mirrors ChatSearchDock (ChatHomeScreen.tsx) in material/layering, sized to
// that dock's COLLAPSED end-state (height 36, gap 6, icon ~18, font 11.5,
// host paddingHorizontal 4). Unlike that dock (a Pressable used only for
// navigation), this one hosts a live TextInput — morphing height while the
// keyboard is open risks a layout jump / focus loss, so this version stays
// static at the collapsed size rather than interpolating.
//
// 36dp is under the 44dp minimum touch target (ui-dna.md:275), so the input
// and the clear button carry vertical hitSlop to bring their effective touch
// area back to ~44dp while the pill stays visually 36dp.
//
// Layer order is load-bearing: shadowWrap → host (hairline, overflow hidden)
// → BlurView (full-fill) → innerEdge + content row AS CHILDREN of BlurView.
// Native BlurViewGroup.draw() skips its own subtree while capturing the
// snapshot it blurs — children are excluded from that capture, siblings are
// not. A sibling innerEdge/content row would get captured and rendered
// blurred, ghosting behind the crisp icon/text (see ChatSearchDock comment).
const ShoppingSearchDock: React.FC<{
  semantic: SemanticTokens;
  value: string;
  onChangeText: (t: string) => void;
}> = ({ semantic, value, onChangeText }) => {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [focused, setFocused] = useState(false);
  const dockShadow = isDark ? koolaDarkShadows.md : koolaShadows.md;
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const focusRing = semantic.focus.ring;

  return (
    <View style={[dockStyles.shadowWrap, dockShadow, dockStyles.hostSize]}>
      <View
        style={[
          dockStyles.host,
          { borderColor: focused ? focusRing : hairline, borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth },
        ]}>
        <BlurView
          blurType={isDark ? 'dark' : 'light'}
          blurAmount={18}
          overlayColor={isDark ? 'rgba(28,32,38,0.52)' : 'rgba(255,255,255,0.62)'}
          reducedTransparencyFallbackColor={isDark ? '#1C2026' : '#FFFFFF'}
          style={dockStyles.blurFill}>
          {/* innerEdge + content MUST be BlurView children, not siblings — see
              file header comment for why. */}
          <View pointerEvents="none" style={[dockStyles.innerEdge, isDark ? dockStyles.innerEdgeDark : null]} />
          <View style={dockStyles.contentRow}>
            {/* 18px = chat's collapsed effective icon size (22 × 0.82). Set
                directly rather than via a scale transform so the vector stays
                crisp at this size. */}
            <MaterialIcons name="search" size={18} color={semantic.text.faint} style={dockStyles.searchIcon} />
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder="Tìm kiếm sản phẩm..."
              placeholderTextColor={semantic.text.faint}
              style={[dockStyles.searchInput, { color: semantic.text.primary }]}
              returnKeyType="search"
              underlineColorAndroid="transparent"
              accessibilityLabel="Tìm kiếm sản phẩm"
              // Brings the 36dp-tall field back to a ~44dp touch target.
              hitSlop={{ top: 4, bottom: 4 }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            {value.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa tìm kiếm"
                onPress={() => onChangeText('')}
                // 24dp box + 10 slop each side ≈ 44dp effective, so the clear
                // button stays easy to hit on the shorter pill.
                hitSlop={10}
                style={dockStyles.searchClear}>
                <MaterialIcons name="close" size={18} color={semantic.text.muted} />
              </Pressable>
            ) : null}
          </View>
        </BlurView>
      </View>
    </View>
  );
};

const dockStyles = StyleSheet.create({
  shadowWrap: {
    borderRadius: koolaRadii.pill,
    overflow: 'visible',
  },
  // height + paddingHorizontal sit on the outer wrapper, matching where chat
  // applies them (its animatedHostStyle targets shadowWrap, not host); the
  // pill itself is flex:1 inside. Keeping padding off `host` also matters
  // because blurFill is absolutely positioned within it — padding there would
  // inset the glass fill instead of the content.
  hostSize: {
    height: DOCK_H,
    paddingHorizontal: 4,
  },
  host: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
  },
  blurFill: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
  },
  innerEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderTopLeftRadius: koolaRadii.pill,
    borderTopRightRadius: koolaRadii.pill,
  },
  innerEdgeDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // Mirrors chat's inner searchBtn inset (paddingLeft 14 / paddingRight 8),
    // stacked on top of the 4dp already reserved by hostSize.
    paddingLeft: 14,
    paddingRight: 8,
  },
  // 6 = chat's collapsed inner gap (expanded is 8).
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    // 11.5 = chat's collapsed placeholder/label font size (expanded is 13).
    fontSize: 11.5,
    // No explicit lineHeight: on Android a lineHeight tight to a small
    // fontSize clips ascenders/descenders. Full-height box + centered text
    // keeps the placeholder and typed value un-cut inside the 36dp pill.
    height: DOCK_H,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  searchClear: {
    marginLeft: 6,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── Filter row: compact "Lọc" pill (fixed, opens sheet) + sort/attr scroller ─
// Single 44dp row replaces the old tall blue well + 2 wrapping pill rows.
// Sort + attribute chips live here (directly toggleable); categories moved into
// the sheet — the two groups were swapped after device review.
// WARNING (ui-dna.md:311): never use `gap` in a row-direction container that
// has flex:1 children — Hermes on RN 0.76 silently drops children to new
// lines. This row uses marginRight/marginLeft + flexShrink:0 instead.
const FilterRow: React.FC<{
  semantic: SemanticTokens;
  styles: Styles;
  activeCount: number;
  onOpenFilters: () => void;
  activeSort: string | null;
  activeAttr: string | null;
  onToggleSort: (label: string) => void;
  onToggleAttr: (label: string) => void;
}> = ({ semantic, styles, activeCount, onOpenFilters, activeSort, activeAttr, onToggleSort, onToggleAttr }) => (
  <View style={styles.filterRow}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        activeCount > 0 ? `Lọc, ${activeCount} bộ lọc đang áp dụng` : 'Lọc sản phẩm'
      }
      accessibilityState={{ selected: activeCount > 0 }}
      android_ripple={{ color: semantic.border.subtle }}
      onPress={onOpenFilters}
      hitSlop={4}
      style={styles.filterPillBtn}>
      <MaterialIcons name="filter-list" size={18} color={semantic.action.primary} />
      <KoolaText variant="caption" weight="700" tone="primary" style={styles.filterPillLabel} numberOfLines={1}>
        Lọc
      </KoolaText>
      {activeCount > 0 ? (
        <View style={styles.filterCountBadge}>
          <KoolaText variant="caption" weight="800" tone="surface" style={styles.filterCountText}>
            {activeCount}
          </KoolaText>
        </View>
      ) : null}
    </Pressable>
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
}> = React.memo(({ item, semantic, styles, onOpen, onAdd }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={item.title}
    android_ripple={{ color: semantic.border.subtle }}
    onPress={onOpen}
    style={styles.productRowCard}>
    <View style={[styles.productThumb, { backgroundColor: `${item.accent}16` }]}>
      {/* 44: the thumb grew 72 → 104 wide and now fills the card's full
          height, so the glyph scales with it (holding roughly the original
          30/72 ≈ 0.42 ratio) rather than looking lost in the larger area. */}
      <MaterialIcons name={item.icon as never} size={44} color={item.accent} />
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
      {/* Cap at 2 tags so every card's tag row is exactly one line and all
          cards share a height. Mock data carries up to 3 tags per product —
          the full array stays intact, only the render trims. */}
      <View style={styles.tagRow}>
        {item.tags.slice(0, TAGS_PER_CARD).map((tag) => (
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
  // Toast must render above the floating tab dock, not under it.
  const { notify, toast } = useComingSoonToast({ bottom: tabBarInset + 16 });
  const styles = useMemo(
    () => makeStyles(semantic, resolvedScheme),
    [semantic, resolvedScheme],
  );
  const notchPad = insets.top + NOTCH_WING_INSET + NOTCH_HEADER_CONTENT_H + 4;
  // Fixed chrome (dock + filter row) floats over the list at notchPad; the
  // list reserves notchPad + CHROME_RESERVE so the first row clears both with
  // no clipping at scroll 0, and content slides behind the glass on scroll.
  const overlayTop = notchPad;
  const listTopPad = notchPad + CHROME_RESERVE;

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
              {/* Lọc pill, then the first two row chips ("Được mua nhiều
                  nhất" is the widest, hence 140). */}
              <KoolaSkeleton width={72} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={140} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={92} height={FILTER_ROW_H} radius={koolaRadii.pill} />
            </View>
          </View>
          <View style={styles.listContent}>
            {[0, 1, 2].map((i) => (
              <KoolaSkeleton
                key={i}
                width="100%"
                height={92}
                radius={koolaRadii.md}
                style={{ marginTop: i === 0 ? FILTER_ROW_GAP_BOTTOM : CARD_GAP }}
              />
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
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.listContent, { paddingTop: listTopPad, paddingBottom: tabBarInset }]}
          showsVerticalScrollIndicator={false}
          style={styles.screenTransparent}
        />
      )}
      {contentReady ? (
        <View style={[styles.overlayChrome, { top: overlayTop }]} pointerEvents="box-none">
          <View style={styles.contentInset} pointerEvents="box-none">
            <ShoppingSearchDock semantic={semantic} value={query} onChangeText={setQuery} />
            <FilterRow
              semantic={semantic}
              styles={styles}
              activeCount={activeFilterCount}
              onOpenFilters={openFilterSheet}
              activeSort={activeSort}
              activeAttr={activeAttr}
              onToggleSort={toggleSort}
              onToggleAttr={toggleAttr}
            />
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
    // ── Filter row ──
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: FILTER_ROW_H,
      marginTop: DOCK_GAP_BOTTOM,
    },
    filterPillBtn: {
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      height: 36,
      minHeight: 36,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      marginRight: 8,
      backgroundColor: semantic.surface.level2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      ...cardShadow,
    },
    filterPillLabel: {
      marginLeft: 6,
    },
    filterCountBadge: {
      marginLeft: 6,
      minWidth: 18,
      height: 18,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 5,
      backgroundColor: semantic.action.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterCountText: {
      lineHeight: 18,
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
      backgroundColor: semantic.surface.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
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
      // (productMeta paddingVertical/marginLeft, rowCartBtn marginRight).
      // overflow:'hidden' is what clips the bled thumb to the card's radius.
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
      // stretched thumbnail then matches.
      paddingVertical: 10,
      marginLeft: 10,
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
    // nowrap (was 'wrap') is what actually guarantees one line. Capping at 2
    // tags fits every mock combo at default text size, but caption text scales
    // to 1.3x for accessibility, and at that size the longest pair
    // ("Đã xác minh" + "Chính hãng") reaches the available meta width on a
    // 360dp screen — with 'wrap' it would drop to a second line and make that
    // card taller again. With nowrap + a shrinkable chip, the last tag
    // truncates via its existing numberOfLines={1} instead.
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
    },
    tagChip: {
      flexShrink: 1,
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
      // Replaces the right side of the card's removed `padding: 10`, so the
      // button keeps its inset from the card edge. Its existing hitSlop={8}
      // still puts the effective target at ~52dp.
      marginRight: 10,
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
