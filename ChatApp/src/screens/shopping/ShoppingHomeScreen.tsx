import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaBadge,
  KoolaIconButton,
  KoolaLogo,
  KoolaText,
  koolaRadii,
  koolaShadows,
  koolaDarkShadows,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import {
  shoppingCategories,
  shoppingProducts,
  shoppingStores,
  type ShoppingProduct,
  type ShoppingStore,
} from './shoppingMockData';

type Styles = ReturnType<typeof makeStyles>;

const ShoppingHeader: React.FC<{
  cartCount: number;
  palette: Palette;
  styles: Styles;
  onComingSoon: () => void;
}> = ({ cartCount, palette, styles, onComingSoon }) => (
  <View style={styles.header}>
    <KoolaLogo showMark={false} variant="extruded" font="sora" wordmarkSize={24} style={styles.logoWrap} />
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Tìm sản phẩm, cửa hàng"
      android_ripple={{ color: palette.line }}
      onPress={onComingSoon}
      style={styles.searchBox}>
      <MaterialIcons name="search" size={18} color={palette.muted} />
      <KoolaText tone="muted" numberOfLines={1} style={styles.searchText}>
        Tìm sản phẩm, cửa hàng...
      </KoolaText>
    </Pressable>
    <View style={styles.cartWrap}>
      <KoolaIconButton
        icon="shopping-cart"
        variant="solid"
        tone="surface"
        size={38}
        iconSize={20}
        accessibilityLabel="Giỏ hàng"
        onPress={onComingSoon}
      />
      {cartCount > 0 && (
        <View style={styles.cartBadge}>
          <KoolaText variant="caption" tone="surface" weight="800">
            {cartCount}
          </KoolaText>
        </View>
      )}
    </View>
  </View>
);

const PromoBand: React.FC<{ palette: Palette; styles: Styles }> = ({
  palette,
  styles,
}) => (
  <View style={styles.promoBand}>
    <View style={styles.promoIcon}>
      <MaterialIcons name="bolt" size={24} color={palette.warm} />
    </View>
    <View style={styles.promoCopy}>
      <KoolaText variant="label" weight="800" numberOfLines={1}>
        Deal nhanh quanh bạn
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={2}>
        Mua tạp hóa, đồ ăn và vật dụng giao trong ngày
      </KoolaText>
    </View>
    <View style={styles.promoMetric}>
      <KoolaText variant="label" weight="800" style={styles.warmText}>
        -25%
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={1}>
        hôm nay
      </KoolaText>
    </View>
  </View>
);

const QuickActions: React.FC<{
  palette: Palette;
  styles: Styles;
  onComingSoon: () => void;
}> = ({ palette, styles, onComingSoon }) => {
  const actions = [
    { label: 'Siêu thị', icon: 'local-grocery-store', color: palette.accent },
    { label: 'Ăn uống', icon: 'restaurant', color: palette.warm },
    { label: 'Freeship', icon: 'local-shipping', color: palette.primary },
    { label: 'Deal sốc', icon: 'local-offer', color: palette.danger },
  ];

  return (
    <View style={styles.quickGrid}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          android_ripple={{ color: palette.line }}
          onPress={onComingSoon}
          style={styles.quickAction}>
          <View style={[styles.quickIcon, { backgroundColor: `${action.color}18` }]}>
            <MaterialIcons name={action.icon} size={22} color={action.color} />
          </View>
          <KoolaText variant="caption" weight="700" align="center" numberOfLines={1}>
            {action.label}
          </KoolaText>
        </Pressable>
      ))}
    </View>
  );
};

const ProductCard: React.FC<{
  item: ShoppingProduct;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
  onAdd: () => void;
  onOpen: () => void;
  palette: Palette;
  styles: Styles;
}> = React.memo(({ item, favorite, onToggleFavorite, onAdd, onOpen, palette, styles }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={item.title}
    onPress={onOpen}
    style={styles.productCard}>
    <View style={[styles.productMedia, { backgroundColor: `${item.accent}16` }]}>
      <MaterialIcons name={item.icon} size={34} color={item.accent} />
      {item.badge && (
        <View style={styles.productBadge}>
          <KoolaText variant="caption" weight="800" tone="surface" numberOfLines={1}>
            {item.badge}
          </KoolaText>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
        onPress={() => onToggleFavorite(item.id)}
        style={styles.favoriteButton}>
        <MaterialIcons
          name={favorite ? 'favorite' : 'favorite-border'}
          size={18}
          color={favorite ? palette.danger : palette.muted}
        />
      </Pressable>
    </View>
    <View style={styles.productBody}>
      <KoolaText variant="label" weight="800" numberOfLines={2} style={styles.productTitle}>
        {item.title}
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={1}>
        {item.shop}
      </KoolaText>
      <View style={styles.metaRow}>
        <MaterialIcons name="star" size={14} color={palette.warning} />
        <KoolaText variant="caption" weight="700">
          {item.rating.toFixed(1)}
        </KoolaText>
        <KoolaText variant="caption" tone="faint" numberOfLines={1}>
          Đã bán {item.sold}
        </KoolaText>
      </View>
      <View style={styles.priceRow}>
        <View style={styles.priceTextWrap}>
          <KoolaText variant="label" weight="800" style={styles.priceText} numberOfLines={1}>
            {item.price}
          </KoolaText>
          {item.originalPrice && (
            <KoolaText variant="caption" tone="faint" style={styles.strikeText} numberOfLines={1}>
              {item.originalPrice}
            </KoolaText>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Thêm ${item.title}`}
          onPress={onAdd}
          style={styles.addButton}>
          <MaterialIcons name="add" size={18} color={palette.surface} />
        </Pressable>
      </View>
      <View style={styles.deliveryPill}>
        <MaterialIcons name="schedule" size={13} color={palette.primary} />
        <KoolaText variant="caption" tone="primary" weight="700" numberOfLines={1}>
          {item.delivery}
        </KoolaText>
      </View>
    </View>
  </Pressable>
));

const StoreRow: React.FC<{
  store: ShoppingStore;
  palette: Palette;
  styles: Styles;
  onOpen: () => void;
}> = ({ store, palette, styles, onOpen }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={store.name}
    android_ripple={{ color: palette.line }}
    onPress={onOpen}
    style={styles.storeRow}>
    <View style={[styles.storeIcon, { backgroundColor: `${store.accent}18` }]}>
      <MaterialIcons name={store.icon} size={22} color={store.accent} />
    </View>
    <View style={styles.storeCopy}>
      <KoolaText variant="label" weight="800" numberOfLines={1}>
        {store.name}
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={1}>
        {store.category}
      </KoolaText>
      <View style={styles.metaRow}>
        <MaterialIcons name="star" size={14} color={palette.warning} />
        <KoolaText variant="caption" weight="700">
          {store.rating.toFixed(1)}
        </KoolaText>
        <KoolaText variant="caption" tone="faint" numberOfLines={1}>
          {store.distance} · {store.eta}
        </KoolaText>
      </View>
    </View>
    <MaterialIcons name="chevron-right" size={22} color={palette.faint} />
  </Pressable>
);

const ShoppingHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const { palette, resolvedScheme } = useTheme();
  const { notify, toast } = useComingSoonToast();
  const styles = useMemo(
    () => makeStyles(palette, resolvedScheme),
    [palette, resolvedScheme],
  );
  const [activeCategory, setActiveCategory] = useState('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [cartCount, setCartCount] = useState(0);

  const handleComingSoon = useCallback(() => notify(), [notify]);

  const products = useMemo(
    () =>
      activeCategory === 'all'
        ? shoppingProducts
        : shoppingProducts.filter((product) => product.category === activeCategory),
    [activeCategory],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    setCartCount((count) => count + 1);
  }, []);

  const renderHeader = () => (
    <View>
      <ShoppingHeader
        cartCount={cartCount}
        palette={palette}
        styles={styles}
        onComingSoon={handleComingSoon}
      />
      <View style={styles.contentInset}>
        <PromoBand palette={palette} styles={styles} />
        <QuickActions palette={palette} styles={styles} onComingSoon={handleComingSoon} />
        <View style={styles.sectionHeader}>
          <View>
            <KoolaText variant="heading" weight="800">
              Gợi ý mua sắm
            </KoolaText>
            <KoolaText variant="caption" tone="muted">
              Sản phẩm nổi bật, cửa hàng gần bạn và deal trong ngày
            </KoolaText>
          </View>
          <KoolaBadge label={`${products.length} món`} tone="primary" />
        </View>
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

  const renderFooter = () => (
    <View style={styles.footer}>
      <View style={styles.sectionHeader}>
        <View>
          <KoolaText variant="heading" weight="800">
            Cửa hàng gần bạn
          </KoolaText>
          <KoolaText variant="caption" tone="muted">
            Ưu tiên khoảng cách gần và giao nhanh
          </KoolaText>
        </View>
      </View>
      <View style={styles.storeList}>
        {shoppingStores.map((store) => (
          <StoreRow
            key={store.id}
            store={store}
            palette={palette}
            styles={styles}
            onOpen={handleComingSoon}
          />
        ))}
      </View>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: ShoppingProduct }) => (
      <ProductCard
        item={item}
        favorite={favoriteIds.has(item.id)}
        onToggleFavorite={toggleFavorite}
        onAdd={handleAdd}
        onOpen={handleComingSoon}
        palette={palette}
        styles={styles}
      />
    ),
    [favoriteIds, toggleFavorite, handleAdd, handleComingSoon, palette, styles],
  );

  return (
    <View style={styles.screen}>
      <FlatList
        // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
        removeClippedSubviews={false}
        data={products}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      />
      {toast}
    </View>
  );
};

const makeStyles = (p: Palette, scheme: 'light' | 'dark') => {
  const bandShadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.subtle;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    listContent: {},
    header: {
      backgroundColor: p.surface,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.line,
    },
    // gap removed from this row (Hermes RN0.76 drops flex:1 children to new
    // lines with gap in a row) — spacing via marginRight + flexShrink:0.
    logoWrap: {
      marginRight: 8,
      flexShrink: 0,
    },
    searchBox: {
      flex: 1,
      minHeight: 38,
      borderRadius: koolaRadii.pill,
      backgroundColor: p.canvas,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      marginRight: 8,
      overflow: 'hidden',
    },
    searchText: {
      flex: 1,
      fontSize: 13,
    },
    cartWrap: {
      flexShrink: 0,
    },
    cartBadge: {
      position: 'absolute',
      right: -2,
      top: -3,
      minWidth: 18,
      height: 18,
      borderRadius: koolaRadii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.danger,
      borderWidth: 2,
      borderColor: p.surface,
    },
    contentInset: {
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    promoBand: {
      minHeight: 86,
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      gap: 12,
      ...bandShadow,
    },
    promoIcon: {
      width: 46,
      height: 46,
      borderRadius: koolaRadii.sm,
      backgroundColor: p.warningSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    promoCopy: {
      flex: 1,
      gap: 2,
    },
    promoMetric: {
      minWidth: 62,
      alignItems: 'flex-end',
    },
    warmText: {
      color: p.warm,
    },
    quickGrid: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    quickAction: {
      flex: 1,
      minHeight: 78,
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      overflow: 'hidden',
    },
    quickIcon: {
      width: 36,
      height: 36,
      borderRadius: koolaRadii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionHeader: {
      marginTop: 18,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
    },
    categoryRow: {
      gap: 8,
      paddingRight: 12,
      paddingBottom: 6,
    },
    categoryButton: {
      minHeight: 36,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
    },
    categoryButtonActive: {
      backgroundColor: p.primary,
      borderColor: p.primary,
    },
    productRow: {
      gap: 10,
      paddingHorizontal: 12,
    },
    productCard: {
      flex: 1,
      minHeight: 276,
      marginBottom: 10,
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
    },
    productMedia: {
      height: 104,
      alignItems: 'center',
      justifyContent: 'center',
    },
    productBadge: {
      position: 'absolute',
      left: 8,
      top: 8,
      maxWidth: 86,
      borderRadius: koolaRadii.xs,
      backgroundColor: p.ink,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    favoriteButton: {
      position: 'absolute',
      right: 8,
      top: 8,
      width: 30,
      height: 30,
      borderRadius: koolaRadii.pill,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    productBody: {
      padding: 10,
      gap: 6,
    },
    productTitle: {
      minHeight: 40,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    priceTextWrap: {
      flex: 1,
    },
    priceText: {
      color: p.danger,
    },
    strikeText: {
      textDecorationLine: 'line-through',
    },
    addButton: {
      width: 34,
      height: 34,
      borderRadius: koolaRadii.sm,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deliveryPill: {
      minHeight: 26,
      borderRadius: koolaRadii.sm,
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: p.primarySoft,
    },
    footer: {
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    storeList: {
      gap: 8,
    },
    storeRow: {
      minHeight: 78,
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      overflow: 'hidden',
    },
    storeIcon: {
      width: 44,
      height: 44,
      borderRadius: koolaRadii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storeCopy: {
      flex: 1,
      gap: 3,
    },
  });
};

export default ShoppingHomeScreen;
