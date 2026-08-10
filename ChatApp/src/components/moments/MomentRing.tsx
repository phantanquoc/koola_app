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
      {/* Fixed-size slot: the "+" badge anchors to the RING, not to the tile.
          Anchoring to the tile made the badge drift off-avatar whenever the
          label grew (font scaling), which read as a missing button. */}
      <View style={styles.ringSlot}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          android_ripple={{ color: palette.primarySoft, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel={
            accessibilityLabel ??
            `${displayName}${hasUnviewed ? ', có khoảnh khắc mới' : ', đã xem'}`
          }
          accessibilityHint={
            isOwn ? 'Nhấn để xem hoặc tạo khoảnh khắc' : 'Nhấn để xem khoảnh khắc'
          }
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
                // Seen state was hairlineWidth — sub-pixel on most densities, so
                // the tile read as a bare avatar. 2px is visible but still clearly
                // subordinate to the 3px gradient (unseen keeps the gradient rule).
                strokeWidth={hasUnviewed ? STROKE_WIDTH : 2}
                fill="none"
              />
            </Svg>
            {/* Inner white gap + avatar centered on top of SVG */}
            <View style={styles.innerGap}>
              <UserAvatar displayName={displayName} avatar={avatarKey} size={AVATAR_SIZE} />
            </View>
          </View>
        </Pressable>

        {isOwn && onAddPress && (
          // Position/size live on this View. Pressable's style-as-function form
          // drops layout props on this RN version — measured on device, the badge
          // rendered as a full-width 17dp strip below the ring instead of a
          // 24dp circle on the avatar edge.
          <View style={styles.addButton}>
            <Pressable
              style={({ pressed }) => [
                styles.addButtonPress,
                pressed && styles.addButtonPressed,
              ]}
              onPress={onAddPress}
              android_ripple={{ color: palette.primarySoft, borderless: true }}
              accessibilityRole="button"
              accessibilityLabel="Tạo khoảnh khắc mới"
              accessibilityHint="Nhấn để thêm khoảnh khắc">
              <MaterialIcons name="add" size={16} color={palette.surface} />
            </Pressable>
          </View>
        )}
      </View>

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
    ringSlot: {
      width: SVG_SIZE,
      height: SVG_SIZE,
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
      // Anchored to ringSlot (SVG_SIZE box), so it stays on the avatar edge
      // regardless of label height / font scale. Fill + border live here, not
      // on the Pressable: Android swaps a Pressable's own background for its
      // ripple drawable when android_ripple is set, so a fill there never paints.
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: palette.primary,
      borderWidth: 2,
      borderColor: palette.surface,
      overflow: 'hidden',
    },
    addButtonPress: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.96 }],
    },
    label: {
      marginTop: 6,
      maxWidth: 74,
      // minHeight (not a fixed height) reserves the line box so tiles share a
      // baseline, without clipping Vietnamese diacritics when text scales up.
      // numberOfLines={1} keeps every label one line, so they stay aligned.
      minHeight: 16,
    },
  });

export default MomentRing;
