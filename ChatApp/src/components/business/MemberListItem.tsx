import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../UserAvatar';
import { KoolaText, koolaSpacing, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { formatRelativeTimestamp } from '../../utils/formatViTimestamp';
import RoleBadge from './RoleBadge';
import type { BusinessMember } from '../../services/api/apiService';

/**
 * How long after `lastActiveAt` a member still counts as "đang hoạt động".
 *
 * The backend refreshes `business_sessions.lastActiveAt` on every business API
 * call, so a member with the app open updates within seconds. Five minutes is
 * wide enough to survive a screen the user is just reading, narrow enough that
 * "online" means something.
 */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isMemberOnline(lastActiveAt?: string | null): boolean {
  if (!lastActiveAt) return false;
  const ts = new Date(lastActiveAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ONLINE_WINDOW_MS;
}

interface MemberListItemProps {
  member: BusinessMember;
  /** Marks the row as the signed-in user ("Bạn"), which cannot be acted on. */
  isSelf?: boolean;
  /** Show the ⋮ actions affordance (admin+ only). Omit to render a plain row. */
  onActionsPress?: () => void;
  /** Disable the actions button while a mutation is in flight. */
  busy?: boolean;
}

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: koolaSpacing.md,
      paddingHorizontal: koolaSpacing.md,
      gap: koolaSpacing.md,
    },
    avatarWrap: { position: 'relative' },
    presenceDot: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: semantic.surface.level1,
      backgroundColor: semantic.status.success,
    },
    body: { flex: 1, gap: 3 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.sm },
    name: { flexShrink: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.sm },
    actions: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
  });

/**
 * One member row: avatar + presence dot, name, role badge, and device status.
 *
 * Presence is derived from `lastActiveAt` rather than the chat socket's
 * `isOnline`: the question here is "is this person working in the business
 * right now", which is what the device session tracks. A member can be online
 * in chat on their personal account while holding no business session.
 */
export const MemberListItem: React.FC<MemberListItemProps> = ({
  member,
  isSelf = false,
  onActionsPress,
  busy = false,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  const online = isMemberOnline(member.lastActiveAt);
  const activity = online
    ? 'Đang hoạt động'
    : member.lastActiveAt
      ? `Hoạt động ${formatRelativeTimestamp(member.lastActiveAt).toLowerCase()}`
      : 'Chưa đăng nhập';

  return (
    <View style={styles.row}>
      <View style={styles.avatarWrap}>
        <UserAvatar
          displayName={member.userId.displayName}
          avatar={member.userId.avatar}
          size={44}
        />
        {online && <View style={styles.presenceDot} accessibilityLabel="Đang hoạt động" />}
      </View>

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <KoolaText variant="label" numberOfLines={1} style={styles.name}>
            {member.userId.displayName}
          </KoolaText>
          {isSelf && (
            <KoolaText variant="caption" tone="muted">
              (Bạn)
            </KoolaText>
          )}
        </View>

        <View style={styles.metaRow}>
          <RoleBadge role={member.role} />
          <KoolaText variant="caption" tone="muted" numberOfLines={1}>
            {activity}
          </KoolaText>
        </View>

        {!!member.userId.email && (
          <KoolaText variant="caption" tone="muted" numberOfLines={1}>
            {member.userId.email}
          </KoolaText>
        )}
      </View>

      {/* Self rows get no actions: the backend rejects self-role-change and
          self-removal, so offering the menu would only produce a 400. */}
      {onActionsPress && !isSelf && (
        <Pressable
          onPress={onActionsPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Tuỳ chọn cho ${member.userId.displayName}`}
          hitSlop={8}
          style={({ pressed }) => [styles.actions, pressed && styles.pressed]}>
          <MaterialIcons
            name="more-vert"
            size={22}
            color={tokens.semantic.text.muted}
          />
        </Pressable>
      )}
    </View>
  );
};

export default MemberListItem;
