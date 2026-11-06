import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaRadii, koolaSpacing, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { BUSINESS_ROLE_LABEL, type BusinessRole } from '../../types';

/**
 * What each role may actually do, in plain Vietnamese.
 *
 * Derived from `PERMISSION_MIN_ROLE` in src/types — when the matrix changes,
 * these sentences must change with it. Kept as prose rather than generated
 * from the matrix because a readable sentence ("xem và xử lý đơn hàng") beats
 * a machine-joined list of permission slugs at the point of decision.
 */
export const ROLE_DESCRIPTION: Record<BusinessRole, string> = {
  owner: 'Toàn quyền, kể cả xoá doanh nghiệp và chuyển quyền sở hữu.',
  admin: 'Quản lý thành viên, hoàn tiền đơn hàng và đổi cài đặt doanh nghiệp.',
  editor: 'Thêm, sửa, xoá sản phẩm và xử lý đơn hàng.',
  viewer: 'Chỉ xem số liệu và nội dung, không thay đổi được gì.',
};

/** MaterialIcons glyph per role — same mapping as RoleBadge, so a role reads
 *  identically wherever it appears. */
const ROLE_ICON: Record<BusinessRole, string> = {
  owner: 'workspace-premium',
  admin: 'admin-panel-settings',
  editor: 'edit',
  viewer: 'visibility',
};

interface RolePickerProps<T extends BusinessRole = BusinessRole> {
  /** Roles to offer, in display order. */
  roles: readonly T[];
  value: T | null;
  onChange: (role: T) => void;
  /** Dim + block every row (e.g. while a request is in flight). */
  disabled?: boolean;
  /** Optional group label rendered above the rows. */
  label?: string;
}

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    group: { gap: koolaSpacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: koolaSpacing.md,
      padding: koolaSpacing.md,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      backgroundColor: semantic.surface.level1,
    },
    rowSelected: {
      borderColor: semantic.action.primary,
      backgroundColor: semantic.action.primarySoft,
    },
    pressed: { opacity: 0.82 },
    disabled: { opacity: 0.55 },
    iconShell: {
      width: 36,
      height: 36,
      borderRadius: koolaRadii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level2,
    },
    iconShellSelected: { backgroundColor: semantic.surface.level1 },
    body: { flex: 1, gap: 2 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: koolaRadii.pill,
      borderWidth: 2,
      borderColor: semantic.border.strong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    radioSelected: { borderColor: semantic.action.primary },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: koolaRadii.pill,
      backgroundColor: semantic.action.primary,
    },
  });

/**
 * Selectable role rows, one per offered role, each with a short description of
 * what the role can do.
 *
 * Rendered as `radio` rows rather than a native picker so the description sits
 * next to the choice — the decision ("what will this person be able to do?")
 * is the whole point of the control, and a collapsed dropdown hides it.
 *
 * Generic over the role union so an invite form can pass `InvitableRole[]`
 * (no `owner`) and get an `onChange` that never hands back `'owner'`.
 */
export function RolePicker<T extends BusinessRole>({
  roles,
  value,
  onChange,
  disabled = false,
  label,
}: RolePickerProps<T>): JSX.Element {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <View style={styles.group}>
      {label ? (
        <KoolaText variant="label" weight="700">
          {label}
        </KoolaText>
      ) : null}
      {roles.map((role) => {
        const selected = value === role;
        const roleLabel = BUSINESS_ROLE_LABEL[role];
        return (
          <Pressable
            key={role}
            onPress={() => onChange(role)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${roleLabel}. ${ROLE_DESCRIPTION[role]}`}
            style={({ pressed }) => [
              styles.row,
              selected && styles.rowSelected,
              pressed && !disabled && styles.pressed,
              disabled && styles.disabled,
            ]}>
            <View style={[styles.iconShell, selected && styles.iconShellSelected]}>
              <MaterialIcons
                name={ROLE_ICON[role]}
                size={20}
                color={
                  selected ? tokens.semantic.action.primary : tokens.semantic.text.muted
                }
              />
            </View>
            <View style={styles.body}>
              <KoolaText variant="label" weight={selected ? '800' : '600'}>
                {roleLabel}
              </KoolaText>
              <KoolaText variant="caption" tone="muted">
                {ROLE_DESCRIPTION[role]}
              </KoolaText>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default RolePicker;
