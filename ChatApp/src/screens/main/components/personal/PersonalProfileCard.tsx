import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../../../../components/UserAvatar';
import { KoolaText, koolaOpacity, koolaRadii, koolaSpacing, useTheme } from '../../../../ui';
import type { SemanticTokens } from '../../../../ui/tokens/semantic';
import { PersonalCard } from './PersonalCard';
import { PERSONAL_UPGRADE_GRADIENT } from './personalTokens';

export interface PersonalProfileCardProps {
  displayName: string;
  avatar?: string;
  accountType?: 'personal' | 'business';
  onEdit: () => void;
  onSwitchAccount: () => void;
  onUpgradeBusiness?: () => void;
  tierLabel?: string;
}

const AVATAR_SIZE = 70;

export const PersonalProfileCard: React.FC<PersonalProfileCardProps> = ({
  displayName,
  avatar,
  accountType = 'personal',
  onEdit,
  onSwitchAccount,
  onUpgradeBusiness,
  tierLabel = 'Titan',
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);
  const [gradFrom, gradTo] = PERSONAL_UPGRADE_GRADIENT[resolvedScheme];
  return (
    <PersonalCard style={styles.outer}>
      {/* Top section: avatar left, name + tier/switch stacked right */}
      <View style={styles.topSection}>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Chỉnh sửa hồ sơ" style={({ pressed }) => [pressed && styles.pressed]}>
          <UserAvatar displayName={displayName} avatar={avatar} size={AVATAR_SIZE} />
        </Pressable>
        <View style={styles.infoColumn}>
          {/* Name + account-type badge */}
          <View style={styles.nameRow}>
            <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Chỉnh sửa hồ sơ" style={({ pressed }) => [pressed && styles.pressed]}>
              <KoolaText variant="heading" weight="800" numberOfLines={2} ellipsizeMode="tail" style={styles.name}>{displayName}</KoolaText>
            </Pressable>
            <View
              style={[styles.accountBadge, accountType === 'business' ? styles.accountBadgeBusiness : styles.accountBadgePersonal]}
              accessibilityRole="image"
              accessibilityLabel={accountType === 'business' ? 'Tài khoản doanh nghiệp' : 'Tài khoản cá nhân'}>
              <MaterialIcons
                name={accountType === 'business' ? 'storefront' : 'person'}
                size={12}
                color={accountType === 'business' ? tokens.semantic.text.onAction : tokens.semantic.text.muted}
              />
            </View>
          </View>
          {/* Tier + Tài khoản — single row, equal accent pills */}
          <View style={styles.row2}>
            <View style={styles.tierPill}>
              <View style={styles.tierIconWrap}><MaterialIcons name="workspace-premium" size={12} color={tokens.semantic.text.muted} /></View>
              <KoolaText variant="label" weight="700" style={styles.tierPillText} numberOfLines={1}>{tierLabel}</KoolaText>
            </View>
            {/* Shrink lives on the Pressable — it is the flex child of row2, so Yoga
                can only shrink the pill if the shrink is declared here, not on the inner View. */}
            <Pressable onPress={onSwitchAccount} hitSlop={8} accessibilityRole="button" accessibilityLabel="Chuyển tài khoản" style={({ pressed }) => [styles.switchPressable, pressed && styles.pressed]}>
              <View style={styles.switchBtn}>
                <MaterialIcons name="swap-horiz" size={14} color={tokens.semantic.text.muted} style={styles.switchIcon} />
                <KoolaText variant="label" weight="700" numberOfLines={1} style={styles.switchLabel}>Chuyển tài khoản</KoolaText>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
      {/* Upgrade banner: gradient bg + icon well + two-line copy + CTA pill */}
      <Pressable onPress={onUpgradeBusiness} accessibilityRole="button" accessibilityLabel="Nâng cấp tài khoản doanh nghiệp" style={({ pressed }) => [styles.upgradePressable, pressed && styles.pressed]}>
        {/* Banner layout lives on this inner View, not on the Pressable. */}
        <View style={styles.upgradeBanner}>
          {/* Gradient layer is padding-free so absoluteFill reaches the card edges; content padding lives on the row below. */}
          <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject} width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <SvgLinearGradient id="personalUpgradeFill" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={gradFrom} />
                <Stop offset="1" stopColor={gradTo} />
              </SvgLinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#personalUpgradeFill)" />
          </Svg>
          <View style={styles.upgradeBannerContent}>
            <View style={styles.upgradeIconCircle}>
              <MaterialIcons name="rocket-launch" size={13} color={tokens.semantic.action.primary} />
            </View>
            <View style={styles.upgradeTextCol}>
              <KoolaText variant="label" weight="600" numberOfLines={1} style={styles.upgradeSubLarge}>Mở rộng quản lý & bảo mật</KoolaText>
            </View>
            <View style={styles.ctaPill}>
              <KoolaText variant="label" weight="600" numberOfLines={1} style={styles.ctaLabel}>Nâng cấp</KoolaText>
              <MaterialIcons name="chevron-right" size={14} color={tokens.semantic.text.onAction} />
            </View>
          </View>
        </View>
      </Pressable>
    </PersonalCard>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    outer: { padding: 0, overflow: 'hidden' },
    topSection: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: koolaSpacing.lg, paddingTop: koolaSpacing.lg, paddingBottom: 0 },
    infoColumn: { flex: 1, minWidth: 0, marginLeft: koolaSpacing.sm, justifyContent: 'center' },
    pressed: { opacity: koolaOpacity.pressed },
    name: { textTransform: 'uppercase', letterSpacing: 0.15 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.sm, flexShrink: 1 },
    accountBadge: { width: 20, height: 20, borderRadius: koolaRadii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
    accountBadgePersonal: { backgroundColor: semantic.surface.level0, borderColor: semantic.border.subtle },
    accountBadgeBusiness: { backgroundColor: semantic.action.primary, borderColor: semantic.action.primary },
    // Note: row2 has a flexShrink:1 child (switchPressable) below, so per ui-dna.md:311
    // it uses marginRight on the non-shrinking sibling instead of `gap`.
    row2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: koolaSpacing.sm, minWidth: 0, width: '100%' as const },
    tierPill: { flexShrink: 0, marginRight: koolaSpacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: koolaSpacing.xs, height: 30, paddingHorizontal: koolaSpacing.md, borderRadius: koolaRadii.pill, backgroundColor: scheme === 'light' ? semantic.surface.level1 : semantic.surface.level2, borderWidth: 1, borderColor: scheme === 'light' ? semantic.border.subtle : 'rgba(255,255,255,0.10)' },
    tierIconWrap: { width: 18, height: 18, borderRadius: koolaRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: scheme === 'light' ? semantic.surface.level0 : 'rgba(255,255,255,0.08)' },
    tierPillText: { color: semantic.text.primary },
    // switchPressable is the actual flex child of row2 — shrink must live here (not just on the
    // inner switchBtn View) or Yoga measures the Pressable at its natural content width and it
    // overflows row2 at larger font scales.
    switchPressable: { flexShrink: 1, minWidth: 0 },
    // Inner View has its own flexShrink:1/minWidth:0 chain + gap→margin (ui-dna.md:311) so the
    // icon (flexShrink:0) stays fixed-size and the label is the only thing that shrinks/ellipsizes.
    switchBtn: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 30, paddingHorizontal: koolaSpacing.md, borderRadius: koolaRadii.pill, backgroundColor: scheme === 'light' ? semantic.surface.level1 : semantic.surface.level2, borderWidth: 1, borderColor: scheme === 'light' ? semantic.border.subtle : 'rgba(255,255,255,0.10)' },
    switchIcon: { flexShrink: 0, marginRight: koolaSpacing.sm - 2 },
    switchLabel: { color: semantic.text.primary, flexShrink: 1, minWidth: 0 },
    editBtnSlot: { marginHorizontal: koolaSpacing.lg, marginTop: koolaSpacing.md, marginBottom: koolaSpacing.sm },
    editBtn: { height: 38, borderRadius: koolaRadii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: koolaSpacing.sm - 2, backgroundColor: scheme === 'light' ? semantic.surface.level1 : semantic.surface.level2, borderWidth: 1, borderColor: scheme === 'light' ? semantic.border.subtle : 'rgba(255,255,255,0.10)', paddingHorizontal: koolaSpacing.md },
    editBtnLabel: { color: semantic.text.primary },
    upgradePressable: { alignSelf: 'stretch', width: '100%' },
    upgradeBanner: { width: '100%', alignSelf: 'stretch', minHeight: 52, overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: scheme === 'light' ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.06)' },
    upgradeBannerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: koolaSpacing.lg, paddingVertical: koolaSpacing.sm, gap: koolaSpacing.sm, width: '100%' },
    upgradeIconCircle: { flexShrink: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.surface.level1, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(37,99,235,0.12)', shadowColor: semantic.action.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
    upgradeTextCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
    upgradeSubLarge: { color: semantic.text.primary },
    ctaPill: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 0, backgroundColor: semantic.action.primary, borderRadius: koolaRadii.pill, paddingLeft: koolaSpacing.md, paddingRight: koolaSpacing.sm, paddingVertical: koolaSpacing.sm, shadowColor: semantic.action.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 2 },
    ctaLabel: { color: semantic.text.onAction, marginRight: 2 },
  });
}
