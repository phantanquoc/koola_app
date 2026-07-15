import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../UserAvatar';
import { KoolaText, koolaRadii, koolaShadows, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import type { BusinessAccountItem } from '../../services/api/apiService';

// ─── Category label lookup (module-level, no per-render allocation) ──────────
import { CATEGORY_LABELS } from '../../screens/connect/constants';

export interface BusinessCardProps {
  item: BusinessAccountItem;
  onPress: () => void;
  onMessagePress: () => void;
  messageDisabled?: boolean;
  messageLoading?: boolean;
}

/**
 * Shared business card component used by ConnectHomeScreen and BusinessSearchScreen.
 * Renders avatar/logo imagery with graceful initials fallback via UserAvatar.
 * Uses useTheme().palette for dark-mode correctness + shadow depth tokens.
 */
const BusinessCard: React.FC<BusinessCardProps> = ({
  item,
  onPress,
  onMessagePress,
  messageDisabled,
  messageLoading,
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const categoryLabel =
    (item.businessCategory ? CATEGORY_LABELS[item.businessCategory] : undefined) ||
    item.businessCategory ||
    '';

  // Use avatar or logoKey for imagery; UserAvatar handles fallback to initials
  const imageKey = item.avatar || item.logoKey;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Xem hồ sơ ${item.displayName}`}>
      <UserAvatar
        displayName={item.displayName}
        avatar={imageKey}
        size={44}
      />
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <KoolaText variant="label" weight="700" numberOfLines={1} style={styles.name}>
            {item.displayName}
          </KoolaText>
          {item.verificationStatus === 'verified' && (
            <MaterialIcons name="verified" size={14} color={palette.success} />
          )}
        </View>
        <View style={styles.meta}>
          {categoryLabel ? (
            <KoolaText variant="caption" tone="primary" weight="700" numberOfLines={1} style={styles.metaLabel}>
              {categoryLabel}
            </KoolaText>
          ) : null}
          {item.province ? (
            <>
              <View style={styles.dot} />
              <MaterialIcons name="location-on" size={11} color={palette.muted} />
              <KoolaText variant="caption" tone="muted" numberOfLines={1} style={styles.metaLabel}>
                {item.province}
              </KoolaText>
            </>
          ) : null}
        </View>
        {item.tagline ? (
          <KoolaText variant="caption" tone="muted" numberOfLines={2} style={styles.tagline}>
            {item.tagline}
          </KoolaText>
        ) : null}
      </View>
      <Pressable
        style={styles.cta}
        onPress={(e) => {
          e.stopPropagation();
          onMessagePress();
        }}
        disabled={messageDisabled || messageLoading}
        accessibilityRole="button"
        accessibilityLabel="Nhắn tin">
        <MaterialIcons name="chat-bubble-outline" size={16} color={palette.primary} />
        <KoolaText variant="caption" tone="primary" weight="700" style={{ marginLeft: 4 }}>Nhắn tin</KoolaText>
      </Pressable>
    </Pressable>
  );
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: p.surface,
      padding: 14,
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: koolaRadii.md,
      ...koolaShadows.sm,
    },
    content: {
      flex: 1,
      marginLeft: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    name: {
      flex: 1,
      marginRight: 4,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      flexWrap: 'wrap',
      flex: 1,
    },
    metaLabel: {
      flexShrink: 1,
      marginRight: 4,
    },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: p.faint,
      marginHorizontal: 2,
    },
    tagline: {
      marginTop: 2,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: koolaRadii.pill,
      backgroundColor: p.primarySoft,
      marginLeft: 12,
    },
  });

export default React.memo(BusinessCard);
