import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaRadii, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import { BUSINESS_ROLE_LABEL, type BusinessRole } from '../../types';

/**
 * MaterialIcons glyph per role. The icon carries the privilege signal at a
 * glance (crown-ish badge for owner, shield for admin, pencil for editor, eye
 * for viewer) so the badge stays readable even when the label is truncated.
 */
const ROLE_ICON: Record<BusinessRole, string> = {
  owner: 'workspace-premium',
  admin: 'admin-panel-settings',
  editor: 'edit',
  viewer: 'visibility',
};

/**
 * Colour recipe per role, mirroring KoolaBadge's soft-fill + strong-ink pairing
 * so role badges sit visually alongside the verification badges on the same row.
 * Privilege descends with colour weight: owner reads strongest, viewer neutral.
 */
const makeRoleTone = (p: Palette): Record<BusinessRole, { bg: string; fg: string }> => ({
  owner: { bg: p.primarySoft, fg: p.primary },
  admin: { bg: p.accentSoft, fg: p.success },
  editor: { bg: p.warningSoft, fg: p.warningInk },
  viewer: { bg: p.canvas, fg: p.muted },
});

interface RoleBadgeProps {
  role: BusinessRole;
  /** Hide the text label and render the icon only (for dense rows). */
  iconOnly?: boolean;
}

/**
 * Compact icon + label badge naming the viewer's role inside a business
 * account. Labels come from `BUSINESS_ROLE_LABEL` so the Vietnamese copy stays
 * in one place shared with permission toasts.
 */
export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, iconOnly = false }) => {
  const { palette } = useTheme();
  const roleTone = useMemo(() => makeRoleTone(palette), [palette]);
  const tone = roleTone[role];
  const label = BUSINESS_ROLE_LABEL[role];

  return (
    <View
      style={[styles.badge, { backgroundColor: tone.bg }]}
      accessibilityLabel={`Vai trò: ${label}`}>
      <MaterialIcons name={ROLE_ICON[role]} size={12} color={tone.fg} />
      {!iconOnly && (
        <KoolaText
          variant="caption"
          weight="700"
          numberOfLines={1}
          style={[styles.label, { color: tone.fg }]}>
          {label}
        </KoolaText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: koolaRadii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  label: {
    marginLeft: 4,
  },
});

export default RoleBadge;
