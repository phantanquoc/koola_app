/**
 * MomentsFeedHeader.tsx
 *
 * `ListHeaderComponent` for the Moments feed: composer prompt row, three
 * quick-action shortcuts, and the story ring rail.
 *
 * The ring rail is deliberately full-bleed (edge to edge, no card) so the feed
 * reads as one continuous column instead of a stack of floating cards.
 *
 * ui-dna: rows use marginRight spacers, never `gap`. No glass on content.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../UserAvatar';
import MomentRing from './MomentRing';
import { KoolaSkeleton, KoolaText, koolaRadii, koolaSpacing, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import type { SemanticTokens } from '../../ui/tokens/semantic';

export interface FeedHeaderRing {
  authorId: string;
  displayName: string;
  avatarKey?: string;
  hasUnviewed: boolean;
  isOwn: boolean;
}

interface QuickAction {
  key: string;
  icon: string;
  label: string;
  /** Palette key for the icon tint — resolved per scheme at render. */
  tintKey: keyof Palette;
  /** Palette key for the icon shell fill. */
  shellKey: keyof Palette;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    key: 'media',
    icon: 'photo-library',
    label: 'Ảnh/video',
    tintKey: 'accent',
    shellKey: 'accentSoft',
  },
  {
    key: 'music',
    icon: 'music-note',
    label: 'Nhạc',
    tintKey: 'primary',
    shellKey: 'primarySoft',
  },
  {
    key: 'highlight',
    icon: 'auto-awesome',
    label: 'Nổi bật',
    tintKey: 'warm',
    shellKey: 'warningSoft',
  },
];

/** Gap between quick-action cells. Applied as marginRight, never `gap`. */
const QUICK_ACTION_GAP = koolaSpacing.sm;
/** Floor so the row stays usable on very narrow screens. */
const MIN_QUICK_ACTION_WIDTH = 72;

interface Props {
  myDisplayName: string;
  myAvatar?: string;
  rings: FeedHeaderRing[];
  /** Cold-load state of the story rail — renders in-place skeleton rings. */
  railLoading?: boolean;
  onPressComposer?: () => void;
  onPressQuickAction?: (key: string) => void;
  onPressRing?: (authorId: string) => void;
  onLongPressOwnRing?: () => void;
  onPressAddStory?: () => void;
}

const MomentsFeedHeader: React.FC<Props> = ({
  myDisplayName,
  myAvatar,
  rings,
  railLoading,
  onPressComposer,
  onPressQuickAction,
  onPressRing,
  onLongPressOwnRing,
  onPressAddStory,
}) => {
  const { tokens, palette } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const { width: windowWidth } = useWindowDimensions();

  // Cell width is computed, not flexed. Measured on device (uiautomator): the
  // flex-sized version collapsed to content width with no gap and stacked the
  // label under the icon — the RN 0.76/Hermes row-break documented in ui-dna.
  // An explicit width is deterministic and cannot silently degrade.
  const [rowWidth, setRowWidth] = useState(0);
  const onRowLayout = useCallback((e: LayoutChangeEvent) => {
    // Measured width INCLUDES the row's own paddingHorizontal (measured on
    // device: cells sized from it overflowed the right gutter, clipping the
    // last tile's corner). Cells must fit inside the padded content box.
    const w = e.nativeEvent.layout.width - koolaSpacing.lg * 2;
    setRowWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
  }, []);

  // First-paint estimate keeps the row correct before onLayout fires. The feed
  // is now full-bleed (no page gutter), so only this row's own padding remains
  // to subtract from the screen width.
  const fallbackRowWidth = windowWidth - koolaSpacing.lg * 2;
  const effectiveRowWidth = rowWidth > 0 ? rowWidth : Math.max(fallbackRowWidth, 0);
  const gapTotal = QUICK_ACTION_GAP * (QUICK_ACTIONS.length - 1);
  const cellWidth = Math.max(
    (effectiveRowWidth - gapTotal) / QUICK_ACTIONS.length,
    MIN_QUICK_ACTION_WIDTH,
  );

  return (
    <View style={styles.container}>
      {/* Row direction lives on this View, not on the Pressable. Pressable's
          style-as-function form drops layout props on this RN version (measured:
          the row rendered as a column, avatar stacked above the input). */}
      <View style={styles.composerRow}>
        <UserAvatar displayName={myDisplayName} avatar={myAvatar} size={40} />
        {/* Sizing box outside the Pressable — layout props set directly on a
            Pressable are dropped on this RN version (verified on device). */}
        <View style={styles.composerInputSlot}>
          <Pressable
            onPress={onPressComposer}
            accessibilityRole="button"
            accessibilityLabel="Bạn đang nghĩ gì?"
            accessibilityHint="Mở trình tạo khoảnh khắc"
            android_ripple={{ color: palette.primarySoft }}
            style={({ pressed }) => [styles.composerFakeInput, pressed && styles.pressed]}>
            <KoolaText variant="body" tone="muted">
              Hôm nay bạn thế nào?
            </KoolaText>
          </Pressable>
        </View>
      </View>

      <View style={styles.quickActionsRow} onLayout={onRowLayout}>
        {QUICK_ACTIONS.map((action, index) => (
          <View
            key={action.key}
            // Width / minHeight / bg / radius / overflow live on this plain
            // View. On RN 0.76 the Pressable style-as-function form silently
            // drops layout props (documented in ui-dna): a row layout placed
            // directly on the Pressable rendered as a column and stacked the
            // label under the icon. Keeping the sizing box here is deterministic.
            style={[
              styles.quickActionSlot,
              {
                width: cellWidth,
                marginRight: index === QUICK_ACTIONS.length - 1 ? 0 : QUICK_ACTION_GAP,
              },
            ]}>
          <Pressable
            onPress={() => onPressQuickAction?.(action.key)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            android_ripple={{ color: palette.primarySoft }}
            // Pressable carries ONLY press feedback (opacity). Stretches full
            // slot width because the slot View is column + alignItems stretch.
            style={({ pressed }) => [pressed && styles.pressed]}>
            {/* Row layout lives on this inner View, not on the Pressable. */}
            <View style={styles.quickActionContent}>
              <View
                style={[
                  styles.quickActionIconShell,
                  { backgroundColor: palette[action.shellKey] },
                ]}>
                <MaterialIcons name={action.icon} size={16} color={palette[action.tintKey]} />
              </View>
              <KoolaText
                variant="label"
                tone="ink"
                numberOfLines={1}
                // Row is a hard single-line layout in a ~107dp cell; the 1.6 variant
                // cap overflows it and collides with the neighbouring label.
                maxFontSizeMultiplier={1.2}
                style={styles.quickActionLabel}>
                {action.label}
              </KoolaText>
            </View>
          </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      {/* In-place skeleton rings during cold load (2026-08-13 jump fix): they
          replace the removed "Đang tải khoảnh khắc" banner in MomentsScreen,
          whose insert/remove made the feed jump. Metrics mirror MomentRing
          exactly (container 78+6, ring 72, label marginTop 6 / minHeight 16)
          so the rail height is identical before and after loading settles. */}
      {railLoading && rings.length === 0 ? (
        <View
          style={styles.railSkeletonRow}
          accessibilityLabel="Đang tải khoảnh khắc"
          accessibilityRole="progressbar">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.railSkeletonItem}>
              <KoolaSkeleton width={72} height={72} radius={36} />
              <KoolaSkeleton
                width={48}
                height={16}
                radius={6}
                style={styles.railSkeletonLabel}
              />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={rings}
          keyExtractor={(item) => item.authorId}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.ringList}
          renderItem={({ item }) => (
            <MomentRing
              authorId={item.authorId}
              displayName={item.displayName}
              avatarKey={item.avatarKey}
              hasUnviewed={item.hasUnviewed}
              isOwn={item.isOwn}
              onPress={() => onPressRing?.(item.authorId)}
              onLongPress={item.isOwn ? onLongPressOwnRing : undefined}
              onAddPress={item.isOwn ? onPressAddStory : undefined}
            />
          )}
          accessibilityRole="list"
          accessibilityLabel="Danh sách người dùng có khoảnh khắc"
        />
      )}

      <View style={styles.dividerThick} />
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      backgroundColor: semantic.surface.level1,
      paddingTop: koolaSpacing.md,
    },
    composerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: koolaSpacing.lg,
      paddingBottom: koolaSpacing.md,
    },
    composerInputSlot: {
      flex: 1,
      marginLeft: koolaSpacing.sm,
    },
    pressed: {
      opacity: 0.82,
    },
    composerFakeInput: {
      minHeight: 44,
      borderRadius: koolaRadii.pill,
      backgroundColor: semantic.surface.level0,
      justifyContent: 'center',
      paddingHorizontal: koolaSpacing.lg,
    },
    quickActionsRow: {
      flexDirection: 'row',
      paddingHorizontal: koolaSpacing.lg,
      paddingBottom: koolaSpacing.md,
    },
    quickActionSlot: {
      // backgroundColor + borderRadius live here, not on the Pressable: Android
      // replaces a Pressable's own background with its ripple drawable when
      // android_ripple is set, so a fill on the Pressable itself never painted.
      minHeight: 44,
      borderRadius: koolaRadii.sm,
      backgroundColor: semantic.surface.level0,
      overflow: 'hidden',
    },
    quickActionContent: {
      // Row layout lives on a plain View INSIDE the Pressable — on RN 0.76 the
      // Pressable style-as-function form drops layout props (ui-dna), so any
      // flexDirection set directly on the Pressable degraded to a column.
      // minHeight keeps the >=44dp touch target regardless of the Pressable's
      // own (unreliable) sizing.
      // paddingHorizontal is a tight 2 (not xs/4): after the measured width was
      // corrected to exclude the row's own padding, cells lost ~10dp each and
      // the longest label ("Ảnh/video") ellipsized at the 1.2 font-scale cap on
      // a 360dp screen — every dp inside the cell goes to the label.
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    quickActionLabel: {
      // Without this the Text refuses to shrink and spills past the cell.
      flexShrink: 1,
      minWidth: 0,
    },
    quickActionIconShell: {
      width: 24,
      height: 24,
      borderRadius: koolaRadii.xs,
      alignItems: 'center',
      justifyContent: 'center',
      // Tight 2dp spacer (not xs/4) — same label-space reclamation as above.
      marginRight: 2,
      flexShrink: 0,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: semantic.border.subtle,
      marginHorizontal: koolaSpacing.lg,
    },
    ringList: {
      paddingHorizontal: koolaSpacing.sm,
      paddingVertical: koolaSpacing.md,
    },
    // Cold-load skeleton rail — same chrome as the FlatList contentContainer
    // (ringList padding) + a plain row, so switching to real rings never shifts.
    railSkeletonRow: {
      flexDirection: 'row',
      paddingHorizontal: koolaSpacing.sm,
      paddingVertical: koolaSpacing.md,
    },
    // Mirrors MomentRing's container exactly (width 78 + marginHorizontal 6).
    railSkeletonItem: {
      width: 78,
      marginHorizontal: 6,
      alignItems: 'center',
    },
    // Mirrors MomentRing's label box exactly: marginTop 6 + minHeight 16.
    railSkeletonLabel: {
      marginTop: 6,
      minHeight: 16,
    },
    dividerThick: {
      height: 8,
      backgroundColor: semantic.surface.level0,
    },
  });

export default MomentsFeedHeader;
