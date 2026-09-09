import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaOpacity, koolaRadii, koolaSpacing, useTheme } from '../../../../ui';
import type { SemanticTokens } from '../../../../ui/tokens/semantic';
import { PersonalCard } from './PersonalCard';
import { PERSONAL_BLUE_WELL, PERSONAL_DANGER_INK, PERSONAL_DANGER_SOFT } from './personalTokens';

export interface PersonalSecuritySectionProps {
  onManageDevices?: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const PersonalSecuritySection: React.FC<PersonalSecuritySectionProps> = ({
  onManageDevices,
  onOpenSettings,
  onLogout,
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);

  const handleDevices = () => {
    if (onManageDevices) onManageDevices();
    else Alert.alert('Quản lý thiết bị', 'Danh sách thiết bị đang đăng nhập sẽ hiển thị tại đây. Tính năng đang được phát triển.');
  };

  return (
    <PersonalCard style={styles.outer}>
      <KoolaText variant="heading" weight="700" style={styles.title}>Cài đặt & bảo mật</KoolaText>

      <Pressable onPress={handleDevices} hitSlop={6} accessibilityRole="button" accessibilityLabel="Quản lý thiết bị đăng nhập" style={({ pressed }) => [pressed && styles.pressed]}>
        <View style={styles.row}>
          <View style={styles.iconWell}>
            <MaterialIcons name="devices" size={14} color={tokens.semantic.text.muted} />
          </View>
          <KoolaText variant="body" weight="500" style={styles.rowLabel} numberOfLines={1}>Quản lý thiết bị đăng nhập</KoolaText>
          <MaterialIcons name="chevron-right" size={18} color={tokens.semantic.text.faint} />
        </View>
      </Pressable>

      <Pressable onPress={onOpenSettings} hitSlop={6} accessibilityRole="button" accessibilityLabel="Cài đặt" style={({ pressed }) => [pressed && styles.pressed]}>
        <View style={styles.row}>
          <View style={styles.iconWell}>
            <MaterialIcons name="settings" size={14} color={tokens.semantic.text.muted} />
          </View>
          <KoolaText variant="body" weight="500" style={styles.rowLabel} numberOfLines={1}>Cài đặt</KoolaText>
          <MaterialIcons name="chevron-right" size={18} color={tokens.semantic.text.faint} />
        </View>
      </Pressable>

      <View style={styles.divider} />

      <Pressable onPress={onLogout} hitSlop={6} accessibilityRole="button" accessibilityLabel="Đăng xuất" style={({ pressed }) => [pressed && styles.pressed]}>
        <View style={styles.row}>
          <View style={[styles.iconWell, styles.iconWellDanger]}>
            <MaterialIcons name="logout" size={14} color={PERSONAL_DANGER_INK} />
          </View>
          <KoolaText variant="body" weight="600" style={styles.rowLabelDanger} numberOfLines={1}>Đăng xuất</KoolaText>
        </View>
      </Pressable>
    </PersonalCard>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    outer: { padding: koolaSpacing.lg },
    pressed: { opacity: koolaOpacity.pressed },
    title: { color: semantic.text.primary, marginBottom: koolaSpacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: koolaSpacing.sm },
    iconWell: { width: 28, height: 28, borderRadius: koolaRadii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: PERSONAL_BLUE_WELL[scheme].bg, borderWidth: StyleSheet.hairlineWidth, borderColor: PERSONAL_BLUE_WELL[scheme].border, marginRight: koolaSpacing.sm },
    iconWellDanger: { backgroundColor: PERSONAL_DANGER_SOFT[scheme].bg, borderColor: PERSONAL_DANGER_SOFT[scheme].border },
    rowLabel: { color: semantic.text.primary, flex: 1 },
    rowLabelDanger: { color: PERSONAL_DANGER_INK, flex: 1 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle, marginVertical: koolaSpacing.xs },
  });
}
