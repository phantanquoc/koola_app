import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaOpacity, koolaRadii, koolaSpacing, useTheme } from '../../ui';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import {
  COMPARE_FEATURES,
  UPGRADE_TIERS,
  formatPrice,
  type TierId,
  type UpgradeTier,
} from './upgradeTiers';


const NOTCH_TAB_DROP = 30;
const NOTCH_WING_INSET = 4;
const HEADER_CONTENT_HEIGHT = 36;

export { UPGRADE_TIERS, COMPARE_FEATURES, formatPrice };
export type { TierId, UpgradeTier };

const UpgradeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { resolvedScheme, tokens } = useTheme();
  const semantic = tokens.semantic;
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const isDark = resolvedScheme === 'dark';
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedId, setSelectedId] = useState<TierId>('pro');

  const headerPadTop = insets.top + NOTCH_WING_INSET + NOTCH_TAB_DROP + 4;
  const scrollPadBottom = tabBarInset + koolaSpacing.lg;

  return (
    <View style={styles.root}>

      {/* Header row — back + title overlay inside notch area */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: insets.top + NOTCH_WING_INSET + 6, height: insets.top + NOTCH_WING_INSET + NOTCH_TAB_DROP + 2 },
        ]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={({ pressed }) => [styles.headerBack, pressed && { opacity: koolaOpacity.pressed }]}>
          <MaterialIcons name="chevron-left" size={26} color={semantic.text.primary} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: headerPadTop + 6, paddingBottom: scrollPadBottom },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Billing toggle */}
        <View style={styles.hero}>
          <View
            style={[
              styles.billingPill,
              {
                backgroundColor: isDark ? semantic.surface.level2 : '#FFFFFF',
                borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E5EAF1',
              },
            ]}>
            <Pressable
              onPress={() => setBilling('monthly')}
              accessibilityRole="button"
              accessibilityLabel="Thanh toán theo tháng"
              accessibilityState={{ selected: billing === 'monthly' }}
              style={[
                styles.billingOption,
                billing === 'monthly' && { backgroundColor: semantic.action.primary, borderRadius: koolaRadii.pill },
              ]}>
              <KoolaText
                variant="label"
                weight="600"
                style={{ color: billing === 'monthly' ? '#FFFFFF' : semantic.text.primary, fontSize: 13 }}>
                Tháng
              </KoolaText>
            </Pressable>
            <Pressable
              onPress={() => setBilling('yearly')}
              accessibilityRole="button"
              accessibilityLabel="Thanh toán theo năm, tiết kiệm 17 phần trăm"
              accessibilityState={{ selected: billing === 'yearly' }}
              style={[
                styles.billingOptionYearly,
                billing === 'yearly' && { backgroundColor: semantic.action.primary, borderRadius: koolaRadii.pill },
              ]}>
              <KoolaText
                variant="label"
                weight="600"
                style={{ color: billing === 'yearly' ? '#FFFFFF' : semantic.text.primary, fontSize: 13 }}>
                Năm
              </KoolaText>
              <View style={[styles.saveBadge, { backgroundColor: billing === 'yearly' ? 'rgba(255,255,255,0.22)' : isDark ? 'rgba(16,185,129,0.16)' : '#DCFCE7' }]}>
                <KoolaText variant="caption" weight="700" style={{ color: billing === 'yearly' ? '#FFFFFF' : '#059669', fontSize: 10 }}>
                  -17%
                </KoolaText>
              </View>
            </Pressable>
          </View>
          {billing === 'yearly' ? (
            <KoolaText variant="caption" style={{ color: semantic.text.faint, marginTop: 6, textAlign: 'center' }}>
              Tiết kiệm 2 tháng — trả 10 tháng cho 12 tháng sử dụng.
            </KoolaText>
          ) : null}
        </View>

        {/* Tier cards */}
        <View style={styles.cardsStack}>
          {UPGRADE_TIERS.map((tier) => {
            const isSelected = tier.id === selectedId;
            const isFree = tier.priceMonthly === 0;
            const price = billing === 'yearly' ? tier.priceYearly : tier.priceMonthly;
            const priceLabel = isFree ? 'Miễn phí' : formatPrice(price);
            const perLabel = isFree ? '' : billing === 'yearly' ? '/năm' : '/tháng';
            const accentColors = (() => {
              if (tier.id === 'ultra' && tier.gradientDark && isDark) return tier.gradientDark;
              return tier.gradient;
            })();
            const cardBg = isDark ? semantic.surface.level1 : '#FFFFFF';
            const borderColor = isSelected ? semantic.action.primary : isDark ? 'rgba(255,255,255,0.08)' : '#E5EAF1';

            return (
              <Pressable
                key={tier.id}
                onPress={() => setSelectedId(tier.id)}
                accessibilityRole="button"
                accessibilityLabel={`Chọn gói ${tier.name}, ${priceLabel}${perLabel}`}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.cardPressable,
                  pressed && { opacity: 0.96 },
                  isSelected && { transform: [{ scale: 1.01 }] },
                ]}>
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: cardBg,
                      borderColor,
                      borderWidth: isSelected ? 2 : 1,
                      paddingTop: tier.popular ? koolaSpacing.lg + 14 : koolaSpacing.lg + 2,
                    },
                    isSelected && (isDark ? styles.cardSelectedDark : styles.cardSelectedLight),
                  ]}>
                  {/* Top accent bar */}
                  <View style={styles.accentBarWrap} pointerEvents="none">
                    <Svg width="100%" height={4} style={styles.accentBarSvg} preserveAspectRatio="none">
                      <Defs>
                        <SvgLinearGradient id={`accent-${tier.id}`} x1="0" y1="0" x2="1" y2="0">
                          <Stop offset="0" stopColor={accentColors[0]} />
                          <Stop offset="1" stopColor={accentColors[1]} />
                        </SvgLinearGradient>
                      </Defs>
                      <Rect width="100%" height="100%" rx={2} fill={`url(#accent-${tier.id})`} />
                    </Svg>
                  </View>

                  {/* Popular badge — centered at top */}
                  {tier.popular ? (
                    <View style={styles.popularBadgeWrap} pointerEvents="none">
                      <View style={[styles.popularBadge, { backgroundColor: semantic.action.primary }]}>
                        <KoolaText variant="caption" weight="700" style={{ color: '#FFFFFF', fontSize: 10 }}>
                          {tier.badge}
                        </KoolaText>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.cardHeader}>
                    <View style={[styles.iconWell, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
                      <MaterialIcons name={tier.icon as never} size={22} color={isSelected ? semantic.action.primary : semantic.text.muted} />
                    </View>
                    <View style={styles.cardTitleCol}>
                      <View style={styles.cardNameRow}>
                        <KoolaText variant="label" weight="800" style={{ color: semantic.text.primary }}>
                          {tier.name}
                        </KoolaText>
                        {!tier.popular && tier.badge ? (
                          <View style={[styles.miniBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#EEF2FF', borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#C7D2FE' }]}>
                            <KoolaText variant="caption" weight="700" style={{ color: semantic.text.primary, fontSize: 10 }}>
                              {tier.badge}
                            </KoolaText>
                          </View>
                        ) : null}
                      </View>
                      <KoolaText variant="caption" style={{ color: semantic.text.muted, marginTop: 2 }}>
                        {tier.subtitle}
                      </KoolaText>
                    </View>
                    {isSelected ? (
                      <View style={[styles.checkCircle, { backgroundColor: semantic.action.primary }]}>
                        <MaterialIcons name="check" size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={[styles.checkCircleEmpty, { borderColor: semantic.border.subtle }]} />
                    )}
                  </View>

                  <View style={styles.priceRow}>
                    <KoolaText variant="title" weight="800" style={{ color: semantic.text.primary }}>
                      {priceLabel}
                    </KoolaText>
                    {perLabel ? (
                      <KoolaText variant="caption" style={{ color: semantic.text.muted, marginLeft: 4, marginTop: 6 }}>
                        {perLabel}
                      </KoolaText>
                    ) : null}
                  </View>
                  {!isFree && billing === 'monthly' ? (
                    <KoolaText variant="caption" style={{ color: semantic.text.faint, marginTop: 2 }}>
                      {formatPrice(tier.priceYearly)}/năm khi trả theo năm
                    </KoolaText>
                  ) : null}

                  <View style={[styles.divider, { backgroundColor: semantic.border.subtle }]} />

                  <View style={styles.featureList}>
                    {tier.features.map((f) => (
                      <View key={f} style={styles.featureRow}>
                        <MaterialIcons name="check-circle" size={18} color={isSelected ? semantic.action.primary : semantic.text.faint} />
                        <KoolaText variant="caption" style={{ color: semantic.text.primary, flex: 1, marginLeft: 8, lineHeight: 18 }}>
                          {f}
                        </KoolaText>
                      </View>
                    ))}
                  </View>

                  <View
                    style={[
                      styles.cardCta,
                      isSelected
                        ? { backgroundColor: semantic.action.primary }
                        : { backgroundColor: isDark ? semantic.surface.level2 : '#F8FAFC', borderWidth: 1, borderColor: semantic.border.subtle },
                    ]}>
                    <KoolaText variant="label" weight="700" style={{ color: isSelected ? '#FFFFFF' : semantic.text.primary, fontSize: 13 }}>
                      {tier.cta}
                    </KoolaText>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Compare table */}
        <View style={[styles.compareCard, { backgroundColor: isDark ? semantic.surface.level1 : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5EAF1' }]}>
          <KoolaText variant="label" weight="700" style={{ color: semantic.text.primary, marginBottom: koolaSpacing.md }}>
            So sánh nhanh
          </KoolaText>
          <View style={[styles.compareHeaderRow, { borderBottomColor: semantic.border.subtle }]}>
            <KoolaText variant="caption" weight="600" style={[styles.compareLabelCell, { color: semantic.text.muted }]}>
              Tính năng
            </KoolaText>
            {UPGRADE_TIERS.map((t) => (
              <KoolaText key={t.id} variant="caption" weight="700" style={[styles.compareTierCell, { color: semantic.text.primary }]}>
                {t.name}
              </KoolaText>
            ))}
          </View>
          {COMPARE_FEATURES.map((row) => (
            <View key={row.label} style={[styles.compareRow, { borderBottomColor: semantic.border.subtle }]}>
              <KoolaText variant="caption" style={[styles.compareLabelCell, { color: semantic.text.primary }]}>
                {row.label}
              </KoolaText>
              {(UPGRADE_TIERS.map((t) => t.id) as TierId[]).map((tid) => {
                const val = row.values[tid];
                const isBool = typeof val === 'boolean';
                return (
                  <View key={tid} style={styles.compareTierCell}>
                    {isBool ? (
                      val ? (
                        <MaterialIcons name="check-circle" size={16} color={semantic.status.success} />
                      ) : (
                        <MaterialIcons name="close" size={16} color={semantic.text.faint} />
                      )
                    ) : (
                      <KoolaText variant="caption" weight="600" style={{ color: semantic.text.primary, textAlign: 'center', fontSize: 11 }}>
                        {String(val)}
                      </KoolaText>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

      </ScrollView>

    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  headerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: koolaSpacing.md,
  },
  headerBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  contentContainer: { flexGrow: 1, paddingHorizontal: koolaSpacing.lg, gap: koolaSpacing.lg },
  hero: { alignItems: 'center', paddingTop: 0 },
  heroTitle: { textAlign: 'center', fontSize: 22, lineHeight: 28 },
  heroSubtitle: { textAlign: 'center', marginTop: 6, paddingHorizontal: koolaSpacing.lg },
  billingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    borderRadius: koolaRadii.pill,
    borderWidth: 1,
    padding: 4,
    gap: 2,
  },
  billingOption: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: koolaRadii.pill, alignItems: 'center', justifyContent: 'center' },
  billingOptionYearly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: koolaRadii.pill,
  },
  saveBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: koolaRadii.pill },
  cardsStack: { gap: koolaSpacing.md, marginTop: koolaSpacing.sm },
  cardPressable: {},
  card: {
    borderRadius: koolaRadii.lg,
    padding: koolaSpacing.lg,
    paddingTop: koolaSpacing.lg + 2,
    overflow: 'hidden',
  },
  cardSelectedLight: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  cardSelectedDark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  accentBarWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, overflow: 'hidden', borderTopLeftRadius: koolaRadii.lg, borderTopRightRadius: koolaRadii.lg },
  accentBarSvg: { width: '100%', height: 4 },
  popularBadgeWrap: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 1 },
  popularBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: koolaRadii.pill },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  iconWell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitleCol: { flex: 1, minWidth: 0 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: koolaRadii.pill, borderWidth: 1 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkCircleEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: koolaSpacing.md },
  divider: { height: StyleSheet.hairlineWidth, marginTop: koolaSpacing.md, marginBottom: koolaSpacing.md },
  featureList: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center' },
  cardCta: { marginTop: koolaSpacing.md, height: 40, borderRadius: koolaRadii.md, alignItems: 'center', justifyContent: 'center' },
  compareCard: { borderRadius: koolaRadii.lg, borderWidth: 1, padding: koolaSpacing.lg, marginTop: koolaSpacing.md },
  compareHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  compareLabelCell: { flex: 1.2, minWidth: 0 },
  compareTierCell: { flex: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },

});

export default UpgradeScreen;
