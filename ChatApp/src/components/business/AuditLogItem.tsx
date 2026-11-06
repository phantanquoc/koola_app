import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../UserAvatar';
import { KoolaText, koolaRadii, koolaSpacing, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { formatRelativeTimestamp } from '../../utils/formatViTimestamp';
import {
  auditEventMeta,
  describeAuditEvent,
} from '../../screens/business/auditEvents';
import type { BusinessAuditLogEntry } from '../../services/api/apiService';

interface AuditLogItemProps {
  entry: BusinessAuditLogEntry;
  /** Opens the details sheet (task 18.5). */
  onPress?: () => void;
}

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: koolaSpacing.md,
      paddingVertical: koolaSpacing.md,
      paddingHorizontal: koolaSpacing.md,
    },
    pressed: { backgroundColor: semantic.surface.level2 },
    avatarWrap: { position: 'relative' },
    eventBadge: {
      position: 'absolute',
      right: -4,
      bottom: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: semantic.surface.level1,
      backgroundColor: semantic.surface.level2,
    },
    eventBadgeSensitive: { backgroundColor: semantic.status.dangerSoft },
    body: { flex: 1, gap: 2 },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: koolaSpacing.sm,
    },
    actor: { flexShrink: 1 },
    deviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
  });

/**
 * One audit entry: who did what, when, and from what kind of device.
 *
 * The event glyph sits on the actor's avatar rather than in its own column, so
 * the row scans as "person → action" and the list stays dense. Sensitive events
 * (removal, role change, deletions) tint that badge danger — task 18.6.
 */
export const AuditLogItem: React.FC<AuditLogItemProps> = ({ entry, onPress }) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  const meta = auditEventMeta(entry.eventType);
  const detail = describeAuditEvent(entry);

  const content = (
    <View style={styles.row}>
      <View style={styles.avatarWrap}>
        <UserAvatar
          displayName={entry.actor.displayName}
          avatar={entry.actor.avatar}
          size={40}
        />
        <View
          style={[styles.eventBadge, meta.sensitive && styles.eventBadgeSensitive]}>
          <MaterialIcons
            name={meta.icon}
            size={12}
            color={
              meta.sensitive
                ? tokens.semantic.status.danger
                : tokens.semantic.text.muted
            }
          />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.headRow}>
          <KoolaText variant="label" numberOfLines={1} style={styles.actor}>
            {entry.actor.displayName}
          </KoolaText>
          {!!entry.createdAt && (
            <KoolaText variant="caption" tone="muted">
              {formatRelativeTimestamp(entry.createdAt)}
            </KoolaText>
          )}
        </View>

        <KoolaText
          variant="caption"
          tone={meta.sensitive ? 'danger' : 'muted'}
          weight={meta.sensitive ? '700' : '400'}>
          {meta.label}
        </KoolaText>

        {!!detail && (
          <KoolaText variant="caption" tone="muted" numberOfLines={2}>
            {detail}
          </KoolaText>
        )}

        {!!entry.deviceId && (
          <View style={styles.deviceRow}>
            <MaterialIcons
              name="smartphone"
              size={12}
              color={tokens.semantic.text.faint}
            />
            <KoolaText variant="caption" tone="muted" numberOfLines={1}>
              {/* Device ids are UUIDs — a prefix is enough to tell two apart
                  without turning the row into a wall of hex. */}
              {entry.deviceId.slice(0, 8)}
            </KoolaText>
          </View>
        )}
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.actor.displayName}: ${meta.label}. Xem chi tiết`}
      style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
};

export default AuditLogItem;
