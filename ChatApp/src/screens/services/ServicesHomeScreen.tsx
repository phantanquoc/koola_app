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
import { NOTCH_HEADER_CONTENT_H, NOTCH_WING_INSET } from '../../components/NotchHeader';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import { AVAILABILITY_LABELS } from '../../hooks/featureAvailability';
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

const DOCK_GAP_TOP = 4;
const DOCK_H = 40;
const DOCK_GAP_BOTTOM = 8;
const FILTER_ROW_H = 44;
const FILTER_ROW_H_COLLAPSED = 40;
const FILTER_ROW_GAP_BOTTOM = 12;
const FILTER_ROW_GAP_COLLAPSED = 8;
const DOCK_HIDE_THRESHOLD = 120;
const DOCK_HIDE_MID = DOCK_HIDE_THRESHOLD / 2;
const DOCK_SLIDE = DOCK_H + DOCK_GAP_BOTTOM;
const CARD_GAP = 6;
const TAGS_PER_CARD = 2;
const CHROME_RESERVE =
  DOCK_GAP_TOP + DOCK_H + DOCK_GAP_BOTTOM + FILTER_ROW_H + FILTER_ROW_GAP_BOTTOM;

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

// ── Search dock ───────────────────────────────────────────────────────────
const ServicesSearchDock: React.FC<{
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
          placeholder="Tìm sửa chữa, giao hàng..."
          placeholderTextColor={semantic.text.faint}
          style={[dockStyles.searchInput, { color: semantic.text.primary }]}
          returnKeyType="search"
          underlineColorAndroid="transparent"
          accessibilityLabel="Tìm sửa chữa"
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
            activeFilterCount > 0 ? `Lọc, ${activeFilterCount} bộ lọc đang áp dụng` : 'Lọc dịch vụ'
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
  searchIcon: { marginRight: 6 },
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
  filterBadgeText: { fontSize: 10, lineHeight: 12 },
});

// ── Filter row ────────────────────────────────────────────────────────────
const FilterRow: React.FC<{
  semantic: SemanticTokens;
  styles: Styles;
  province: ServiceProvince;
  onPressProvince: () => void;
  activeSort: string | null;
  activeAttr: string | null;
  onToggleSort: (label: string) => void;
  onToggleAttr: (label: string) => void;
}> = ({ semantic, styles, province, onPressProvince, activeSort, activeAttr, onToggleSort, onToggleAttr }) => (
  <View style={styles.filterRow}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroller}
      contentContainerStyle={styles.chipScrollerContent}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tỉnh: ${province}`}
        onPress={onPressProvince}
        hitSlop={4}
        style={[styles.rowChip, province !== ALL_PROVINCE && styles.rowChipActive]}>
        <MaterialIcons
          name="location-on"
          size={14}
          color={province !== ALL_PROVINCE ? '#FFFFFF' : semantic.action.primary}
          style={{ marginRight: 4 }}
        />
        <KoolaText
          variant="caption"
          weight="800"
          tone={province !== ALL_PROVINCE ? 'surface' : 'muted'}
          numberOfLines={1}>
          {province}
        </KoolaText>
      </Pressable>
      {([...serviceSortChips] as string[]).map((label) => {
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
            <KoolaText variant="caption" weight="800" tone={selected ? 'surface' : 'muted'} numberOfLines={1}>
              {label}
            </KoolaText>
          </Pressable>
        );
      })}
      {([...serviceAttributeChips] as string[]).map((label) => {
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
            <KoolaText variant="caption" weight="800" tone={selected ? 'surface' : 'muted'} numberOfLines={1}>
              {label}
            </KoolaText>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);

// ── Filter sheet ──────────────────────────────────────────────────────────
const FilterSheet: React.FC<{
  styles: Styles;
  province: ServiceProvince;
  activeCategory: string;
  hasActiveFilters: boolean;
  onSelectProvince: (p: ServiceProvince) => void;
  onToggleCategory: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  bottomInset: number;
}> = ({ styles, province, activeCategory, hasActiveFilters, onSelectProvince, onToggleCategory, onClear, onClose, bottomInset }) => (
  <KoolaSheet snapPoints={['50%']} index={0} onClose={onClose}>
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
  const { notify, toast } = useComingSoonToast({ bottom: tabBarInset + 16 });
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const notchPad = insets.top + NOTCH_WING_INSET + NOTCH_HEADER_CONTENT_H + 4;
  const overlayTop = notchPad;
  const listTopPad = notchPad + CHROME_RESERVE;

  const appliedOffset = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<ServiceItem>>(null);
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
  const dockTranslateY = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [0, -DOCK_SLIDE], extrapolate: 'clamp' });
  const dockOpacity = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_MID, DOCK_HIDE_THRESHOLD], outputRange: [1, 0.5, 0], extrapolate: 'clamp' });
  const filterTranslateY = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [0, -DOCK_SLIDE], extrapolate: 'clamp' });
  const filterRowHeight = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [FILTER_ROW_H, FILTER_ROW_H_COLLAPSED], extrapolate: 'clamp' });
  const filterRowGapHeight = appliedOffset.interpolate({ inputRange: [0, DOCK_HIDE_THRESHOLD], outputRange: [FILTER_ROW_GAP_BOTTOM, FILTER_ROW_GAP_COLLAPSED], extrapolate: 'clamp' });

  const snapToNearestDetent = useCallback(() => {
    if (dockFocusedRef.current) {
      Animated.timing(appliedOffset, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      rawOffsetRef.current = 0;
      travelRef.current = 0;
      directionRef.current = -1;
      return;
    }
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

  return (
    <View style={styles.screen}>
      {!contentReady ? (
        <View style={[styles.screen, { paddingTop: overlayTop }]}>
          <View style={styles.contentInset}>
            <KoolaSkeleton width="100%" height={DOCK_H} radius={koolaRadii.pill} />
            <View style={{ flexDirection: 'row', marginTop: DOCK_GAP_BOTTOM, alignItems: 'center' }}>
              <KoolaSkeleton width={110} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={92} height={FILTER_ROW_H} radius={koolaRadii.pill} style={{ marginRight: 8 }} />
              <KoolaSkeleton width={84} height={FILTER_ROW_H} radius={koolaRadii.pill} />
            </View>
          </View>
          <View style={[styles.listContent, { marginTop: FILTER_ROW_GAP_BOTTOM }]}>
            {[0, 1, 2].map((i) => (
              <KoolaSkeleton key={i} width="100%" height={99} radius={koolaRadii.md} style={{ marginTop: i === 0 ? 0 : CARD_GAP }} />
            ))}
          </View>
        </View>
      ) : (
        <Animated.FlatList
          ref={flatListRef}
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
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        />
      )}
      {contentReady ? (
        <View style={[styles.overlayChrome, { top: overlayTop }]} pointerEvents="box-none">
          <View style={styles.contentInset} pointerEvents="box-none">
            <Animated.View pointerEvents={dockHidden ? 'none' : 'auto'} style={{ transform: [{ translateY: dockTranslateY }], opacity: dockOpacity }}>
              <ServicesSearchDock
                semantic={semantic}
                value={query}
                onChangeText={setQuery}
                activeFilterCount={activeFilterCount}
                onOpenFilters={openFilterSheet}
                onFocusChange={handleFocusChange}
              />
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: filterTranslateY }], height: filterRowHeight, marginTop: DOCK_GAP_BOTTOM, overflow: 'hidden' }}>
              <View style={{ height: FILTER_ROW_H }}>
                <FilterRow
                  semantic={semantic}
                  styles={styles}
                  province={province}
                  onPressProvince={openFilterSheet}
                  activeSort={activeSort}
                  activeAttr={activeAttr}
                  onToggleSort={toggleSort}
                  onToggleAttr={toggleAttr}
                />
              </View>
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: filterTranslateY }], height: filterRowGapHeight }} />
          </View>
        </View>
      ) : null}
      {filterSheetOpen ? (
        <FilterSheet
          styles={styles}
          province={province}
          activeCategory={activeCategory}
          hasActiveFilters={activeFilterCount > 0}
          onSelectProvince={selectProvince}
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
const makeStyles = (t: SemanticTokens, scheme: 'light' | 'dark') => {
  const cardShadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.subtle;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    screenTransparent: { flex: 1, backgroundColor: 'transparent' },
    listContent: { paddingHorizontal: 6 },
    contentInset: { paddingHorizontal: 12 },
    overlayChrome: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingTop: DOCK_GAP_TOP,
      zIndex: koolaZIndex.sticky,
    },
    headerContent: { paddingHorizontal: 12, paddingTop: 8 },
    filterRow: { flexDirection: 'row', alignItems: 'center', height: FILTER_ROW_H },
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
    // ── Service row card (1-col, mirrors Shopping productRowCard) ──
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
