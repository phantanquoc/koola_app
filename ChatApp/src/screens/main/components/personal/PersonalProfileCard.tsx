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

export interface PersonalProfileCardProps {
  displayName: string;
  avatar?: string;
  onEdit: () => void;
  onSwitchAccount: () => void;
  onUpgradeBusiness?: () => void;
  tierLabel?: string;
}

const AVATAR_SIZE = 70;

/** Horizontal banner gradient stops per scheme (Figma `#EDF0FF → #DEE4F5`). */
const UPGRADE_GRADIENT_STOPS: Record<'light' | 'dark', [string, string]> = {
  light: ['#EDF0FF', '#DEE4F5'],
  dark: ['#252B33', '#2B323D'],
};

export const PersonalProfileCard: React.FC<PersonalProfileCardProps> = ({
  displayName,
  avatar,
  onEdit,
  onSwitchAccount,
  onUpgradeBusiness,
  tierLabel = 'Hạng Titan',
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);
  const [gradFrom, gradTo] = UPGRADE_GRADIENT_STOPS[resolvedScheme];
  return (
    <PersonalCard style={styles.outer}>
      {/* Top section: avatar left, name + tier/switch stacked right */}
      <View style={styles.topSection}>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Chỉnh sửa hồ sơ" style={({ pressed }) => [pressed && styles.pressed]}>
          <UserAvatar displayName={displayName} avatar={avatar} size={AVATAR_SIZE} />
        </Pressable>
        <View style={styles.infoColumn}>
          {/* Name */}
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Chỉnh sửa hồ sơ" style={({ pressed }) => [pressed && styles.pressed]}>
            <KoolaText variant="heading" weight="800" numberOfLines={1} style={styles.name}>{displayName}</KoolaText>
          </Pressable>
          {/* Tier pill + switch account */}
          <View style={styles.row2}>
            <View style={styles.tierPill}>
              <KoolaText variant="caption" weight="600" style={styles.tierPillText} numberOfLines={1}>{tierLabel}</KoolaText>
              <View style={styles.tierStar}><MaterialIcons name="star" size={10} color="#B8941A" /></View>
            </View>
            <Pressable onPress={onSwitchAccount} hitSlop={8} accessibilityRole="button" accessibilityLabel="Chuyển tài khoản" style={({ pressed }) => [pressed && styles.pressed]}>
              {/* Button chrome lives on this inner View (RN 0.76 drops layout in Pressable style-as-function). */}
              <View style={styles.switchBtn}>
                <MaterialIcons name="swap-horiz" size={15} color={tokens.semantic.action.primary} />
                <KoolaText variant="caption" weight="600" numberOfLines={1} style={styles.switchLabel}>Chuyển tài khoản</KoolaText>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
      {/* Edit-info button filling the gap before the upgrade banner */}
      <View style={styles.editBtnSlot}>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Chỉnh sửa thông tin tài khoản" style={({ pressed }) => [pressed && styles.pressed]}>
          {/* Button chrome lives on this inner View, not on the Pressable. */}
          <View style={styles.editBtn}>
            <KoolaText variant="caption" weight="500" numberOfLines={1} style={styles.editBtnLabel}>Chỉnh sửa thông tin tài khoản</KoolaText>
          </View>
        </Pressable>
      </View>
      {/* Upgrade banner: gradient bg + icon well + two-line copy + CTA pill */}
      <Pressable onPress={onUpgradeBusiness} accessibilityRole="button" accessibilityLabel="Nâng cấp tài khoản doanh nghiệp" style={({ pressed }) => [pressed && styles.pressed]}>
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
              <MaterialIcons name="trending-up" size={15} color={tokens.semantic.action.primary} />
            </View>
            <View style={styles.upgradeTextCol}>
              <KoolaText variant="caption" weight="600" numberOfLines={1} style={styles.upgradeTitle}>Nâng cấp tài khoản doanh nghiệp</KoolaText>
              <KoolaText variant="caption" numberOfLines={1} style={styles.upgradeSub}>Mở rộng quản lý & bảo mật</KoolaText>
            </View>
            <View style={styles.ctaPill}>
              <KoolaText variant="caption" weight="600" numberOfLines={1} style={styles.ctaLabel}>Nâng cấp</KoolaText>
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
    infoColumn: { flex: 1, marginLeft: koolaSpacing.md - 4, justifyContent: 'center' },
    pressed: { opacity: koolaOpacity.pressed },
    name: { textTransform: 'uppercase', letterSpacing: 0.15 },
    row2: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    tierPill: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 10, paddingRight: 6, borderRadius: koolaRadii.pill, backgroundColor: scheme === 'light' ? semantic.surface.level2 : semantic.surface.level2, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle },
    tierPillText: { color: semantic.text.primary },
    tierStar: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: scheme === 'light' ? '#FFF6CC' : 'rgba(255,246,204,0.18)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(196,154,26,0.28)', marginLeft: 6 },
    switchBtn: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: koolaRadii.pill, backgroundColor: semantic.action.primarySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle, flexWrap: 'nowrap' as const, minWidth: 0 },
    switchLabel: { color: semantic.action.primary },
    editBtnSlot: { marginHorizontal: koolaSpacing.lg, marginTop: koolaSpacing.md - 6, marginBottom: koolaSpacing.md - 4 },
    editBtn: { height: 36, borderRadius: koolaRadii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.surface.level2, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle },
    editBtnLabel: { color: semantic.text.primary },
    upgradeBanner: { height: 56, overflow: 'hidden' },
    upgradeBannerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: koolaSpacing.md - 4 },
    upgradeIconCircle: { flexShrink: 0, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.surface.level1, borderWidth: StyleSheet.hairlineWidth, borderColor: scheme === 'light' ? semantic.border.subtle : 'rgba(255,255,255,0.08)', marginRight: koolaSpacing.md - 4 },
    upgradeTextCol: { flex: 1, marginRight: koolaSpacing.md - 6 },
    upgradeTitle: { color: semantic.text.primary },
    upgradeSub: { color: semantic.text.muted, marginTop: 2 },
    ctaPill: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: semantic.action.primary, borderRadius: koolaRadii.pill, paddingLeft: koolaSpacing.md - 4, paddingRight: koolaSpacing.md - 6, paddingVertical: 7 },
    ctaLabel: { color: semantic.text.onAction, marginRight: 2 },
  });
}
