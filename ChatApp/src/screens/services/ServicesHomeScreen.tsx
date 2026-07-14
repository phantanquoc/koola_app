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
  serviceCategories,
  serviceProviders,
  services,
  type ServiceItem,
  type ServiceProvider,
} from './servicesMockData';

type Styles = ReturnType<typeof makeStyles>;

const ServicesHeader: React.FC<{
  palette: Palette;
  styles: Styles;
  onComingSoon: () => void;
}> = ({ palette, styles, onComingSoon }) => (
  <View style={styles.header}>
    <KoolaLogo showMark={false} variant="extruded" font="sora" wordmarkSize={24} style={styles.logoWrap} />
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Tìm dịch vụ"
      android_ripple={{ color: palette.line }}
      onPress={onComingSoon}
      style={styles.searchBox}>
      <MaterialIcons name="search" size={18} color={palette.muted} />
      <KoolaText tone="muted" numberOfLines={1} style={styles.searchText}>
        Tìm sửa chữa, giao hàng...
      </KoolaText>
    </Pressable>
    <View style={styles.supportWrap}>
      <KoolaIconButton
        icon="support-agent"
        variant="soft"
        tone="primary"
        size={38}
        iconSize={20}
        accessibilityLabel="Trung tâm hỗ trợ"
        onPress={onComingSoon}
      />
    </View>
  </View>
);

const UrgentBand: React.FC<{
  palette: Palette;
  styles: Styles;
  onComingSoon: () => void;
}> = ({ palette, styles, onComingSoon }) => (
  <View style={styles.urgentBand}>
    <View style={styles.urgentIcon}>
      <MaterialIcons name="flash-on" size={22} color={palette.surface} />
    </View>
    <View style={styles.urgentCopy}>
      <KoolaText variant="label" weight="800" numberOfLines={1}>
        Cần hỗ trợ ngay?
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={2}>
        Chọn dịch vụ, xem giá dự kiến và kết nối nhà cung cấp gần bạn
      </KoolaText>
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Tạo yêu cầu dịch vụ"
      onPress={onComingSoon}
      style={styles.requestButton}>
      <MaterialIcons name="add-task" size={18} color={palette.surface} />
      <KoolaText variant="caption" tone="surface" weight="800" numberOfLines={1}>
        Tạo yêu cầu
      </KoolaText>
    </Pressable>
  </View>
);

const CategoryRail: React.FC<{
  activeCategory: string;
  onChange: (category: string) => void;
  palette: Palette;
  styles: Styles;
}> = ({ activeCategory, onChange, palette, styles }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.categoryRail}>
    {serviceCategories.map((category) => {
      const selected = activeCategory === category.id;
      return (
        <Pressable
          key={category.id}
          accessibilityRole="button"
          accessibilityLabel={category.label}
          accessibilityState={{ selected }}
          onPress={() => onChange(category.id)}
          style={[styles.categoryButton, selected && styles.categoryButtonActive]}>
          <MaterialIcons
            name={category.icon}
            size={17}
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
);

const ServiceCard: React.FC<{
  item: ServiceItem;
  palette: Palette;
  styles: Styles;
  onOpen: () => void;
}> = React.memo(({ item, palette, styles, onOpen }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={item.title}
    android_ripple={{ color: palette.line }}
    onPress={onOpen}
    style={styles.serviceCard}>
    <View style={styles.serviceTop}>
      <View style={[styles.serviceIcon, { backgroundColor: `${item.accent}18` }]}>
        <MaterialIcons name={item.icon} size={26} color={item.accent} />
      </View>
      {item.badge && <KoolaBadge label={item.badge} tone="primary" />}
    </View>
    <KoolaText variant="label" weight="800" numberOfLines={2} style={styles.serviceTitle}>
      {item.title}
    </KoolaText>
    <KoolaText variant="caption" tone="muted" numberOfLines={2} style={styles.serviceSubtitle}>
      {item.subtitle}
    </KoolaText>
    <View style={styles.serviceMeta}>
      <View style={styles.metaItem}>
        <MaterialIcons name="schedule" size={14} color={palette.primary} />
        <KoolaText variant="caption" tone="primary" weight="700" numberOfLines={1}>
          {item.eta}
        </KoolaText>
      </View>
      <View style={styles.metaItem}>
        <MaterialIcons name="star" size={14} color={palette.warning} />
        <KoolaText variant="caption" weight="700">
          {item.rating.toFixed(1)}
        </KoolaText>
      </View>
    </View>
    <View style={styles.serviceBottom}>
      <View style={styles.priceCopy}>
        <KoolaText variant="label" weight="800" style={styles.priceText} numberOfLines={1}>
          {item.price}
        </KoolaText>
        <KoolaText variant="caption" tone="faint" numberOfLines={1}>
          {item.jobs}
        </KoolaText>
      </View>
      <View style={styles.nextButton}>
        <MaterialIcons name="arrow-forward" size={18} color={palette.surface} />
      </View>
    </View>
  </Pressable>
));

const ProviderRow: React.FC<{
  provider: ServiceProvider;
  palette: Palette;
  styles: Styles;
  onMessage: () => void;
}> = ({ provider, palette, styles, onMessage }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={provider.name}
    android_ripple={{ color: palette.line }}
    onPress={onMessage}
    style={styles.providerRow}>
    <View style={[styles.providerIcon, { backgroundColor: `${provider.accent}18` }]}>
      <MaterialIcons name={provider.icon} size={22} color={provider.accent} />
    </View>
    <View style={styles.providerCopy}>
      <View style={styles.providerTitleRow}>
        <KoolaText variant="label" weight="800" numberOfLines={1} style={styles.providerName}>
          {provider.name}
        </KoolaText>
        {provider.verified && (
          <MaterialIcons name="verified" size={16} color={palette.success} />
        )}
      </View>
      <KoolaText variant="caption" tone="muted" numberOfLines={1}>
        {provider.service} · {provider.area}
      </KoolaText>
      <View style={styles.providerMeta}>
        <MaterialIcons name="star" size={14} color={palette.warning} />
        <KoolaText variant="caption" weight="700">
          {provider.rating.toFixed(1)}
        </KoolaText>
        <KoolaText variant="caption" tone="faint" numberOfLines={1}>
          {provider.eta}
        </KoolaText>
      </View>
    </View>
    <KoolaIconButton
      icon="chat"
      size={34}
      iconSize={17}
      variant="soft"
      tone="primary"
      accessibilityLabel={`Nhắn ${provider.name}`}
      onPress={onMessage}
    />
  </Pressable>
);

const ServicesHomeScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const { palette, resolvedScheme } = useTheme();
  const { notify, toast } = useComingSoonToast();
  const styles = useMemo(
    () => makeStyles(palette, resolvedScheme),
    [palette, resolvedScheme],
  );
  const [activeCategory, setActiveCategory] = useState('all');

  const handleComingSoon = useCallback(() => notify(), [notify]);

  const filteredServices = useMemo(
    () =>
      activeCategory === 'all'
        ? services
        : services.filter((service) => service.category === activeCategory),
    [activeCategory],
  );

  const renderItem = useCallback(
    ({ item }: { item: ServiceItem }) => (
      <ServiceCard item={item} palette={palette} styles={styles} onOpen={handleComingSoon} />
    ),
    [palette, styles, handleComingSoon],
  );

  const renderHeader = () => (
    <View>
      <ServicesHeader palette={palette} styles={styles} onComingSoon={handleComingSoon} />
      <View style={styles.contentInset}>
        <UrgentBand palette={palette} styles={styles} onComingSoon={handleComingSoon} />
        <View style={styles.sectionHeader}>
          <View>
            <KoolaText variant="heading" weight="800">
              Dịch vụ phổ biến
            </KoolaText>
            <KoolaText variant="caption" tone="muted">
              Đặt nhanh sửa chữa, giao hàng và ăn uống
            </KoolaText>
          </View>
          <KoolaBadge label={`${filteredServices.length} mục`} tone="success" />
        </View>
        <CategoryRail
          activeCategory={activeCategory}
          onChange={setActiveCategory}
          palette={palette}
          styles={styles}
        />
      </View>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footer}>
      <View style={styles.sectionHeader}>
        <View>
          <KoolaText variant="heading" weight="800">
            Nhà cung cấp sẵn sàng
          </KoolaText>
          <KoolaText variant="caption" tone="muted">
            Ưu tiên đối tác có xác minh và phản hồi nhanh
          </KoolaText>
        </View>
      </View>
      <View style={styles.providerList}>
        {serviceProviders.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            palette={palette}
            styles={styles}
            onMessage={handleComingSoon}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
        removeClippedSubviews={false}
        data={filteredServices}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        columnWrapperStyle={styles.cardRow}
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
    supportWrap: {
      flexShrink: 0,
    },
    contentInset: {
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    urgentBand: {
      minHeight: 92,
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      ...bandShadow,
    },
    urgentIcon: {
      width: 44,
      height: 44,
      borderRadius: koolaRadii.sm,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    urgentCopy: {
      flex: 1,
      gap: 2,
    },
    requestButton: {
      minHeight: 36,
      maxWidth: 116,
      borderRadius: koolaRadii.sm,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: p.accent,
    },
    sectionHeader: {
      marginTop: 18,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
    },
    categoryRail: {
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
    cardRow: {
      gap: 10,
      paddingHorizontal: 12,
    },
    serviceCard: {
      flex: 1,
      minHeight: 226,
      marginBottom: 10,
      borderRadius: koolaRadii.md,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      padding: 10,
      gap: 8,
      overflow: 'hidden',
    },
    serviceTop: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    serviceIcon: {
      width: 42,
      height: 42,
      borderRadius: koolaRadii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    serviceTitle: {
      minHeight: 40,
    },
    serviceSubtitle: {
      minHeight: 32,
    },
    serviceMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    serviceBottom: {
      marginTop: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    priceCopy: {
      flex: 1,
    },
    priceText: {
      color: p.primary,
    },
    nextButton: {
      width: 34,
      height: 34,
      borderRadius: koolaRadii.sm,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    providerList: {
      gap: 8,
    },
    providerRow: {
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
    providerIcon: {
      width: 44,
      height: 44,
      borderRadius: koolaRadii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    providerCopy: {
      flex: 1,
      gap: 3,
    },
    providerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    providerName: {
      flexShrink: 1,
    },
    providerMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
  });
};

export default ServicesHomeScreen;
