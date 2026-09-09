import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaOpacity, koolaRadii, koolaSpacing, useTheme } from '../../../../ui';
import type { SemanticTokens } from '../../../../ui/tokens/semantic';
import { PersonalCard } from './PersonalCard';
import { PERSONAL_BLUE_WELL } from './personalTokens';

export interface PersonalAccountInfoCardProps {
  phone?: string;
  email?: string;
  userId: string;
  onEdit?: () => void;
}

export const PersonalAccountInfoCard: React.FC<PersonalAccountInfoCardProps> = ({
  phone,
  email,
  userId,
  onEdit,
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);

  const rows = [
    { icon: 'phone-iphone', label: 'Điện thoại', value: phone || 'Chưa có' },
    { icon: 'mail', label: 'Email', value: email || 'Chưa có' },
    { icon: 'badge', label: 'ID người dùng', value: userId },
  ];

  return (
    <PersonalCard style={styles.outer}>
      <KoolaText variant="heading" weight="700" style={styles.title}>Thông tin tài khoản</KoolaText>

      {rows.map((row, index) => (
        <React.Fragment key={row.label}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.infoRow}>
            <View style={styles.iconWell}>
              <MaterialIcons name={row.icon} size={14} color={tokens.semantic.action.primary} />
            </View>
            <KoolaText variant="body" weight="500" style={styles.infoLabel}>{row.label}</KoolaText>
            <KoolaText variant="body" weight="600" numberOfLines={1} style={styles.infoValue} ellipsizeMode="tail">{row.value}</KoolaText>
          </View>
        </React.Fragment>
      ))}

      {onEdit ? (
        <>
          <View style={styles.editDivider} />
          <Pressable
            onPress={onEdit}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Chỉnh sửa thông tin tài khoản"
            style={({ pressed }) => [pressed && styles.pressed]}>
            <View style={styles.editRow}>
              <View style={styles.iconWell}>
                <MaterialIcons name="edit" size={14} color={tokens.semantic.action.primary} />
              </View>
              <KoolaText variant="body" weight="600" style={styles.editLabel}>Chỉnh sửa thông tin tài khoản</KoolaText>
              <MaterialIcons name="chevron-right" size={18} color={tokens.semantic.text.faint} />
            </View>
          </Pressable>
        </>
      ) : null}
    </PersonalCard>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    outer: { padding: koolaSpacing.lg },
    pressed: { opacity: koolaOpacity.pressed },
    title: { color: semantic.text.primary, marginBottom: koolaSpacing.sm },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle },
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: koolaSpacing.sm },
    iconWell: { width: 28, height: 28, borderRadius: koolaRadii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: PERSONAL_BLUE_WELL[scheme].bg, borderWidth: StyleSheet.hairlineWidth, borderColor: PERSONAL_BLUE_WELL[scheme].border, marginRight: koolaSpacing.sm },
    infoLabel: { color: semantic.text.muted, flex: 1 },
    infoValue: { color: semantic.text.primary, marginLeft: koolaSpacing.sm, flexShrink: 1, textAlign: 'right' },
    editDivider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle, marginTop: koolaSpacing.sm },
    editRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: koolaSpacing.sm, marginTop: koolaSpacing.sm },
    editLabel: { color: semantic.text.primary, flex: 1 },
  });
}
