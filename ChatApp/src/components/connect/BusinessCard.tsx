import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { Business } from '../../types';
import { CATEGORY_LABELS } from '../../screens/connect/constants';
import {
  KoolaButton,
  KoolaText,
  koolaColors,
  koolaRadii,
  koolaShadows,
} from '../../ui';

interface BusinessCardProps {
  business: Business;
  onPress: () => void;
  onConnectAndChatPress: () => void;
  onMessagePress: () => void;
  isConnecting?: boolean;
}

const LOGO_COLORS = [
  koolaColors.primary,
  koolaColors.accent,
  koolaColors.warm,
  '#7C3AED',
  '#0EA5E9',
];

const BusinessCard: React.FC<BusinessCardProps> = ({
  business,
  onPress,
  onConnectAndChatPress,
  onMessagePress,
  isConnecting,
}) => {
  const [pressed, setPressed] = React.useState(false);
  const bgColor = LOGO_COLORS[business.name.charCodeAt(0) % LOGO_COLORS.length];
  const categoryLabel =
    CATEGORY_LABELS[business.category] || business.category;
  const tagline =
    business.description?.trim() ||
    business.tagline?.trim() ||
    'Chưa có mô tả';

  return (
    <Pressable
      style={[styles.card, pressed && styles.pressed]}
      android_ripple={{ color: koolaColors.canvas }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={`Xem hồ sơ ${business.name}`}>
      {business.logoKey ? (
        <Image source={{ uri: business.logoKey }} style={styles.logo} />
      ) : (
        <View style={[styles.logo, styles.logoPlaceholder, { backgroundColor: bgColor }]}>
          <MaterialIcons name="business" size={20} color={koolaColors.surface} />
        </View>
      )}

      <View style={styles.contentCol}>
        <View style={styles.nameRow}>
          <KoolaText variant="label" weight="700" numberOfLines={1} style={styles.name}>
            {business.name}
          </KoolaText>
          {business.isVerified ? (
            <MaterialIcons name="verified" size={14} color={koolaColors.success} />
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <KoolaText variant="caption" tone="primary" weight="700" numberOfLines={1}>
            {categoryLabel}
          </KoolaText>
          <View style={styles.dot} />
          <MaterialIcons name="location-on" size={11} color={koolaColors.muted} />
          <KoolaText variant="caption" tone="muted" weight="500" numberOfLines={1} style={styles.metaText}>
            {business.province}
          </KoolaText>
          {business.connectionCount > 0 ? (
            <>
              <View style={styles.dot} />
              <KoolaText variant="caption" tone="muted" weight="500" numberOfLines={1}>
                {business.connectionCount} kết nối
              </KoolaText>
            </>
          ) : null}
        </View>

        {tagline ? (
          <KoolaText
            variant="caption"
            tone={
              business.description?.trim() || business.tagline?.trim()
                ? 'muted'
                : 'faint'
            }
            numberOfLines={2}
            style={styles.tagline}>
            {tagline}
          </KoolaText>
        ) : null}
      </View>

      <KoolaButton
        title={business.isConnected ? 'Nhắn tin' : 'Kết nối'}
        icon={business.isConnected ? 'chat-bubble-outline' : 'handshake'}
        size="sm"
        loading={isConnecting}
        disabled={isConnecting}
        style={styles.cta}
        onPress={(e) => {
          e.stopPropagation();
          if (business.isConnected) {
            onMessagePress();
          } else {
            onConnectAndChatPress();
          }
        }}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    gap: 10,
    ...koolaShadows.subtle,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: koolaRadii.xs,
  },
  logoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentCol: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    flexShrink: 1,
  },
  tagline: {
    marginTop: 2,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: koolaColors.faint,
    marginHorizontal: 2,
  },
  cta: {
    paddingHorizontal: 10,
    minWidth: 92,
  },
});

export default BusinessCard;
