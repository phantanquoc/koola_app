/**
 * MomentRing.tsx
 *
 * Single ring item in the Moments feed — avatar with gradient stroke for unviewed
 * stories (warm multi-stop), muted stroke for fully-viewed stories.
 *
 * Uses react-native-svg (Defs + LinearGradient + Circle) for the gradient ring,
 * mirroring the faux-blur technique used in MainNavigator. No new dependency.
 */

import React, { useMemo } from 'react';
import {
  Pressable,
  View,
  StyleSheet,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../UserAvatar';
import { KoolaText, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';

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
const STROKE_WIDTH = 3;
const SVG_SIZE = RING_SIZE + 8;
const RADIUS = (SVG_SIZE - STROKE_WIDTH) / 2;

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
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        android_ripple={{ color: palette.primarySoft, borderless: true }}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ??
          `${displayName}${hasUnviewed ? ', có khoảnh khắc mới' : ', đã xem'}`
        }
        accessibilityHint={isOwn ? 'Nhấn để xem hoặc tạo khoảnh khắc' : 'Nhấn để xem khoảnh khắc'}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
        <View style={styles.ringOuter}>
          {/* SVG gradient ring for unseen; muted stroke for seen */}
          <Svg width={SVG_SIZE} height={SVG_SIZE} style={styles.ringSvg}>
            {hasUnviewed && (
              <Defs>
                <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#F97316" />
                  <Stop offset="0.4" stopColor="#EC4899" />
                  <Stop offset="0.7" stopColor="#8B5CF6" />
                  <Stop offset="1" stopColor="#2563EB" />
                </SvgLinearGradient>
              </Defs>
            )}
            <Circle
              cx={SVG_SIZE / 2}
              cy={SVG_SIZE / 2}
              r={RADIUS}
              stroke={hasUnviewed ? 'url(#ringGrad)' : palette.line}
              strokeWidth={hasUnviewed ? STROKE_WIDTH : StyleSheet.hairlineWidth}
              fill="none"
            />
          </Svg>
          {/* Inner white gap + avatar centered on top of SVG */}
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
          android_ripple={{ color: palette.primarySoft, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel="Tạo khoảnh khắc mới"
          accessibilityHint="Nhấn để thêm khoảnh khắc">
          <MaterialIcons name="add" size={16} color={palette.surface} />
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
const makeStyles = (palette: Palette) =>
  StyleSheet.create({
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
    ringOuter: {
      width: SVG_SIZE,
      height: SVG_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringSvg: {
      position: 'absolute',
    },
    innerGap: {
      width: RING_SIZE,
      height: RING_SIZE,
      borderRadius: RING_SIZE / 2,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: palette.surface,
    },
    addButton: {
      position: 'absolute',
      bottom: 22,
      right: 2,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: palette.surface,
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
