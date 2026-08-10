/**
 * PostCard.tsx
 *
 * One post row in the Moments feed (Facebook-style): author header, caption
 * with "Xem thêm" clamp, full-bleed media collage, reaction/comment counts,
 * a 3-up action bar, and a preview of the latest comments.
 *
 * ui-dna compliance notes:
 *   - Content elevation via `surface.level1` + hairline border, NOT `raised`
 *     shadow: v2 is content-first, shadow is reserved for chrome.
 *   - No glass. Glass is chrome-only (dock, composer, sheets, viewers).
 *   - Rows use marginRight spacers, never `gap` (Hermes RN 0.76 row break).
 *   - Every action has press feedback and a >=44px touch target.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from '../UserAvatar';
import PostMediaGrid, { type PostMediaItem } from './PostMediaGrid';
import { KoolaText, koolaRadii, koolaSpacing, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

export type PostAudience = 'public' | 'connections' | 'custom';

export interface FeedPost {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatar?: string;
  /** Pre-formatted relative time, e.g. "2 giờ". */
  timeLabel: string;
  audience: PostAudience;
  caption: string;
  media: PostMediaItem[];
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  /** Whether the viewer has reacted (drives the filled/active Thích state). */
  likedByMe: boolean;
  comments: PostComment[];
}

export interface PostComment {
  id: string;
  authorDisplayName: string;
  authorAvatar?: string;
  content: string;
  timeLabel: string;
}

interface Props {
  post: FeedPost;
  /** Width available to the card's inner content (media is full-bleed). */
  contentWidth: number;
  onToggleLike?: (postId: string) => void;
  onPressComment?: (postId: string) => void;
  onPressShare?: (postId: string) => void;
  onPressMenu?: (postId: string) => void;
  onPressAuthor?: (authorId: string) => void;
  onPressMedia?: (postId: string, index: number) => void;
}

const CAPTION_CLAMP_LINES = 6;

/**
 * Glyph color inside the small reaction chips. The chip fill is always a
 * saturated action/danger color in both schemes, so the glyph stays a fixed
 * white rather than a theme text token (which would invert and vanish).
 */
const ON_CHIP_FG = 'rgb(255,255,255)';

const AUDIENCE_ICON: Record<PostAudience, string> = {
  public: 'public',
  connections: 'people',
  custom: 'lock',
};

/** Compact count formatter: 1200 -> "1,2K". */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k.toFixed(k < 10 ? 1 : 0).replace('.', ',')}K`;
}

const ActionButton: React.FC<{
  icon: string;
  label: string;
  active?: boolean;
  onPress?: () => void;
  semantic: SemanticTokens;
}> = ({ icon, label, active, onPress, semantic }) => {
  const styles = useMemo(() => makeStyles(semantic), [semantic]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      android_ripple={{ color: semantic.action.primarySoft, borderless: false }}
      style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
      <MaterialIcons
        name={icon}
        size={20}
        color={active ? semantic.action.primary : semantic.text.muted}
      />
      <KoolaText
        variant="label"
        weight={active ? '700' : '600'}
        tone={active ? 'primary' : 'muted'}
        style={styles.actionLabel}
        numberOfLines={1}>
        {label}
      </KoolaText>
    </Pressable>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      marginBottom: koolaSpacing.md,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: koolaSpacing.md,
      paddingTop: koolaSpacing.md,
      paddingBottom: koolaSpacing.sm,
    },
    headerIdentity: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: koolaRadii.sm,
    },
    headerText: {
      flex: 1,
      marginLeft: koolaSpacing.sm,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 1,
    },
    metaDot: {
      marginHorizontal: 4,
    },
    menuBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: koolaSpacing.xs,
      flexShrink: 0,
    },
    pressedSoft: {
      opacity: 0.7,
    },
    captionWrap: {
      paddingHorizontal: koolaSpacing.md,
      paddingBottom: koolaSpacing.sm,
    },
    moreLink: {
      marginTop: 2,
      alignSelf: 'flex-start',
      minHeight: 24,
      justifyContent: 'center',
    },
    countsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: koolaSpacing.md,
      paddingTop: koolaSpacing.sm,
      paddingBottom: koolaSpacing.xs,
    },
    countsSpacer: {
      flex: 1,
    },
    reactionCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
    },
    reactionChip: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: semantic.surface.level1,
    },
    reactionChipLike: {
      backgroundColor: semantic.action.primary,
    },
    reactionChipLove: {
      backgroundColor: semantic.status.danger,
      marginLeft: -6,
    },
    countText: {
      marginLeft: 6,
    },
    shareCount: {
      marginLeft: 4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: semantic.border.subtle,
      marginHorizontal: koolaSpacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      paddingHorizontal: koolaSpacing.xs,
      paddingVertical: 2,
    },
    actionBtn: {
      flex: 1,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: koolaRadii.sm,
    },
    actionBtnPressed: {
      opacity: 0.7,
    },
    actionLabel: {
      marginLeft: 6,
    },
    commentsWrap: {
      paddingHorizontal: koolaSpacing.md,
      paddingBottom: koolaSpacing.md,
      paddingTop: koolaSpacing.xs,
    },
    commentRow: {
      flexDirection: 'row',
      marginTop: koolaSpacing.sm,
    },
    commentBody: {
      flex: 1,
      marginLeft: koolaSpacing.sm,
    },
    commentBubble: {
      backgroundColor: semantic.surface.level0,
      borderRadius: koolaRadii.md,
      paddingHorizontal: koolaSpacing.sm,
      paddingVertical: 6,
      alignSelf: 'flex-start',
    },
    commentText: {
      marginTop: 1,
    },
    commentMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      marginLeft: koolaSpacing.sm,
    },
    commentMetaItem: {
      marginLeft: koolaSpacing.md,
    },
    allCommentsBtn: {
      marginTop: koolaSpacing.sm,
      minHeight: 32,
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
  });

const PostCard: React.FC<Props> = ({
  post,
  contentWidth,
  onToggleLike,
  onPressComment,
  onPressShare,
  onPressMenu,
  onPressAuthor,
  onPressMedia,
}) => {
  const { tokens } = useTheme();
  const semantic = tokens.semantic;
  const styles = useMemo(() => makeStyles(semantic), [semantic]);

  const [expanded, setExpanded] = useState(false);
  // Only offer "Xem thêm" once RN reports the text actually clipped.
  const [clamped, setClamped] = useState(false);

  const onCaptionLayout = useCallback(
    (e: { nativeEvent: { lines: unknown[] } }) => {
      if (!expanded && e.nativeEvent.lines.length >= CAPTION_CLAMP_LINES) {
        setClamped(true);
      }
    },
    [expanded],
  );

  const hasCounts = post.reactionCount > 0 || post.commentCount > 0 || post.shareCount > 0;

  return (
    <View style={styles.card} accessibilityLabel={`Bài viết của ${post.authorDisplayName}`}>
      {/* ── Author header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => onPressAuthor?.(post.authorId)}
          accessibilityRole="button"
          accessibilityLabel={`Xem trang cá nhân ${post.authorDisplayName}`}
          android_ripple={{ color: semantic.action.primarySoft, borderless: true }}
          style={({ pressed }) => [styles.headerIdentity, pressed && styles.pressedSoft]}>
          <UserAvatar
            displayName={post.authorDisplayName}
            avatar={post.authorAvatar}
            size={40}
          />
          <View style={styles.headerText}>
            <KoolaText variant="label" weight="700" numberOfLines={1}>
              {post.authorDisplayName}
            </KoolaText>
            <View style={styles.metaRow}>
              <KoolaText variant="caption" tone="muted">
                {post.timeLabel}
              </KoolaText>
              <KoolaText variant="caption" tone="faint" style={styles.metaDot}>
                ·
              </KoolaText>
              <MaterialIcons
                name={AUDIENCE_ICON[post.audience]}
                size={12}
                color={semantic.text.faint}
              />
            </View>
          </View>
        </Pressable>

        <Pressable
          onPress={() => onPressMenu?.(post.id)}
          accessibilityRole="button"
          accessibilityLabel="Tùy chọn bài viết"
          android_ripple={{ color: semantic.action.primarySoft, borderless: true }}
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressedSoft]}>
          <MaterialIcons name="more-horiz" size={22} color={semantic.text.muted} />
        </Pressable>
      </View>

      {/* ── Caption ───────────────────────────────────────────────────────── */}
      {post.caption.length > 0 && (
        <View style={styles.captionWrap}>
          <KoolaText
            variant="body"
            numberOfLines={expanded ? undefined : CAPTION_CLAMP_LINES}
            onTextLayout={onCaptionLayout}>
            {post.caption}
          </KoolaText>
          {clamped && !expanded && (
            <Pressable
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Xem thêm nội dung bài viết"
              style={({ pressed }) => [styles.moreLink, pressed && styles.pressedSoft]}>
              <KoolaText variant="label" tone="muted" weight="600">
                Xem thêm
              </KoolaText>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Media (full-bleed) ────────────────────────────────────────────── */}
      <PostMediaGrid
        items={post.media}
        width={contentWidth}
        onPressItem={(i) => onPressMedia?.(post.id, i)}
      />

      {/* ── Counts ────────────────────────────────────────────────────────── */}
      {hasCounts && (
        <View style={styles.countsRow}>
          {post.reactionCount > 0 && (
            <View style={styles.reactionCluster}>
              <View style={[styles.reactionChip, styles.reactionChipLike]}>
                <MaterialIcons name="thumb-up" size={10} color={ON_CHIP_FG} />
              </View>
              <View style={[styles.reactionChip, styles.reactionChipLove]}>
                <MaterialIcons name="favorite" size={10} color={ON_CHIP_FG} />
              </View>
              <KoolaText variant="caption" tone="muted" style={styles.countText}>
                {formatCount(post.reactionCount)}
              </KoolaText>
            </View>
          )}
          <View style={styles.countsSpacer} />
          {post.commentCount > 0 && (
            <KoolaText variant="caption" tone="muted">
              {formatCount(post.commentCount)} bình luận
            </KoolaText>
          )}
          {post.shareCount > 0 && (
            <KoolaText variant="caption" tone="muted" style={styles.shareCount}>
              · {formatCount(post.shareCount)} chia sẻ
            </KoolaText>
          )}
        </View>
      )}

      <View style={styles.divider} />

      {/* ── Action bar ────────────────────────────────────────────────────── */}
      <View style={styles.actionRow}>
        <ActionButton
          semantic={semantic}
          icon={post.likedByMe ? 'thumb-up' : 'thumb-up-off-alt'}
          label="Thích"
          active={post.likedByMe}
          onPress={() => onToggleLike?.(post.id)}
        />
        <ActionButton
          semantic={semantic}
          icon="chat-bubble-outline"
          label="Bình luận"
          onPress={() => onPressComment?.(post.id)}
        />
        <ActionButton
          semantic={semantic}
          icon="share"
          label="Chia sẻ"
          onPress={() => onPressShare?.(post.id)}
        />
      </View>

      {/* ── Comment preview ──────────────────────────────────────────────── */}
      {post.comments.length > 0 && (
        <View style={styles.commentsWrap}>
          {post.comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <UserAvatar
                displayName={c.authorDisplayName}
                avatar={c.authorAvatar}
                size={28}
              />
              <View style={styles.commentBody}>
                <View style={styles.commentBubble}>
                  <KoolaText variant="caption" weight="700" numberOfLines={1}>
                    {c.authorDisplayName}
                  </KoolaText>
                  <KoolaText variant="body" style={styles.commentText}>
                    {c.content}
                  </KoolaText>
                </View>
                <View style={styles.commentMetaRow}>
                  <KoolaText variant="caption" tone="muted" weight="600">
                    Thích
                  </KoolaText>
                  <KoolaText variant="caption" tone="muted" weight="600" style={styles.commentMetaItem}>
                    Trả lời
                  </KoolaText>
                  <KoolaText variant="caption" tone="faint" style={styles.commentMetaItem}>
                    {c.timeLabel}
                  </KoolaText>
                </View>
              </View>
            </View>
          ))}

          {post.commentCount > post.comments.length && (
            <Pressable
              onPress={() => onPressComment?.(post.id)}
              accessibilityRole="button"
              accessibilityLabel={`Xem tất cả ${post.commentCount} bình luận`}
              style={({ pressed }) => [styles.allCommentsBtn, pressed && styles.pressedSoft]}>
              <KoolaText variant="label" tone="muted" weight="600">
                Xem tất cả {formatCount(post.commentCount)} bình luận
              </KoolaText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

export default PostCard;


