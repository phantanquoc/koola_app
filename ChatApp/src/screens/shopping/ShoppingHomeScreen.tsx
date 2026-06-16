import React, { useMemo, useState } from 'react';
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
  KoolaText,
  koolaColors,
  koolaShadows,
} from '../../ui';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import {
  shoppingCategories,
  shoppingProducts,
  shoppingStores,
  type ShoppingProduct,
  type ShoppingStore,
} from './shoppingMockData';

const ShoppingHeader: React.FC<{ cartCount: number }> = ({ cartCount }) => (
  <View style={styles.header}>
    <View style={styles.logoWrap}>
      <KoolaText variant="heading" weight="800" style={styles.logoBlue}>K</KoolaText>
      <KoolaText variant="heading" weight="800" style={styles.logoGreen}>O</KoolaText>
      <KoolaText variant="heading" weight="800" style={styles.logoWarm}>O</KoolaText>
      <KoolaText variant="heading" weight="800" style={styles.logoBlue}>L</KoolaText>
      <KoolaText variant="heading" weight="800" style={styles.logoGreen}>A</KoolaText>
    </View>
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Tìm sản phẩm, cửa hàng"
      android_ripple={{ color: koolaColors.line }}
      style={styles.searchBox}>
      <MaterialIcons name="search" size={18} color={koolaColors.muted} />
      <KoolaText tone="muted" numberOfLines={1} style={styles.searchText}>
        Tìm sản phẩm, cửa hàng...
      </KoolaText>
    </Pressable>
    <View>
      <KoolaIconButton
        icon="shopping-cart"
        variant="solid"
        tone="surface"
        size={38}
        iconSize={20}
        accessibilityLabel="Giỏ hàng"
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

const PromoBand: React.FC = () => (
  <View style={styles.promoBand}>
    <View style={styles.promoIcon}>
      <MaterialIcons name="bolt" size={24} color={koolaColors.warm} />
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

const QuickActions: React.FC = () => {
  const actions = [
    { label: 'Siêu thị', icon: 'local-grocery-store', color: koolaColors.accent },
    { label: 'Ăn uống', icon: 'restaurant', color: koolaColors.warm },
    { label: 'Freeship', icon: 'local-shipping', color: koolaColors.primary },
    { label: 'Deal sốc', icon: 'local-offer', color: koolaColors.danger },
  ];

  return (
    <View style={styles.quickGrid}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          android_ripple={{ color: koolaColors.line }}
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
}> = ({ item, favorite, onToggleFavorite, onAdd }) => (
  <View style={styles.productCard}>
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
          color={favorite ? koolaColors.danger : koolaColors.muted}
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
        <MaterialIcons name="star" size={14} color={koolaColors.warning} />
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
          <MaterialIcons name="add" size={18} color={koolaColors.surface} />
        </Pressable>
      </View>
      <View style={styles.deliveryPill}>
        <MaterialIcons name="schedule" size={13} color={koolaColors.primary} />
        <KoolaText variant="caption" tone="primary" weight="700" numberOfLines={1}>
          {item.delivery}
        </KoolaText>
      </View>
    </View>
  </View>
);

const StoreRow: React.FC<{ store: ShoppingStore }> = ({ store }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={store.name}
    android_ripple={{ color: koolaColors.line }}
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
        <MaterialIcons name="star" size={14} color={koolaColors.warning} />
        <KoolaText variant="caption" weight="700">
          {store.rating.toFixed(1)}
        </KoolaText>
        <KoolaText variant="caption" tone="faint" numberOfLines={1}>
          {store.distance} · {store.eta}
        </KoolaText>
      </View>
    </View>
    <MaterialIcons name="chevron-right" size={22} color={koolaColors.faint} />
  </Pressable>
);

const ShoppingHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const [activeCategory, setActiveCategory] = useState('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [cartCount, setCartCount] = useState(0);

  const products = useMemo(
    () =>
      activeCategory === 'all'
        ? shoppingProducts
        : shoppingProducts.filter((product) => product.category === activeCategory),
    [activeCategory],
  );

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderHeader = () => (
    <View>
      <ShoppingHeader cartCount={cartCount} />
      <View style={styles.contentInset}>
        <PromoBand />
        <QuickActions />
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
          {shoppingCategories.map((category) => (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={category.label}
              accessibilityState={{ selected: activeCategory === category.id }}
              onPress={() => setActiveCategory(category.id)}
              style={[
                styles.categoryButton,
                activeCategory === category.id && styles.categoryButtonActive,
              ]}>
              <MaterialIcons
                name={category.icon}
                size={16}
                color={activeCategory === category.id ? koolaColors.surface : koolaColors.primary}
              />
              <KoolaText
                variant="caption"
                weight="800"
                tone={activeCategory === category.id ? 'surface' : 'muted'}
                numberOfLines={1}>
                {category.label}
              </KoolaText>
            </Pressable>
          ))}
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
          <StoreRow key={store.id} store={store} />
        ))}
      </View>
    </View>
  );

  return (
    <FlatList
      // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
      removeClippedSubviews={false}
      data={products}
      numColumns={2}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ProductCard
          item={item}
          favorite={favoriteIds.has(item.id)}
          onToggleFavorite={toggleFavorite}
          onAdd={() => setCartCount((count) => count + 1)}
        />
      )}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
      columnWrapperStyle={styles.productRow}
      contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    />
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  listContent: {},
  header: {
    backgroundColor: koolaColors.surface,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 2,
  },
  logoBlue: {
    color: koolaColors.primary,
    letterSpacing: 1.2,
  },
  logoGreen: {
    color: koolaColors.accent,
    letterSpacing: 1.2,
  },
  logoWarm: {
    color: koolaColors.warm,
    letterSpacing: 1.2,
  },
  searchBox: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: koolaColors.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  searchText: {
    flex: 1,
    fontSize: 13,
  },
  cartBadge: {
    position: 'absolute',
    right: -2,
    top: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: koolaColors.danger,
    borderWidth: 2,
    borderColor: koolaColors.surface,
  },
  contentInset: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  promoBand: {
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: koolaColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    ...koolaShadows.subtle,
  },
  promoIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: koolaColors.warningSoft,
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
    color: koolaColors.warm,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickAction: {
    flex: 1,
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: koolaColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    overflow: 'hidden',
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
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
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: koolaColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
  },
  categoryButtonActive: {
    backgroundColor: koolaColors.primary,
    borderColor: koolaColors.primary,
  },
  productRow: {
    gap: 10,
    paddingHorizontal: 12,
  },
  productCard: {
    flex: 1,
    minHeight: 276,
    marginBottom: 10,
    borderRadius: 8,
    backgroundColor: koolaColors.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
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
    borderRadius: 6,
    backgroundColor: koolaColors.ink,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  favoriteButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: koolaColors.surface,
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
    color: koolaColors.danger,
  },
  strikeText: {
    textDecorationLine: 'line-through',
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: koolaColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryPill: {
    minHeight: 26,
    borderRadius: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: koolaColors.primarySoft,
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
    borderRadius: 8,
    backgroundColor: koolaColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  storeIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeCopy: {
    flex: 1,
    gap: 3,
  },
});

export default ShoppingHomeScreen;
