/**
 * PostMediaGrid.tsx
 *
 * Facebook-style media collage for a Moments post (1 / 2 / 3 / 4+ tiles).
 *
 * Layout rules (ui-dna): no `gap` in row containers — explicit tile widths plus
 * `marginRight` only, because Hermes on RN 0.76 silently breaks rows that mix
 * `gap` with `flex:1` children.
 *
 * A tile renders from `mediaKey` (production — goes through the MinIO media
 * cache via MediaImage) or from `uri` (already-resolved remote/local source,
 * used by the dev lab). Unresolvable tiles fall back to a neutral block so the
 * collage never collapses to zero height.
 */

import React, { useMemo, useState } from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MediaImage from '../MediaImage';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

export interface PostMediaItem {
  /** MinIO object key — resolved through the media cache. */
  mediaKey?: string;
  /** Already-resolved URI (http/https/file/data). Wins over mediaKey. */
  uri?: string;
  mediaType: 'image' | 'video';
  /** Intrinsic size, when known — drives the single-tile aspect ratio. */
  width?: number;
  height?: number;
  /** Video length in seconds — rendered as a duration pill. */
  duration?: number;
}

interface Props {
  items: PostMediaItem[];
  /** Full width available to the collage (card width, media is full-bleed). */
  width: number;
  onPressItem?: (index: number) => void;
}

const GUTTER = 2;
/** Clamp for single-tile aspect so portrait media can't eat the whole screen. */
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.35;

/**
 * Foreground for badges that sit on a dark media scrim (play button, duration
 * pill, "+N" overlay). Deliberately a fixed white in BOTH schemes: the scrim
 * underneath is always dark, so this is content contrast rather than a theme
 * surface — `text.onAction`/`palette.surface` would invert and go unreadable
 * in dark mode.
 */
const ON_SCRIM_FG = 'rgb(255,255,255)';
/** Scrim fills, dark in both schemes for the same reason. */
const SCRIM_STRONG = 'rgba(16,24,40,0.7)';
const SCRIM_MEDIUM = 'rgba(16,24,40,0.55)';
const SCRIM_SOFT = 'rgba(16,24,40,0.5)';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** One tile. Chooses cache-backed MediaImage vs direct Image by source kind. */
const Tile: React.FC<{
  item: PostMediaItem;
  width: number;
  height: number;
  overlayCount?: number;
  onPress?: () => void;
  semantic: SemanticTokens;
}> = ({ item, width, height, overlayCount, onPress, semantic }) => {
  const [failed, setFailed] = useState(false);
  const styles = useMemo(() => makeStyles(semantic), [semantic]);

  const body = (() => {
    if (item.uri && !failed) {
      return (
        <Image
          source={{ uri: item.uri }}
          style={{ width, height }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      );
    }
    if (item.mediaKey && !failed) {
      return (
        <MediaImage
          mediaKey={item.mediaKey}
          imageWidth={item.width}
          imageHeight={item.height}
        />
      );
    }
    return (
      <View style={[styles.fallback, { width, height }]}>
        <MaterialIcons
          name={item.mediaType === 'video' ? 'movie' : 'image'}
          size={28}
          color={semantic.text.faint}
        />
      </View>
    );
  })();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={
        item.mediaType === 'video' ? 'Xem video trong bài viết' : 'Xem ảnh trong bài viết'
      }
      style={({ pressed }) => [
        styles.tile,
        { width, height },
        pressed && styles.tilePressed,
      ]}>
      {body}

      {item.mediaType === 'video' && (
        <View style={styles.playBadge} pointerEvents="none">
          <MaterialIcons name="play-arrow" size={26} color={ON_SCRIM_FG} />
        </View>
      )}

      {item.mediaType === 'video' && item.duration != null && (
        <View style={styles.durationPill} pointerEvents="none">
          <KoolaText variant="caption" weight="600" style={styles.onMediaText}>
            {formatDuration(item.duration)}
          </KoolaText>
        </View>
      )}

      {overlayCount != null && overlayCount > 0 && (
        <View style={styles.moreOverlay} pointerEvents="none">
          <KoolaText variant="heading" weight="700" style={styles.onMediaText}>
            +{overlayCount}
          </KoolaText>
        </View>
      )}
    </Pressable>
  );
};

const PostMediaGrid: React.FC<Props> = ({ items, width, onPressItem }) => {
  const { tokens } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(() => makeStyles(semantic), [semantic]);

  if (items.length === 0) return null;

  const press = (i: number) => (onPressItem ? () => onPressItem(i) : undefined);
  const shared = { semantic };

  // ── 1 tile: intrinsic aspect, clamped ──────────────────────────────────────
  if (items.length === 1) {
    const it = items[0];
    const raw = it.width && it.height ? it.height / it.width : 0.75;
    const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, raw));
    return (
      <View style={styles.wrap}>
        <Tile {...shared} item={it} width={width} height={Math.round(width * ratio)} onPress={press(0)} />
      </View>
    );
  }

  // ── 2 tiles: side by side, square-ish ──────────────────────────────────────
  if (items.length === 2) {
    const w = Math.floor((width - GUTTER) / 2);
    const h = Math.round(width * 0.62);
    return (
      <View style={[styles.wrap, styles.row]}>
        <Tile {...shared} item={items[0]} width={w} height={h} onPress={press(0)} />
        <View style={styles.gutter} />
        <Tile {...shared} item={items[1]} width={width - w - GUTTER} height={h} onPress={press(1)} />
      </View>
    );
  }

  // ── 3 tiles: hero left, two stacked right ──────────────────────────────────
  if (items.length === 3) {
    const heroW = Math.floor((width - GUTTER) * 0.66);
    const sideW = width - heroW - GUTTER;
    const totalH = Math.round(width * 0.7);
    const sideH = Math.floor((totalH - GUTTER) / 2);
    return (
      <View style={[styles.wrap, styles.row]}>
        <Tile {...shared} item={items[0]} width={heroW} height={totalH} onPress={press(0)} />
        <View style={styles.gutter} />
        <View style={styles.sideColumn}>
          <Tile {...shared} item={items[1]} width={sideW} height={sideH} onPress={press(1)} />
          <View style={styles.gutterV} />
          <Tile {...shared} item={items[2]} width={sideW} height={totalH - sideH - GUTTER} onPress={press(2)} />
        </View>
      </View>
    );
  }

  // ── 4+ tiles: 2x2, overflow count on the last tile ─────────────────────────
  const half = Math.floor((width - GUTTER) / 2);
  const rest = width - half - GUTTER;
  const cellH = Math.round(width * 0.42);
  const overflow = items.length - 4;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Tile {...shared} item={items[0]} width={half} height={cellH} onPress={press(0)} />
        <View style={styles.gutter} />
        <Tile {...shared} item={items[1]} width={rest} height={cellH} onPress={press(1)} />
      </View>
      <View style={styles.gutterV} />
      <View style={styles.row}>
        <Tile {...shared} item={items[2]} width={half} height={cellH} onPress={press(2)} />
        <View style={styles.gutter} />
        <Tile
          {...shared}
          item={items[3]}
          width={rest}
          height={cellH}
          overlayCount={overflow > 0 ? overflow : undefined}
          onPress={press(3)}
        />
      </View>
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: semantic.surface.level0,
    },
    row: {
      flexDirection: 'row',
    },
    // Fixed-width spacers instead of `gap` — see header note.
    gutter: {
      width: GUTTER,
      flexShrink: 0,
    },
    gutterV: {
      height: GUTTER,
    },
    sideColumn: {
      flexShrink: 0,
    },
    tile: {
      overflow: 'hidden',
      backgroundColor: semantic.surface.level0,
    },
    tilePressed: {
      opacity: 0.9,
    },
    fallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level0,
    },
    playBadge: {
      position: 'absolute',
      alignSelf: 'center',
      top: '50%',
      marginTop: -21,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: SCRIM_MEDIUM,
    },
    durationPill: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: SCRIM_STRONG,
    },
    moreOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: SCRIM_SOFT,
    },
    onMediaText: {
      color: ON_SCRIM_FG,
    },
  });

export default PostMediaGrid;


