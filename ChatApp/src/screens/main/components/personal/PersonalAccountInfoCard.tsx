import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaOpacity, koolaRadii, koolaSpacing, useTheme } from '../../../../ui';
import type { SemanticTokens } from '../../../../ui/tokens/semantic';
import { PersonalCard } from './PersonalCard';
import { PERSONAL_BLUE_WELL, PERSONAL_DANGER_INK } from './personalTokens';

export interface PersonalAccountInfoCardProps {
  phone?: string;
  email?: string;
  userId: string;
  onVerify?: () => void;
}

export const PersonalAccountInfoCard: React.FC<PersonalAccountInfoCardProps> = ({
  phone,
  email,
  userId,
  onVerify,
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);

  const handleVerify = () => {
    if (onVerify) onVerify();
    else Alert.alert('Xác thực sinh trắc học', 'Tính năng xác thực sinh trắc học đang được phát triển.');
  };

  const rows = [
    ...(phone ? [{ icon: 'phone-iphone', label: 'Điện thoại', value: phone }] : []),
    { icon: 'mail', label: 'Email', value: email || 'Chưa có' },
    { icon: 'badge', label: 'ID người dùng', value: userId },
  ];

  return (
    <PersonalCard style={styles.outer}>
      <KoolaText variant="label" weight="700" style={styles.title}>Thông tin tài khoản</KoolaText>

      {rows.map((row, index) => (
        <React.Fragment key={row.label}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.infoRow}>
            <View style={styles.iconWell}>
              <MaterialIcons name={row.icon} size={14} color={tokens.semantic.action.primary} />
            </View>
            <KoolaText variant="caption" weight="500" style={styles.infoLabel}>{row.label}</KoolaText>
            <KoolaText variant="caption" weight="600" numberOfLines={1} style={styles.infoValue} ellipsizeMode="tail">{row.value}</KoolaText>
          </View>
        </React.Fragment>
      ))}

      <View style={styles.warningRow}>
        <MaterialIcons name="warning-amber" size={16} color={PERSONAL_DANGER_INK} />
        <KoolaText variant="caption" weight="600" style={styles.warningText}>Chưa bật xác thực sinh trắc học!</KoolaText>
        <Pressable onPress={handleVerify} hitSlop={6} accessibilityRole="button" accessibilityLabel="Xác thực sinh trắc học ngay" style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={styles.warningAction}>
            <KoolaText variant="caption" weight="600" style={styles.warningActionLabel}>Xác thực ngay! </KoolaText>
            <MaterialIcons name="chevron-right" size={14} color={PERSONAL_DANGER_INK} />
          </View>
        </Pressable>
      </View>
    </PersonalCard>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    outer: { padding: koolaSpacing.lg },
    pressed: { opacity: koolaOpacity.pressed },
    title: { color: semantic.text.primary, marginBottom: koolaSpacing.md - 4 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle },
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: koolaSpacing.md - 4 },
    iconWell: { width: 28, height: 28, borderRadius: koolaRadii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: PERSONAL_BLUE_WELL[scheme].bg, borderWidth: StyleSheet.hairlineWidth, borderColor: PERSONAL_BLUE_WELL[scheme].border, marginRight: koolaSpacing.md - 6 },
    infoLabel: { color: semantic.text.muted, flex: 1 },
    infoValue: { color: semantic.text.primary, marginLeft: koolaSpacing.sm, flexShrink: 1, textAlign: 'right' },
    warningRow: { flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.sm, marginTop: koolaSpacing.md - 4, backgroundColor: scheme === 'light' ? '#FFF2F2' : 'rgba(239,68,68,0.12)', borderRadius: koolaRadii.md, paddingLeft: koolaSpacing.md - 4, paddingRight: koolaSpacing.sm, paddingVertical: koolaSpacing.md - 6, borderWidth: StyleSheet.hairlineWidth, borderColor: scheme === 'light' ? '#FDD2D2' : 'rgba(239,68,68,0.25)' },
    warningText: { color: PERSONAL_DANGER_INK, flex: 1, flexShrink: 1, minWidth: 0 },
    warningAction: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    warningActionLabel: { color: PERSONAL_DANGER_INK },
  });
}
