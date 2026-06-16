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
  TouchableOpacity,
  View,
  StyleSheet,
  Platform,
} from 'react-native';
import UserAvatar from '../UserAvatar';
import { KoolaText, koolaColors } from '../../ui';

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
const UNVIEWED_COLOR = '#F97316'; // warm orange
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
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ??
          `${displayName}${hasUnviewed ? ', có khoảnh khắc mới' : ', đã xem'}`
        }
        accessibilityHint="Nhấn để xem khoảnh khắc">
        {/* Colored ring border */}
        <View
          style={[
            styles.ring,
            {
              borderColor: hasUnviewed ? UNVIEWED_COLOR : VIEWED_COLOR,
              borderWidth: hasUnviewed ? 2.5 : 1.5,
            },
          ]}>
          {/* White gap between ring and avatar */}
          <View style={styles.innerGap}>
            <UserAvatar
              displayName={displayName}
              avatar={avatarKey}
              size={AVATAR_SIZE}
            />
          </View>
        </View>
      </TouchableOpacity>

      {/* "+" button overlay for own ring item */}
      {isOwn && onAddPress && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Tạo khoảnh khắc mới"
          accessibilityHint="Nhấn để thêm khoảnh khắc">
          <View style={styles.addButtonInner}>
            <KoolaText style={styles.addButtonText} accessibilityElementsHidden>
              +
            </KoolaText>
          </View>
        </TouchableOpacity>
      )}

      <KoolaText
        variant="caption"
        tone="ink"
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
    width: 72,
  },
  ring: {
    width: RING_SIZE + 6,
    height: RING_SIZE + 6,
    borderRadius: (RING_SIZE + 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerGap: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: koolaColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    right: 0,
  },
  addButtonInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: koolaColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: koolaColors.surface,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
    }),
  },
  addButtonText: {
    fontSize: 14,
    lineHeight: 18,
    color: koolaColors.surface,
    fontWeight: '700',
  },
  label: {
    marginTop: 4,
    maxWidth: 68,
  },
});

export default MomentRing;
