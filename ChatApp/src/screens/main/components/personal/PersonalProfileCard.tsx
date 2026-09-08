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

/** Premium upgrade banner: soft indigo→blue tint, with warm edge highlight on light. */
const UPGRADE_GRADIENT_STOPS: Record<'light' | 'dark', [string, string]> = {
  light: ['#F8FAFF', '#EEF2FF'],
  dark: ['#1A2230', '#1E2C40'],
};

export const PersonalProfileCard: React.FC<PersonalProfileCardProps> = ({
  displayName,
  avatar,
  onEdit,
  onSwitchAccount,
  onUpgradeBusiness,
  tierLabel = 'Titan',
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
          {/* Tier + Tài khoản — single row, equal accent pills */}
          <View style={styles.row2}>
            <View style={styles.tierPill}>
              <View style={styles.tierIconWrap}><MaterialIcons name="workspace-premium" size={12} color="#64748B" /></View>
              <KoolaText variant="caption" weight="700" style={styles.tierPillText} numberOfLines={1}>{tierLabel}</KoolaText>
            </View>
            <Pressable onPress={onSwitchAccount} hitSlop={8} accessibilityRole="button" accessibilityLabel="Chuyển tài khoản" style={({ pressed }) => [pressed && styles.pressed]}>
              <View style={styles.switchBtn}>
                <MaterialIcons name="swap-horiz" size={14} color="#64748B" />
                <KoolaText variant="caption" weight="700" numberOfLines={1} style={styles.switchLabel}>Chuyển tài khoản</KoolaText>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
      {/* Edit-info — subtle outlined button with icon */}
      <View style={styles.editBtnSlot}>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Chỉnh sửa thông tin tài khoản" style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={styles.editBtn}>
            <MaterialIcons name="edit" size={14} color={tokens.semantic.text.muted} />
            <KoolaText variant="caption" weight="600" numberOfLines={1} style={styles.editBtnLabel}>Chỉnh sửa thông tin tài khoản</KoolaText>
            <MaterialIcons name="chevron-right" size={14} color={tokens.semantic.text.faint} />
          </View>
        </Pressable>
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
              <MaterialIcons name="rocket-launch" size={13} color="#3B82F6" />
            </View>
            <View style={styles.upgradeTextCol}>
              <KoolaText variant="caption" weight="600" numberOfLines={1} style={styles.upgradeSubLarge}>Mở rộng quản lý & bảo mật</KoolaText>
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
    infoColumn: { flex: 1, minWidth: 0, marginLeft: koolaSpacing.md - 4, justifyContent: 'center' },
    pressed: { opacity: koolaOpacity.pressed },
    name: { textTransform: 'uppercase', letterSpacing: 0.15 },
    row2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap' as const, gap: 8, marginTop: 8, minWidth: 0, width: '100%' as const },
    tierPill: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: koolaRadii.pill, backgroundColor: scheme === 'light' ? '#FFFFFF' : semantic.surface.level2, borderWidth: 1, borderColor: scheme === 'light' ? '#E5EAF1' : 'rgba(255,255,255,0.10)' },
    tierIconWrap: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: scheme === 'light' ? '#F1F5F9' : 'rgba(255,255,255,0.08)' },
    tierPillText: { color: semantic.text.primary, fontSize: 11 },
    switchBtn: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: koolaRadii.pill, backgroundColor: scheme === 'light' ? '#FFFFFF' : semantic.surface.level2, borderWidth: 1, borderColor: scheme === 'light' ? '#E5EAF1' : 'rgba(255,255,255,0.10)' },
    switchLabel: { color: semantic.text.primary, fontSize: 11 },
    editBtnSlot: { marginHorizontal: koolaSpacing.lg, marginTop: koolaSpacing.md, marginBottom: koolaSpacing.md - 2 },
    editBtn: { height: 38, borderRadius: koolaRadii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: scheme === 'light' ? '#FFFFFF' : semantic.surface.level2, borderWidth: 1, borderColor: scheme === 'light' ? '#E5EAF1' : 'rgba(255,255,255,0.10)', paddingHorizontal: 12 },
    editBtnLabel: { color: semantic.text.primary },
    upgradePressable: { alignSelf: 'stretch', width: '100%' },
    upgradeBanner: { width: '100%', alignSelf: 'stretch', minHeight: 52, overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: scheme === 'light' ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.06)' },
    upgradeBannerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: koolaSpacing.lg, paddingVertical: 8, gap: 8, width: '100%' },
    upgradeIconCircle: { flexShrink: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(37,99,235,0.12)', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
    upgradeTextCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
    upgradeTitle: { color: semantic.text.primary },
    upgradeSub: { color: semantic.text.muted, marginTop: 2, fontSize: 11 },
    upgradeSubLarge: { color: semantic.text.primary, fontSize: 12, lineHeight: 15 },
    ctaPill: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 0, backgroundColor: '#2563EB', borderRadius: koolaRadii.pill, paddingLeft: 12, paddingRight: 9, paddingVertical: 7, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 2 },
    ctaLabel: { color: '#FFFFFF', marginRight: 2 },
  });
}
