import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  InteractionManager,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  AccessibilityInfo,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, {
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  KoolaBadge,
  KoolaChip,
  KoolaIconButton,
  KoolaSheet,
  KoolaSkeleton,
  KoolaText,
  koolaRadii,
  koolaDarkShadows,
  koolaShadows,
  koolaZIndex,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { prefersReducedMotion } from '../../ui/tokens/motion';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import { AVAILABILITY_LABELS } from '../../hooks/featureAvailability';
import { ChromeHeaderBox, getChromeBoxHeight } from '../../components/ChromeHeaderBox';
import { ChromeGlassSheet } from '../../components/ChromeGlassSheet';
import { HeaderDockAction, HeaderDockGhostAction } from '../../components/HeaderSearchDock';
import {
  serviceAttributeChips,
  serviceCategories,
  serviceProvinces,
  serviceProviders,
  services,
  serviceSortChips,
  type ServiceItem,
  type ServiceProvider,
  type ServiceProvince,
} from './servicesMockData';

const FILTER_BAR_H = 44;
const FILTER_BAR_Z = 11;
const CARD_GAP = 6;
const TAGS_PER_CARD = 2;

const ALL_CATEGORY_ID = 'all';
const ALL_PROVINCE: ServiceProvince = 'Toàn quốc';

type Styles = ReturnType<typeof makeStyles>;

function filterAndSortServices(
  query: string,
  province: ServiceProvince,
  activeSort: string | null,
  activeAttr: string | null,
  activeCategory: string,
): ServiceItem[] {
  let list = services.slice();
  const q = query.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.subtitle.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (province !== ALL_PROVINCE) {
    list = list.filter((s) => s.province === province);
  }
  if (activeCategory !== ALL_CATEGORY_ID) {
    list = list.filter((s) => s.category === activeCategory);
  }
  if (activeAttr) {
    list = list.filter((s) => s.tags.includes(activeAttr));
  }
  if (activeSort === 'Giá thấp') {
    list = list.slice().sort((a, b) => {
      const na = parseInt(a.price.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.price.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
  } else if (activeSort === 'Gần bạn') {
    list = list.slice().sort((a, b) => b.rating - a.rating);
  } else if (activeSort === 'Đề xuất') {
    list = list.slice().sort((a, b) => b.rating - a.rating);
  }
  return list;
}

const ServiceSubMenu: React.FC<{ activeCategory: string; onSelectCategory: (id: string) => void }> = ({ activeCategory, onSelectCategory }) => {
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const isDark = resolvedScheme === 'dark';
  const gradOrange = isDark ? '#FF9A3D' : '#FF8A1A';
  const gradBlue = isDark ? '#4D8DF7' : '#2563EB';
  const instanceId = React.useId();
  const gradId = `serviceSubMenu-${instanceId.replace(/:/g, '_')}`;
  const items = serviceCategories.filter((c) => c.id !== ALL_CATEGORY_ID);
  return (
    <View style={subMenuStyles.row}>
      {items.map((cat) => {
        const selected = activeCategory === cat.id;
        return (
          <Pressable
            key={cat.id}
            accessibilityRole="button"
            accessibilityLabel={cat.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected && cat.id !== ALL_CATEGORY_ID) onSelectCategory(ALL_CATEGORY_ID);
              else if (!selected) onSelectCategory(cat.id);
            }}
            style={subMenuStyles.item}>
            <KoolaText variant="caption" weight="700" numberOfLines={1} style={{ color: selected ? semantic.action.primary : semantic.text.muted }}>
              {cat.label}
            </KoolaText>
            {selected ? (
              <View style={subMenuStyles.underline}>
                <Svg width={20} height={2} viewBox="0 0 20 2">
                  <Defs>
                    <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={gradOrange} />
                      <Stop offset="1" stopColor={gradBlue} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="20" height="2" rx="1" fill={`url(#${gradId})`} />
                </Svg>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

const subMenuStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: FILTER_BAR_H,
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  underline: {
    position: 'absolute',
    bottom: 5,
    width: 20,
    height: 2,
    borderRadius: 1,
  },
});

// ── Filter sheet ──────────────────────────────────────────────────────────
const FilterSheet: React.FC<{
  styles: Styles;
  province: ServiceProvince;
  activeCategory: string;
  activeSort: string | null;
  activeAttr: string | null;
  hasActiveFilters: boolean;
  onSelectProvince: (p: ServiceProvince) => void;
  onToggleCategory: (id: string) => void;
  onToggleSort: (label: string) => void;
  onToggleAttr: (label: string) => void;
  onClear: () => void;
  onClose: () => void;
  bottomInset: number;
}> = ({ styles, province, activeCategory, activeSort, activeAttr, hasActiveFilters, onSelectProvince, onToggleCategory, onToggleSort, onToggleAttr, onClear, onClose, bottomInset }) => (
  <KoolaSheet snapPoints={['60%']} index={0} onClose={onClose}>
    <View style={[styles.sheetContent, { paddingBottom: bottomInset + 16 }]}>
      <View style={styles.sheetHeaderRow}>
        <KoolaText variant="heading" weight="800">Bộ lọc</KoolaText>
        {hasActiveFilters ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Xóa lọc" onPress={onClear} hitSlop={8} style={styles.sheetClearBtn}>
            <KoolaText variant="label" weight="700" tone="primary">Xóa lọc</KoolaText>
          </Pressable>
        ) : null}
      </View>

      <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Khu vực</KoolaText>
      <View style={styles.sheetChipRow}>
        {(serviceProvinces as readonly string[]).map((p) => (
          <View key={p} style={styles.sheetChipWrap}>
            <KoolaChip
              label={p}
              selected={province === p}
              onPress={() => onSelectProvince(p as ServiceProvince)}
              accessibilityLabel={p}
            />
          </View>
        ))}
      </View>

      <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Phân loại</KoolaText>
      <View style={styles.sheetChipRow}>
        {serviceCategories
          .filter((c) => c.id !== ALL_CATEGORY_ID)
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

      <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Sắp xếp</KoolaText>
      <View style={styles.sheetChipRow}>
        {(serviceSortChips as readonly string[]).map((label) => (
          <View key={label} style={styles.sheetChipWrap}>
            <KoolaChip
              label={label}
              selected={activeSort === label}
              onPress={() => onToggleSort(label)}
              accessibilityLabel={label}
            />
          </View>
        ))}
      </View>

      <KoolaText variant="label" weight="700" tone="muted" style={styles.sheetSectionTitle}>Thuộc tính</KoolaText>
      <View style={styles.sheetChipRow}>
        {(serviceAttributeChips as readonly string[]).map((label) => (
          <View key={label} style={styles.sheetChipWrap}>
            <KoolaChip
              label={label}
              selected={activeAttr === label}
              onPress={() => onToggleAttr(label)}
              accessibilityLabel={label}
            />
          </View>
        ))}
      </View>
    </View>
  </KoolaSheet>
);

const UrgentBand: React.FC<{
  semantic: SemanticTokens;
  styles: Styles;
  onComingSoon: () => void;
}> = ({ semantic, styles, onComingSoon }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Tạo yêu cầu dịch vụ"
    onPress={onComingSoon}
    hitSlop={4}
    style={({ pressed }) => [styles.urgentBand, pressed && { opacity: 0.97 }]}>
    <View style={styles.urgentBandHeader}>
      <View style={styles.urgentIcon}>
        <MaterialIcons name="flash-on" size={20} color={semantic.text.onAction} />
      </View>
      <View style={styles.urgentCopy}>
        <KoolaText variant="label" weight="800" numberOfLines={1} style={{ marginBottom: 2 }}>
          Cần hỗ trợ ngay?
        </KoolaText>
        <KoolaText variant="caption" tone="muted" numberOfLines={2}>
          Chọn dịch vụ, xem giá dự kiến và kết nối
        </KoolaText>
      </View>
    </View>
    <View style={styles.requestButtonSimple} pointerEvents="none">
      <KoolaText variant="caption" weight="800" style={{ color: semantic.action.primary }} numberOfLines={1}>
        Tạo yêu cầu
      </KoolaText>
      <MaterialIcons name="arrow-forward" size={16} color={semantic.action.primary} style={{ marginLeft: 6 }} />
    </View>
  </Pressable>
);

// ── ServiceCard: 1-col row with square thumb (mirrors Shopping ProductRow) ──
const ServiceCard: React.FC<{
  item: ServiceItem;
  semantic: SemanticTokens;
  styles: Styles;
  onOpen: () => void;
}> = React.memo(({ item, semantic, styles, onOpen }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const onImageError = useCallback(() => setImageFailed(true), []);
  const showImage = Boolean(item.image) && !imageFailed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      android_ripple={{ color: semantic.border.subtle }}
      onPress={onOpen}
      style={styles.serviceRowCard}>
      <View style={[styles.serviceThumb, { backgroundColor: `${item.accent}16` }]}>
        {showImage ? (
          <Image
            source={item.image as ImageSourcePropType}
            style={styles.serviceThumbImage}
            resizeMode="cover"
            onError={onImageError}
            accessible={false}
            importantForAccessibility="no"
          />
        ) : (
          <MaterialIcons name={item.icon as never} size={44} color={item.accent} />
        )}
        {item.badge ? (
          <View style={styles.serviceBadge}>
            <KoolaText variant="caption" weight="800" tone="surface" numberOfLines={1}>
              {item.badge}
            </KoolaText>
          </View>
        ) : null}
      </View>
      <View style={styles.serviceMeta}>
        <KoolaText variant="label" weight="800" numberOfLines={2} style={styles.serviceTitle}>
          {item.title}
        </KoolaText>
        <KoolaText variant="caption" tone="muted" numberOfLines={1} style={styles.serviceSubtitle}>
          {item.subtitle}
        </KoolaText>
        <View style={styles.serviceEtaRow} accessible accessibilityLabel={`${item.eta}, ${item.rating} sao`}>
          <MaterialIcons name="schedule" size={12} color={semantic.text.faint} style={{ marginRight: 3 }} importantForAccessibility="no" />
          <KoolaText variant="caption" tone="faint" numberOfLines={1} style={styles.serviceEtaText}>
            {item.eta}
          </KoolaText>
          <KoolaText variant="caption" tone="faint" numberOfLines={1}> · </KoolaText>
          <MaterialIcons name="star" size={12} color={semantic.status.warning} importantForAccessibility="no" />
          <KoolaText variant="caption" weight="700" numberOfLines={1} style={styles.serviceRatingText}>
            {item.rating}
          </KoolaText>
        </View>
        <View style={styles.servicePriceRow}>
          <KoolaText variant="label" weight="800" style={styles.servicePriceText} numberOfLines={1}>
            {item.price}
          </KoolaText>
          <KoolaText variant="caption" tone="faint" numberOfLines={1} style={styles.serviceJobsText}>
            {' · '}{item.jobs}
          </KoolaText>
        </View>
        <View style={styles.serviceTagRow}>
          {item.tags.slice(0, TAGS_PER_CARD).map((tag) => (
            <View key={tag} style={styles.serviceTagChip}>
              <KoolaText variant="caption" tone="muted" numberOfLines={1} style={styles.serviceTagText}>
                {tag}
              </KoolaText>
            </View>
          ))}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mở ${item.title}`}
        android_ripple={{ color: `${semantic.action.primary}1A` }}
        onPress={onOpen}
        hitSlop={8}
        style={styles.serviceRowArrowBtn}>
        <MaterialIcons name="arrow-forward" size={16} color={semantic.action.primary} />
      </Pressable>
    </Pressable>
  );
});

// ── ProviderRow: circular avatar + verified tick + rating ─────────────────
const ProviderRow: React.FC<{
  provider: ServiceProvider;
  semantic: SemanticTokens;
  styles: Styles;
  onMessage: () => void;
}> = ({ provider, semantic, styles, onMessage }) => {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const onAvatarError = useCallback(() => setAvatarFailed(true), []);
  const showAvatar = Boolean(provider.image) && !avatarFailed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={provider.name}
      android_ripple={{ color: semantic.border.subtle }}
      onPress={onMessage}
      style={styles.providerRow}>
      <View style={[styles.providerAvatarWrap, { backgroundColor: `${provider.accent}16` }]}>
        {showAvatar ? (
          <Image
            source={provider.image as ImageSourcePropType}
            style={styles.providerAvatar}
            resizeMode="cover"
            onError={onAvatarError}
            accessible={false}
            importantForAccessibility="no"
          />
        ) : (
          <MaterialIcons name={provider.icon as never} size={22} color={provider.accent} />
        )}
      </View>
      <View style={styles.providerCopy}>
        <View style={styles.providerTitleRow}>
          <KoolaText variant="label" weight="800" numberOfLines={1} style={styles.providerName}>
            {provider.name}
          </KoolaText>
          {provider.verified ? (
            <View style={[styles.verifiedBadge, { backgroundColor: semantic.status.success }]}>
              <MaterialIcons name="verified" size={12} color="#FFFFFF" />
              <KoolaText variant="caption" weight="800" tone="surface" style={styles.verifiedText} numberOfLines={1}>
                Đã xác minh
              </KoolaText>
            </View>
          ) : null}
        </View>
        <KoolaText variant="caption" tone="muted" numberOfLines={1}>
          {provider.service} · {provider.area}
        </KoolaText>
        <View style={styles.providerMeta}>
          <MaterialIcons name="star" size={12} color={semantic.status.warning} importantForAccessibility="no" />
          <KoolaText variant="caption" weight="700" numberOfLines={1} style={styles.providerRatingText}>
            {provider.rating}
          </KoolaText>
          <KoolaText variant="caption" tone="faint" numberOfLines={1}> · {provider.eta}</KoolaText>
        </View>
      </View>
      <KoolaIconButton icon="chat" size={34} iconSize={17} variant="soft" tone="primary" accessibilityLabel={`Nhắn ${provider.name}`} onPress={onMessage} />
    </Pressable>
  );
};

const ServicesHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const isDark = resolvedScheme === 'dark';
  const blockH = getChromeBoxHeight(insets.top);
  const listTopPad = blockH + FILTER_BAR_H;

  const hiddenProgress = useSharedValue(0);
  const scrolledProgress = useSharedValue(0);
  const prevOffsetY = useSharedValue(0);
  const travel = useSharedValue(0);
  const reduceMotionSV = useSharedValue(prefersReducedMotion());

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
      reduceMotionSV.value = enabled;
    });
    return () => {
      if (sub && typeof (sub as { remove?: () => void }).remove === 'function') {
        (sub as { remove: () => void }).remove();
      }
    };
  }, [reduceMotionSV]);

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const offsetY = Math.max(0, event.contentOffset.y);
      if (offsetY > 8 && scrolledProgress.value !== 1) {
        scrolledProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      } else if (offsetY <= 4 && scrolledProgress.value !== 0) {
        scrolledProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
      if (reduceMotionSV.value) {
        if (hiddenProgress.value !== 0) hiddenProgress.value = 0;
        travel.value = 0;
        prevOffsetY.value = offsetY;
        return;
      }
      if (offsetY <= 4) {
        if (hiddenProgress.value !== 0) {
          hiddenProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
        }
        travel.value = 0;
        prevOffsetY.value = offsetY;
        return;
      }
      const delta = offsetY - prevOffsetY.value;
      if (delta === 0) return;
      if ((delta > 0 && travel.value < 0) || (delta < 0 && travel.value > 0)) {
        travel.value = delta;
      } else {
        travel.value += delta;
      }
      prevOffsetY.value = offsetY;
      if (travel.value > 8 && hiddenProgress.value !== 1) {
        hiddenProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      } else if (travel.value < -20 && hiddenProgress.value !== 0) {
        hiddenProgress.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      }
    },
  });

  const filterBarVisibilityStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, hiddenProgress.value));
    const h = t * t * (3 - 2 * t);
    return {
      height: FILTER_BAR_H * (1 - h),
      opacity: 1 - h,
      transform: [{ translateY: -FILTER_BAR_H * h }],
    };
  }, []);

  const [query] = useState('');
  const [province, setProvince] = useState<ServiceProvince>(ALL_PROVINCE);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_ID);
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

  const { notify, toast } = useComingSoonToast({ bottom: tabBarInset + 16 });

  const handleComingSoon = useCallback(
    () => notify(`${AVAILABILITY_LABELS.preview} — Tính năng đang được phát triển`),
    [notify],
  );

  const filteredServices = useMemo(
    () => filterAndSortServices(query, province, activeSort, activeAttr, activeCategory),
    [query, province, activeSort, activeAttr, activeCategory],
  );

  const activeFilterCount =
    (province !== ALL_PROVINCE ? 1 : 0) + (activeSort ? 1 : 0) + (activeAttr ? 1 : 0) + (activeCategory !== ALL_CATEGORY_ID ? 1 : 0);

  const toggleSort = useCallback((label: string) => setActiveSort((prev) => (prev === label ? null : label)), []);
  const toggleAttr = useCallback((label: string) => setActiveAttr((prev) => (prev === label ? null : label)), []);
  const toggleCategory = useCallback((id: string) => setActiveCategory((prev) => (prev === id ? ALL_CATEGORY_ID : id)), []);
  const selectProvince = useCallback((p: ServiceProvince) => setProvince(p), []);
  const clearFilters = useCallback(() => {
    setProvince(ALL_PROVINCE);
    setActiveCategory(ALL_CATEGORY_ID);
    setActiveSort(null);
    setActiveAttr(null);
  }, []);
  const openFilterSheet = useCallback(() => setFilterSheetOpen(true), []);
  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);
  const handleSearchPress = useCallback(() => setFilterSheetOpen(true), []);
  const handleQrPress = useCallback(() => notify(`${AVAILABILITY_LABELS.preview} — Tính năng đang được phát triển`), [notify]);

  const headerActions = (
    <>
      <HeaderDockGhostAction icon="chat-bubble-outline" onPress={handleComingSoon} accessibilityLabel="Tin nhắn" />
      <HeaderDockGhostAction icon="notifications-none" onPress={handleComingSoon} accessibilityLabel="Thông báo" />
    </>
  );

  const renderItem = useCallback(
    ({ item }: { item: ServiceItem }) => (
      <ServiceCard item={item} semantic={semantic} styles={styles} onOpen={handleComingSoon} />
    ),
    [semantic, styles, handleComingSoon],
  );

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyWrap}>
      <MaterialIcons name="search-off" size={36} color={semantic.text.faint} />
      <KoolaText variant="label" weight="700" tone="muted" style={{ marginTop: 10 }}>Không tìm thấy dịch vụ</KoolaText>
      <KoolaText variant="caption" tone="faint" align="center" style={{ marginTop: 4 }}>Thử từ khóa khác hoặc bỏ bớt bộ lọc</KoolaText>
    </View>
  ), [semantic.text.faint, styles.emptyWrap]);

  const listHeader = useMemo(() => (
    <View style={styles.headerContent}>
      <UrgentBand semantic={semantic} styles={styles} onComingSoon={handleComingSoon} />
      <View style={styles.sectionHeader}>
        <View>
          <KoolaText variant="heading" weight="800">Dịch vụ phổ biến</KoolaText>
          <KoolaText variant="caption" tone="muted">Đặt nhanh sửa chữa, giao hàng và ăn uống</KoolaText>
        </View>
        <KoolaBadge label={`${filteredServices.length} mục`} tone="success" />
      </View>
    </View>
  ), [semantic, styles, handleComingSoon, filteredServices.length]);

  const listFooter = useMemo(() => (
    <View style={styles.footer}>
      <View style={styles.sectionHeader}>
        <View>
          <KoolaText variant="heading" weight="800">Nhà cung cấp sẵn sàng</KoolaText>
          <KoolaText variant="caption" tone="muted">Ưu tiên đối tác có xác minh và phản hồi nhanh</KoolaText>
        </View>
      </View>
      <View style={styles.providerList}>
        {serviceProviders.map((provider) => (
          <ProviderRow key={provider.id} provider={provider} semantic={semantic} styles={styles} onMessage={handleComingSoon} />
        ))}
      </View>
    </View>
  ), [semantic, styles, handleComingSoon]);

  const chrome = contentReady ? (
    <>
      <ChromeGlassSheet blockH={blockH} barH={FILTER_BAR_H} hiddenProgress={hiddenProgress} scrolledProgress={scrolledProgress} />
      <ChromeHeaderBox
        insetsTop={insets.top}
        isDark={isDark}
        contentReady={contentReady}
        withGlass={false}
        onSearchPress={handleSearchPress}
        headerActions={headerActions}
        hiddenProgress={hiddenProgress}
        rightActions={
          <>
            <HeaderDockAction icon="qr-code-scanner" onPress={handleQrPress} accessibilityLabel="Quét mã QR" accessibilityHint="Mở quét mã QR" />
            <HeaderDockAction
              icon="filter-alt"
              onPress={openFilterSheet}
              accessibilityLabel="Bộ lọc"
              accessibilityHint="Mở bộ lọc tìm kiếm"
              badgeCount={activeFilterCount}
              badgeAccessibilityText={`${activeFilterCount} bộ lọc đang áp dụng`}
            />
          </>
        }
      />
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: 'absolute', top: blockH, left: 0, right: 0, overflow: 'hidden', zIndex: FILTER_BAR_Z }, filterBarVisibilityStyle]}>
        <View style={{ height: FILTER_BAR_H }}>
          <ServiceSubMenu activeCategory={activeCategory} onSelectCategory={toggleCategory} />
        </View>
      </Animated.View>
    </>
  ) : null;

  return (
    <View style={styles.screen}>
      {!contentReady ? (
        <View style={[styles.screen, { paddingTop: listTopPad }]}>
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={FILTER_BAR_H} radius={koolaRadii.pill} style={{ marginTop: 8 }} />
          </View>
          <View style={[styles.listContent, { marginTop: 8 }]}>
            {[0, 1, 2].map((i) => (
              <KoolaSkeleton key={i} width="100%" height={99} radius={koolaRadii.md} style={{ marginTop: i === 0 ? 0 : CARD_GAP }} />
            ))}
          </View>
        </View>
      ) : (
        <Animated.FlatList
          removeClippedSubviews={false}
          data={filteredServices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={[styles.listContent, { paddingTop: listTopPad, paddingBottom: tabBarInset }]}
          showsVerticalScrollIndicator={false}
          style={styles.screenTransparent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}
      {chrome}
      {filterSheetOpen ? (
        <FilterSheet
          styles={styles}
          province={province}
          activeCategory={activeCategory}
          activeSort={activeSort}
          activeAttr={activeAttr}
          hasActiveFilters={activeFilterCount > 0}
          onSelectProvince={selectProvince}
          onToggleCategory={toggleCategory}
          onToggleSort={toggleSort}
          onToggleAttr={toggleAttr}
          onClear={clearFilters}
          onClose={closeFilterSheet}
          bottomInset={insets.bottom}
        />
      ) : null}
      {toast}
    </View>
  );
};
const makeStyles = (t: SemanticTokens, scheme: 'light' | 'dark') => {
  const cardShadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.subtle;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    screenTransparent: { flex: 1, backgroundColor: 'transparent' },
    listContent: { paddingHorizontal: 6 },
    contentInset: { paddingHorizontal: 12 },
    headerContent: { paddingHorizontal: 12, paddingTop: 8 },
    filterRow: { flexDirection: 'row', alignItems: 'center', height: FILTER_BAR_H },
    chipScroller: { flex: 1 },
    chipScrollerContent: { alignItems: 'center', paddingRight: 12 },
    rowChip: {
      height: 36,
      minHeight: 36,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface.level2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border.strong,
      marginRight: 8,
    },
    rowChipActive: { backgroundColor: t.action.primary, borderColor: t.action.primary },
    sheetContent: { paddingHorizontal: 20, paddingTop: 4 },
    sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetClearBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    sheetSectionTitle: { marginTop: 12, marginBottom: 8 },
    sheetChipRow: { flexDirection: 'row', flexWrap: 'wrap' },
    sheetChipWrap: { marginRight: 8, marginBottom: 8 },
    urgentBand: {
      borderRadius: koolaRadii.md,
      backgroundColor: t.surface.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border.subtle,
      padding: 14,
      flexDirection: 'column',
      gap: 10,
    },
    urgentBandHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    urgentIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: t.action.primary, alignItems: 'center', justifyContent: 'center' },
    urgentCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
    requestButtonSimple: { width: '100%', height: 36, borderRadius: koolaRadii.pill, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: `${t.action.primary}12` },
    sectionHeader: { marginTop: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    serviceRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: koolaRadii.md,
      backgroundColor: t.surface.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border.subtle,
      marginBottom: CARD_GAP,
      overflow: 'hidden',
      ...cardShadow,
    },
    serviceThumb: {
      alignSelf: 'stretch',
      aspectRatio: 1,
      borderTopLeftRadius: koolaRadii.md,
      borderBottomLeftRadius: koolaRadii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    serviceThumbImage: {
      width: '100%',
      height: '100%',
      borderTopLeftRadius: koolaRadii.md,
      borderBottomLeftRadius: koolaRadii.md,
    },
    serviceBadge: {
      position: 'absolute',
      left: 6,
      top: 6,
      maxWidth: 76,
      borderRadius: koolaRadii.xs,
      backgroundColor: t.text.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    serviceMeta: {
      flex: 1,
      paddingVertical: 6,
      marginLeft: 10,
      marginRight: 10,
    },
    serviceTitle: { fontSize: 12, lineHeight: 16, marginBottom: 1 },
    serviceSubtitle: { fontSize: 11, lineHeight: 14, marginBottom: 2 },
    serviceEtaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    serviceEtaText: { fontSize: 11, lineHeight: 14 },
    serviceRatingText: { fontSize: 11, lineHeight: 14, marginLeft: 2 },
    servicePriceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    servicePriceText: { fontSize: 13, lineHeight: 18, color: t.action.primary, marginRight: 4 },
    serviceJobsText: { fontSize: 11, lineHeight: 14 },
    serviceTagRow: { flexDirection: 'row', flexWrap: 'nowrap', paddingRight: 46 },
    serviceTagChip: {
      flexShrink: 1,
      borderRadius: koolaRadii.xs,
      backgroundColor: t.surface.level0,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginRight: 4,
      marginTop: 1,
    },
    serviceTagText: { fontSize: 10, lineHeight: 13 },
    serviceRowArrowBtn: {
      position: 'absolute',
      right: 10,
      bottom: 6,
      width: 30,
      height: 30,
      borderRadius: koolaRadii.sm,
      backgroundColor: `${t.action.primary}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: { paddingHorizontal: 12, paddingBottom: 12 },
    providerList: {},
    providerRow: { minHeight: 78, borderRadius: koolaRadii.md, backgroundColor: t.surface.level1, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border.subtle, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8, overflow: 'hidden', ...cardShadow },
    providerAvatarWrap: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    providerAvatar: { width: '100%', height: '100%' },
    providerCopy: { flex: 1, marginRight: 10 },
    providerTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' },
    providerName: { flexShrink: 1, marginRight: 6 },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: koolaRadii.xs, paddingHorizontal: 5, paddingVertical: 2 },
    verifiedText: { fontSize: 10, lineHeight: 12, marginLeft: 3 },
    providerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    providerRatingText: { fontSize: 11, lineHeight: 14, marginLeft: 3 },
    emptyWrap: { alignItems: 'center', paddingTop: 48, paddingBottom: 24, paddingHorizontal: 12 },
  });
};

export default ServicesHomeScreen;
