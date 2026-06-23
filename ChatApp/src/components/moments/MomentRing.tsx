/**
 * MomentRing.tsx
 *
 * Single ring item in the Moments feed — avatar with colored border for unviewed
 * stories (orange), plain border for fully-viewed stories (grey).
 *
 * Note: react-native-linear-gradient is not in package.json, so we use a flat
 * colored border for unviewed rings instead of a gradient.
 */

import React from 'react';
import {
  Pressable,
  View,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../UserAvatar';
import { KoolaText, koolaColors, koolaShadows } from '../../ui';

interface MomentRingProps {
  authorId: string;
  displayName: string;
  avatarKey?: string;
  hasUnviewed: boolean;
  isOwn?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onAddPress?: () => void;
  accessibilityLabel?: string;
}

const RING_SIZE = 64;
const AVATAR_SIZE = 56;
const VIEWED_COLOR = koolaColors.line;

const MomentRing: React.FC<MomentRingProps> = ({
  displayName,
  avatarKey,
  hasUnviewed,
  isOwn = false,
  onPress,
  onLongPress,
  onAddPress,
  accessibilityLabel,
}) => {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        android_ripple={{ color: koolaColors.primarySoft, borderless: true }}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ??
          `${displayName}${hasUnviewed ? ', có khoảnh khắc mới' : ', đã xem'}`
        }
        accessibilityHint={isOwn ? 'Nhấn để xem hoặc tạo khoảnh khắc' : 'Nhấn để xem khoảnh khắc'}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
        <View
          style={[
            styles.ring,
            hasUnviewed ? styles.ringUnviewed : styles.ringViewed,
          ]}>
          <View style={styles.innerGap}>
            <UserAvatar
              displayName={displayName}
              avatar={avatarKey}
              size={AVATAR_SIZE}
            />
          </View>
        </View>
      </Pressable>

      {isOwn && onAddPress && (
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          onPress={onAddPress}
          android_ripple={{ color: koolaColors.primarySoft, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel="Tạo khoảnh khắc mới"
          accessibilityHint="Nhấn để thêm khoảnh khắc">
          <MaterialIcons name="add" size={16} color={koolaColors.surface} />
        </Pressable>
      )}

      <KoolaText
        variant="caption"
        tone={hasUnviewed ? 'ink' : 'muted'}
        weight={hasUnviewed ? '700' : '500'}
        align="center"
        numberOfLines={1}
        style={styles.label}>
        {isOwn ? 'Tôi' : displayName}
      </KoolaText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 78,
  },
  pressable: {
    borderRadius: 999,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  ring: {
    width: RING_SIZE + 8,
    height: RING_SIZE + 8,
    borderRadius: (RING_SIZE + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: koolaColors.surface,
  },
  ringUnviewed: {
    borderColor: koolaColors.warm,
    borderWidth: 3,
    ...koolaShadows.subtle,
  },
  ringViewed: {
    borderColor: VIEWED_COLOR,
    borderWidth: StyleSheet.hairlineWidth,
  },
  innerGap: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: koolaColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: koolaColors.surface,
  },
  addButton: {
    position: 'absolute',
    bottom: 22,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: koolaColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: koolaColors.surface,
    ...koolaShadows.subtle,
  },
  addButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  label: {
    marginTop: 6,
    maxWidth: 74,
  },
});

export default MomentRing;
