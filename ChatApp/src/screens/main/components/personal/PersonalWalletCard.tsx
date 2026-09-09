import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaOpacity, koolaRadii, koolaSpacing, useTheme } from '../../../../ui';
import type { SemanticTokens } from '../../../../ui/tokens/semantic';
import { PersonalCard } from './PersonalCard';
import { PERSONAL_BLUE_WELL, PERSONAL_STAR } from './personalTokens';

export interface PersonalWalletCardProps {
  balance?: string;
  points?: string;
  onTopUp?: () => void;
  onWithdraw?: () => void;
  onTransfer?: () => void;
  onScanQr?: () => void;
  onPointsHistory?: () => void;
  onRedeemPoints?: () => void;
}

/**
 * Ví KOOLA card — Figma 92:19 redesign.
 *
 * Layout: single-row header (chip + title left, masked balance + eye right),
 * 4 action wells (Nạp highlighted as primary), divider, points row with two
 * pills. The "Tích điểm khi mua sắm..." helper caption was dropped in the
 * redesign. Nạp / Rút use composited "detailed" wells (wallet+badge,
 * card+arrow) instead of a single minimal glyph — keeps the Figma richness
 * without adding an SVG dependency.
 *
 * Soft tint literals (light scheme) mirror the Figma spec; dark scheme falls
 * back to semantic tokens — same pattern as the rest of the Personal cards.
 */
const ACTIONS: { key: string; icon: string; label: string }[] = [
  { key: 'topup', icon: 'add', label: 'Nạp' },
  { key: 'withdraw', icon: 'north-east', label: 'Rút' },
  { key: 'transfer', icon: 'swap-horiz', label: 'Chuyển' },
  { key: 'qr', icon: 'qr-code-scanner', label: 'Quét QR' },
];

export const PersonalWalletCard: React.FC<PersonalWalletCardProps> = ({
  balance = '•••• ••••',
  points = '256.000',
  onTopUp,
  onWithdraw,
  onTransfer,
  onScanQr,
  onPointsHistory,
  onRedeemPoints,
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);
  const [revealed, setRevealed] = useState(false);

  const actionHandlers: Record<string, (() => void) | undefined> = {
    topup: onTopUp,
    withdraw: onWithdraw,
    transfer: onTransfer,
    qr: onScanQr,
  };

  return (
    <PersonalCard style={styles.outer}>
      {/* Header: chip + title left, masked balance + eye right — one row */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.walletChip}>
            <MaterialIcons name="account-balance-wallet" size={11} color={tokens.semantic.action.primary} />
          </View>
          <KoolaText variant="heading" weight="700" style={styles.title}>Ví KOOLA</KoolaText>
        </View>

        <View style={styles.balanceRow}>
          <KoolaText variant="body" style={styles.balanceLabel}>Số dư</KoolaText>
          <KoolaText variant="label" weight="800" style={styles.balanceValue}>{balance}</KoolaText>
          <Pressable
            onPress={() => setRevealed(v => !v)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ẩn số dư' : 'Hiện số dư'}
            style={({ pressed }) => [pressed && styles.pressed]}>
            <View style={styles.eyeBtn}>
              <MaterialIcons name={revealed ? 'visibility' : 'visibility-off'} size={15} color={tokens.semantic.text.muted} />
            </View>
          </Pressable>
        </View>
      </View>

      {/* 4 action wells — all blue; Nạp/Rút are composited detailed icons */}
      <View style={styles.actionsGrid}>
        {ACTIONS.map(action => (
          <View key={action.key} style={styles.actionCol}>
            <Pressable
              onPress={actionHandlers[action.key]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <View style={styles.actionWell}>
                {action.key === 'topup' ? (
                  <View style={styles.detailedTopup}>
                    <MaterialIcons name="account-balance-wallet" size={18} color={tokens.semantic.action.primary} />
                    <View style={styles.topupBadge}>
                      <MaterialIcons name="add" size={10} color="#FFFFFF" />
                    </View>
                  </View>
                ) : action.key === 'withdraw' ? (
                  <View style={styles.detailedWithdraw}>
                    <MaterialIcons name="payments" size={17} color={tokens.semantic.action.primary} />
                    <MaterialIcons name="north-east" size={11} color={tokens.semantic.action.primary} style={styles.withdrawArrow} />
                  </View>
                ) : (
                  <MaterialIcons
                    name={action.icon}
                    size={18}
                    color={tokens.semantic.action.primary}
                  />
                )}
              </View>
            </Pressable>
            <KoolaText variant="body" weight="500" style={styles.actionLabel}>{action.label}</KoolaText>
          </View>
        ))}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Points section */}
      <View style={styles.pointsSection}>
        <View style={styles.pointsRow}>
          <View style={styles.pointsLeft}>
            <View style={styles.starGem}>
              <MaterialIcons name="star" size={10} color={PERSONAL_STAR[resolvedScheme].icon} />
            </View>
            <KoolaText variant="body" weight="600" style={styles.pointsLabel}>Điểm tích lũy</KoolaText>
          </View>
          <KoolaText variant="body" weight="800" style={styles.pointsValue}>{points}</KoolaText>
        </View>

        <View style={styles.pillRow}>
          <Pressable
            onPress={onPointsHistory}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Lịch sử tích điểm"
            style={({ pressed }) => [pressed && styles.pressed]}>
            <View style={styles.pill}>
              <KoolaText variant="body" weight="500" style={styles.pillText}>Lịch sử tích điểm</KoolaText>
              <MaterialIcons name="chevron-right" size={12} color={tokens.semantic.text.muted} />
            </View>
          </Pressable>
          <Pressable
            onPress={onRedeemPoints}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Đổi điểm"
            style={({ pressed }) => [pressed && styles.pressed]}>
            <View style={styles.pill}>
              <KoolaText variant="body" weight="500" style={styles.pillText}>Đổi điểm</KoolaText>
              <MaterialIcons name="chevron-right" size={12} color={tokens.semantic.text.muted} />
            </View>
          </Pressable>
        </View>
      </View>
    </PersonalCard>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    outer: { padding: koolaSpacing.lg },
    pressed: { opacity: koolaOpacity.pressed },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: koolaSpacing.lg },
    titleRow: { flexDirection: 'row', alignItems: 'center' },
    walletChip: { width: 22, height: 22, borderRadius: koolaRadii.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: PERSONAL_BLUE_WELL[scheme].bg, borderWidth: StyleSheet.hairlineWidth, borderColor: PERSONAL_BLUE_WELL[scheme].border, marginRight: koolaSpacing.sm },
    title: { color: semantic.text.primary, letterSpacing: 0.3 },
    balanceRow: { flexDirection: 'row', alignItems: 'center' },
    balanceLabel: { color: semantic.text.muted, marginRight: koolaSpacing.sm - 2 },
    balanceValue: { color: semantic.text.primary, letterSpacing: 1.2, marginRight: koolaSpacing.sm },
    eyeBtn: { width: 32, height: 32, borderRadius: koolaRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: scheme === 'light' ? semantic.surface.level1 : semantic.surface.level2, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle },
    actionsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: koolaSpacing.lg },
    actionCol: { flex: 1, alignItems: 'center' },
    actionWell: { width: 44, height: 44, borderRadius: koolaRadii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: PERSONAL_BLUE_WELL[scheme].bg, borderWidth: StyleSheet.hairlineWidth, borderColor: PERSONAL_BLUE_WELL[scheme].border },
    detailedTopup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 30, height: 18 },
    // White ring is a deliberate cutout separator over the wallet glyph, not a themeable color.
    // eslint-disable-next-line no-restricted-syntax -- white badge ring (design intent)
    topupBadge: { width: 13, height: 13, borderRadius: 6.5, backgroundColor: semantic.action.primary, alignItems: 'center', justifyContent: 'center', marginLeft: 1, borderWidth: 1.5, borderColor: '#FFFFFF' },
    detailedWithdraw: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    withdrawArrow: { marginLeft: -2, marginTop: -6 },
    actionLabel: { color: semantic.text.primary, marginTop: koolaSpacing.sm },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle, marginBottom: koolaSpacing.md },
    pointsSection: {},
    pointsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: koolaSpacing.md },
    pointsLeft: { flexDirection: 'row', alignItems: 'center' },
    starGem: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: PERSONAL_STAR[scheme].bg, borderWidth: StyleSheet.hairlineWidth, borderColor: PERSONAL_STAR[scheme].border, marginRight: koolaSpacing.sm - 1 },
    pointsLabel: { color: semantic.text.primary },
    pointsValue: { color: semantic.action.primary },
    pillRow: { flexDirection: 'row' },
    pill: { flexDirection: 'row', alignItems: 'center', borderRadius: koolaRadii.pill, paddingHorizontal: koolaSpacing.sm, paddingVertical: koolaSpacing.sm - 1, backgroundColor: scheme === 'light' ? semantic.surface.level1 : semantic.surface.level2, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle, marginRight: koolaSpacing.sm },
    pillText: { color: semantic.text.primary, marginRight: koolaSpacing.xs },
  });
}
