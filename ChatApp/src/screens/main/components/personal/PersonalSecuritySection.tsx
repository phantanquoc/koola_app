import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaOpacity, koolaRadii, koolaSpacing, useTheme } from '../../../../ui';
import type { SemanticTokens } from '../../../../ui/tokens/semantic';
import { PersonalCard } from './PersonalCard';
import { PERSONAL_DANGER_SOFT } from './personalTokens';

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

  const [confirmVisible, setConfirmVisible] = useState(false);

  const handleDevices = () => {
    if (onManageDevices) onManageDevices();
    else Alert.alert('Quản lý thiết bị', 'Danh sách thiết bị đang đăng nhập sẽ hiển thị tại đây. Tính năng đang được phát triển.');
  };

  const handleLogout = () => setConfirmVisible(true);

  return (
    <>
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

        <Pressable onPress={handleLogout} hitSlop={6} accessibilityRole="button" accessibilityLabel="Đăng xuất" style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={styles.row}>
            <View style={[styles.iconWell, styles.iconWellDanger]}>
              <MaterialIcons name="logout" size={14} color={tokens.semantic.status.danger} />
            </View>
            <KoolaText variant="body" weight="600" style={styles.rowLabelDanger} numberOfLines={1}>Đăng xuất</KoolaText>
          </View>
        </Pressable>
      </PersonalCard>

      <Modal visible={confirmVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setConfirmVisible(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <KoolaText variant="heading" weight="700" style={styles.dialogTitle}>Đăng xuất</KoolaText>
            <KoolaText variant="body" style={styles.dialogMessage}>Bạn có chắc muốn đăng xuất?</KoolaText>
            <View style={styles.dialogActions}>
              <Pressable onPress={() => setConfirmVisible(false)} accessibilityRole="button" accessibilityLabel="Hủy" style={({ pressed }) => [styles.dialogBtn, pressed && styles.pressed]}>
                <KoolaText variant="label" weight="700" style={styles.dialogCancel}>HỦY</KoolaText>
              </Pressable>
              <Pressable onPress={() => { setConfirmVisible(false); onLogout(); }} accessibilityRole="button" accessibilityLabel="Đăng xuất" style={({ pressed }) => [styles.dialogBtn, pressed && styles.pressed]}>
                <KoolaText variant="label" weight="800" style={styles.dialogConfirm}>ĐĂNG XUẤT</KoolaText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    outer: { padding: koolaSpacing.lg },
    pressed: { opacity: koolaOpacity.pressed },
    title: { color: semantic.text.primary, marginBottom: koolaSpacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: koolaSpacing.sm },
    iconWell: { width: 28, height: 28, borderRadius: koolaRadii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.action.primarySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle, marginRight: koolaSpacing.sm },
    iconWellDanger: { backgroundColor: PERSONAL_DANGER_SOFT[scheme].bg, borderColor: PERSONAL_DANGER_SOFT[scheme].border },
    rowLabel: { color: semantic.text.primary, flex: 1 },
    rowLabelDanger: { color: semantic.status.danger, flex: 1 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle, marginVertical: koolaSpacing.xs },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: koolaSpacing.xl },
    dialog: { width: '100%', maxWidth: 340, backgroundColor: semantic.surface.level1, borderRadius: koolaRadii.lg, padding: koolaSpacing.lg, elevation: 8, shadowColor: semantic.text.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
    dialogTitle: { color: semantic.text.primary, marginBottom: koolaSpacing.sm },
    dialogMessage: { color: semantic.text.muted },
    dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: koolaSpacing.md, marginTop: koolaSpacing.lg },
    dialogBtn: { paddingHorizontal: koolaSpacing.md, paddingVertical: koolaSpacing.sm },
    dialogCancel: { color: semantic.text.muted },
    dialogConfirm: { color: semantic.status.danger },
  });
}
