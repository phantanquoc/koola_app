/**
 * momentsService.ts
 *
 * Singleton service for Moments (Khoảnh khắc) feature.
 * Follows the existing socketService / apiService singleton pattern.
 *
 * Holds:
 *   - feedRing: { authorId, lastStoryId, hasUnviewed }[] — shown as avatar ring in feed
 *   - storiesByAuthor: Map<authorId, Story[]> — full story list per author
 *   - viewerCount: Map<storyId, number> — cached view counts
 *   - highlights: Map<userId, Highlight[]> — per-user highlight list
 *
 * State updates:
 *   - REST fetch → service → React subscribers via lightweight pub/sub
 *   - Socket events via handleEvent() (called by socketEventRouter)
 *   - AppState foreground → refreshFeed()
 */

import NetInfo from '@react-native-community/netinfo';
import {
  storiesApi,
  viewsApi,
  reactionsApi,
  commentsApi,
  highlightsApi,
  audienceListsApi,
  musicApi,
  type Story,
  type FeedItem,
  type Highlight,
  type AudienceList,
  type MusicTrack,
} from './momentsApi';
import {
  postsApi,
  type PostView,
  type PostCommentView,
} from './postsApi';
import type { FeedPost } from '../../components/moments/PostCard';

/**
 * Single source of truth for a post id. Reads `id` first, falls back to `_id`.
 * Lives here (not in postsApi) so the narrow re-export/import path used by the
 * socket router never widens. An id that resolves to null breaks
 * like/comment/share and collides as a FlatList key.
 */
function resolvePost(props: { _id?: unknown; id?: unknown }): string | null {
  const id = props.id ?? props._id;
  return id != null && id !== '' ? String(id) : null;
}

import { generateClientId } from '../../utils/clientId';
import * as outboxRepository from '../db/outboxRepository';
import type { CreatePostPayloadV1 } from '../db/outboxRepository';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedRingItem {
  authorId: string;
  lastStoryId: string;
  hasUnviewed: boolean;
  authorDisplayName: string;
  authorAvatar: string | null;
}

export interface MomentsState {
  feedRing: FeedRingItem[];
  storiesByAuthor: Map<string, Story[]>;
  viewerCount: Map<string, number>;
  highlights: Map<string, Highlight[]>;
  isLoading: boolean;
  error: string | null;
  // ─── Posts ───
  postsById: Map<string, PostView>;
  feedIds: string[];
  postsCursor: string | null;
  isLoadingPosts: boolean;
  postsError: string | null;
}

export type MomentsEvent =
  | { type: 'story.new'; storyId: string; authorId: string; mediaType: string; audienceScope?: string; createdAt: string }
  | { type: 'story.deleted'; storyId: string; authorId: string }
  | { type: 'story.mention'; storyId: string; authorId: string; captionSnippet: string }
  | { type: 'story.reaction'; storyId: string; viewerId: string; emoji: string; action?: 'add' | 'remove' }
  | { type: 'post.new'; postId: string; authorId: string; createdAt: string }
  | { type: 'post.deleted'; postId: string; authorId: string }
  | { type: 'post.reaction'; postId: string; likeCount: number; actorId: string; liked: boolean; viewerId?: string; likedByMe?: boolean }
  | {
      type: 'post.comment';
      postId: string;
      authorId: string;
      commentId: string;
      comment?: PostCommentView | null;
      commentCount: number;
      postUpdated?: { likeCount?: number; commentCount?: number; shareCount?: number } | null;
      /** Set when the comment is a reply: patch the parent, not a top-level row. */
      parentId?: string | null;
    };

type Listener = (state: MomentsState) => void;

// ─── Service ──────────────────────────────────────────────────────────────────

class MomentsService {
  private listeners: Set<Listener> = new Set();
  private currentUserId: string | null = null;

  // Posts whose card count came from a THREAD read (patchCommentCount /
  // syncCommentCount) rather than the card field `commentCount`. The owner
  // thread filter excludes soft-deleted rows, so the raw field would show
  // "3 bình luận" over a thread with one visible comment. The thread-derived
  // number lives in this overlay and wins over every raw-field write.
  private commentCountOverlay = new Map<string, number>();

  private state: MomentsState = {
    feedRing: [],
    storiesByAuthor: new Map(),
    viewerCount: new Map(),
    highlights: new Map(),
    isLoading: false,
    error: null,
    postsById: new Map(),
    feedIds: [],
    postsCursor: null,
    isLoadingPosts: false,
    postsError: null,
  };

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setCurrentUserId(id: string | null): void {
    this.currentUserId = id;
  }

  getState(): MomentsState {
    // `postsById` is exposed as the UI view (overlay applied, fresh identity
    // for only the overridden posts) so the memoized PostCard still skips
    // untouched rows.
    if (this.commentCountOverlay.size === 0) return this.state;
    const postsById = new Map(
      [...this.state.postsById].map(([id, post]): [string, PostView] => {
        const active = this.commentCountOverlay.get(id);
        return active !== undefined && active !== post.commentCount
          ? [id, { ...post, commentCount: active }]
          : [id, post];
      }),
    );
    return { ...this.state, postsById };
  }

  /**
   * Bump a post's comment count by `delta` and drop its pinned count: this
   * device's own write is the new baseline, so a later thread read re-pins
   * it and a socket replay of the same write cannot double-apply.
   */
  private incrementCommentCount(postId: string, delta: 1 | -1): void {
    this.commentCountOverlay.delete(postId);
    const post = this.state.postsById.get(postId);
    if (!post) return;
    const postsById = new Map(this.state.postsById);
    postsById.set(postId, {
      ...post,
      commentCount: Math.max(0, post.commentCount + delta),
    });
    this.setState({ postsById });
  }

  private setState(partial: Partial<MomentsState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn(this.state));
  }

  // ─── Feed ───────────────────────────────────────────────────────────────────

  async refreshFeed(): Promise<void> {
    const isColdLoad = this.state.feedRing.length === 0;
    if (isColdLoad) {
      this.setState({ isLoading: true, error: null });
    } else {
      // Already have feed → refresh silently (no isLoading churn → no flash)
      if (this.state.error !== null) this.setState({ error: null });
    }
    try {
      const response = await storiesApi.getFeed({ limit: 50 });
      console.log('[momentsService] refreshFeed response:', response);

      const feedRing: FeedRingItem[] = response.items.map((item: FeedItem) => ({
        authorId: item.authorId,
        lastStoryId: item.lastStoryId,
        hasUnviewed: item.hasUnviewed,
        authorDisplayName: item.authorDisplayName,
        authorAvatar: item.authorAvatar,
      }));

      const storiesByAuthor = new Map<string, Story[]>(this.state.storiesByAuthor);
      for (const item of response.items) {
        storiesByAuthor.set(item.authorId, item.stories);
      }

      console.log('[momentsService] feedRing length:', feedRing.length);
      this.setState({ feedRing, storiesByAuthor, isLoading: false });
    } catch (err: unknown) {
      console.log('[momentsService] refreshFeed error:', err);
      // No mock fallback — errors set the error state so the UI shows a
      // retryable banner. Empty feed is a real empty state.
      this.setState({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Không thể tải khoảnh khắc',
      });
    }
  }

  getStoriesForAuthor(authorId: string): Story[] {
    return this.state.storiesByAuthor.get(authorId) ?? [];
  }

  // ─── Story Actions ──────────────────────────────────────────────────────────

  async recordView(storyId: string): Promise<void> {
    try {
      await viewsApi.recordView(storyId);
    } catch {
      // Non-critical — silently ignore
    }
  }

  async reactToStory(storyId: string, authorId: string, emoji: string): Promise<void> {
    // Optimistic update
    const myId = this.currentUserId;
    if (!myId) {
      // Skip optimistic update — userId not yet available (race during auth bootstrap)
      // Real reaction state will sync on next refreshFeed.
    } else {
      const stories = this.state.storiesByAuthor.get(authorId);
      if (stories) {
        const updated = stories.map((s) => {
          if (s._id !== storyId) return s;
          const filteredReactions = s.reactions.filter((r) => r.userId !== myId);
          return {
            ...s,
            myReaction: emoji,
            reactions: [...filteredReactions, { userId: myId, emoji, createdAt: new Date().toISOString() }],
          };
        });
        const storiesByAuthor = new Map(this.state.storiesByAuthor);
        storiesByAuthor.set(authorId, updated);
        this.setState({ storiesByAuthor });
      }
    }

    try {
      await reactionsApi.reactToStory(storyId, emoji);
    } catch {
      // Revert optimistic update on failure
      await this.refreshFeed();
    }
  }

  async removeReaction(storyId: string, authorId: string): Promise<void> {
    // Optimistic update
    const myId = this.currentUserId;
    if (!myId) {
      // Skip optimistic update — userId not yet available (race during auth bootstrap)
      // Real reaction state will sync on next refreshFeed.
    } else {
      const stories = this.state.storiesByAuthor.get(authorId);
      if (stories) {
        const updated = stories.map((s) => {
          if (s._id !== storyId) return s;
          return {
            ...s,
            myReaction: null,
            reactions: s.reactions.filter((r) => r.userId !== myId),
          };
        });
        const storiesByAuthor = new Map(this.state.storiesByAuthor);
        storiesByAuthor.set(authorId, updated);
        this.setState({ storiesByAuthor });
      }
    }

    try {
      await reactionsApi.removeReaction(storyId);
    } catch {
      await this.refreshFeed();
    }
  }

  async commentOnStory(storyId: string, text: string): Promise<{ conversationId: string; messageId: string }> {
    return commentsApi.commentOnStory(storyId, text);
  }

  async createStory(body: Parameters<typeof storiesApi.createStory>[0]): Promise<Story> {
    // Check connectivity — media uploads require a live connection
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      throw Object.assign(new Error('OFFLINE'), {
        code: 'OFFLINE',
        message: 'Không có kết nối mạng. Khoảnh khắc sẽ được đăng khi kết nối lại.',
      });
    }

    const story = await storiesApi.createStory(body);
    // Refresh feed to include new story
    await this.refreshFeed();
    return story;
  }

  async deleteStory(storyId: string, authorId: string): Promise<void> {
    await storiesApi.deleteStory(storyId);
    // Remove from local state
    const stories = this.state.storiesByAuthor.get(authorId);
    if (stories) {
      const storiesByAuthor = new Map(this.state.storiesByAuthor);
      storiesByAuthor.set(authorId, stories.filter((s) => s._id !== storyId));
      const feedRing = this.state.feedRing.filter((r) => {
        const authorStories = storiesByAuthor.get(r.authorId) ?? [];
        return authorStories.length > 0;
      });
      this.setState({ storiesByAuthor, feedRing });
    }
  }

  // ─── Highlights ──────────────────────────────────────────────────────────────

  async loadUserHighlights(userId: string): Promise<Highlight[]> {
    try {
      const { highlights } = await highlightsApi.getUserHighlights(userId);
      const map = new Map(this.state.highlights);
      map.set(userId, highlights);
      this.setState({ highlights: map });
      return highlights;
    } catch {
      return this.state.highlights.get(userId) ?? [];
    }
  }

  getHighlightsForUser(userId: string): Highlight[] {
    return this.state.highlights.get(userId) ?? [];
  }

  async createHighlight(body: { title: string; storyIds: string[] }): Promise<Highlight> {
    return highlightsApi.createHighlight(body);
  }

  async updateHighlight(
    highlightId: string,
    body: { title?: string; addStoryIds?: string[]; removeStoryIds?: string[]; orderedStoryIds?: string[] },
  ): Promise<Highlight> {
    return highlightsApi.updateHighlight(highlightId, body);
  }

  async deleteHighlight(highlightId: string): Promise<void> {
    await highlightsApi.deleteHighlight(highlightId);
  }

  async getHighlightDetail(highlightId: string): Promise<{ highlight: Highlight; stories: Story[] }> {
    return highlightsApi.getHighlightDetail(highlightId);
  }

  // ─── Audience Lists ──────────────────────────────────────────────────────────

  async loadAudienceLists(): Promise<AudienceList[]> {
    const { lists } = await audienceListsApi.listOwn();
    return lists;
  }

  async createAudienceList(body: { name: string; memberIds?: string[] }): Promise<AudienceList> {
    return audienceListsApi.createList(body);
  }

  async updateAudienceList(
    listId: string,
    body: { name?: string; addMemberIds?: string[]; removeMemberIds?: string[] },
  ): Promise<AudienceList> {
    return audienceListsApi.updateList(listId, body);
  }

  async deleteAudienceList(listId: string): Promise<void> {
    await audienceListsApi.deleteList(listId);
  }

  // ─── Music ───────────────────────────────────────────────────────────────────

  async searchMusicTracks(params?: {
    q?: string;
    tag?: string;
    sort?: 'trending' | 'recent';
    limit?: number;
  }): Promise<MusicTrack[]> {
    const result = await musicApi.searchTracks(params);
    return result.tracks;
  }

  async getMusicTrackById(trackId: string): Promise<MusicTrack> {
    return musicApi.getTrackById(trackId);
  }

  // ─── Socket Event Handler ────────────────────────────────────────────────────

  handleEvent(event: MomentsEvent): void {
    try {
      switch (event.type) {
        case 'story.new':
          this.handleStoryNew(event);
          break;
        case 'story.deleted':
          this.handleStoryDeleted(event);
          break;
        case 'story.mention':
          // Mentions are informational — a refresh will pick up the story
          this.refreshFeed().catch(() => {});
          break;
        case 'story.reaction':
          this.handleStoryReaction(event);
          break;
        case 'post.new':
          this.handlePostEvent(event);
          break;
        case 'post.deleted':
          this.handlePostEvent(event);
          break;
        case 'post.reaction':
          this.handlePostEvent(event);
          break;
        case 'post.comment':
          this.handlePostEvent(event);
          break;
      }
    } catch (err) {
      console.warn('[momentsService] handleEvent error:', err);
    }
  }

  private handleStoryNew(event: Extract<MomentsEvent, { type: 'story.new' }>): void {
    // Skip own stories — author already knows they published
    if (this.currentUserId && event.authorId === this.currentUserId) return;

    // Add a placeholder ring item so the author appears immediately;
    // full story data loads on tap.
    const existing = this.state.feedRing.find((r) => r.authorId === event.authorId);
    if (!existing) {
      // Placeholder fields: real name/avatar will be filled on the next refreshFeed() call.
      const feedRing: FeedRingItem[] = [
        {
          authorId: event.authorId,
          lastStoryId: event.storyId,
          hasUnviewed: true,
          authorDisplayName: '',
          authorAvatar: null,
        },
        ...this.state.feedRing,
      ];
      this.setState({ feedRing });
    } else {
      // Mark existing ring item as having unviewed content
      const feedRing = this.state.feedRing.map((r) =>
        r.authorId === event.authorId
          ? { ...r, lastStoryId: event.storyId, hasUnviewed: true }
          : r,
      );
      this.setState({ feedRing });
    }
  }

  private handleStoryDeleted(event: Extract<MomentsEvent, { type: 'story.deleted' }>): void {
    const stories = this.state.storiesByAuthor.get(event.authorId);

    if (!stories) {
      // storiesByAuthor has no entry (feed was populated via story.new only):
      // remove the ring item whose lastStoryId matches the deleted story.
      const feedRing = this.state.feedRing.filter(
        (r) => !(r.authorId === event.authorId && r.lastStoryId === event.storyId),
      );
      if (feedRing.length !== this.state.feedRing.length) {
        this.setState({ feedRing });
      }
      return;
    }

    const storiesByAuthor = new Map(this.state.storiesByAuthor);
    const filtered = stories.filter((s) => s._id !== event.storyId);
    storiesByAuthor.set(event.authorId, filtered);

    const feedRing = this.state.feedRing.filter((r) => {
      if (r.authorId !== event.authorId) return true;
      return (storiesByAuthor.get(r.authorId) ?? []).length > 0;
    });

    this.setState({ storiesByAuthor, feedRing });
  }

  private handleStoryReaction(event: Extract<MomentsEvent, { type: 'story.reaction' }>): void {
    // This arrives on the author's device; update reaction state for the story
    const { storyId, action, emoji, viewerId } = event;
    for (const [authorId, stories] of this.state.storiesByAuthor.entries()) {
      const story = stories.find((s) => s._id === storyId);
      if (story) {
        const storiesByAuthor = new Map(this.state.storiesByAuthor);
        const updated = stories.map((s) => {
          if (s._id !== storyId) return s;
          const reactionCounts = { ...(s.reactionCounts ?? {}) };

          if (action === 'remove') {
            // Option B: Look up the viewer's existing reaction to find the exact emoji
            const existingReaction = s.reactions.find((r) => r.userId === viewerId);
            if (existingReaction && existingReaction.emoji && reactionCounts[existingReaction.emoji]) {
              reactionCounts[existingReaction.emoji]--;
              if (reactionCounts[existingReaction.emoji] <= 0) delete reactionCounts[existingReaction.emoji];
            }
            // Clear myReaction if the remove is for the current user
            const myReaction =
              this.currentUserId && viewerId === this.currentUserId
                ? null
                : s.myReaction;
            return { ...s, reactionCounts, myReaction };
          }

          // action === 'add' (default)
          if (emoji) {
            reactionCounts[emoji] = (reactionCounts[emoji] ?? 0) + 1;
          }
          return { ...s, reactionCounts };
        });
        storiesByAuthor.set(authorId, updated);
        this.setState({ storiesByAuthor });
        break;
      }
    }
  }

  // ─── Posts ───────────────────────────────────────────────────────────────────

  /**
   * Map a backend PostView to the presentational FeedPost (PostCard contract).
   * Returns null when the post carries no resolvable id — such a row cannot be
   * liked, commented on, or keyed, so `refreshPosts` drops it and flags a
   * contract error instead of rendering a dead card.
   */
  mapPostToFeedPost(post: PostView): FeedPost | null {
    const postId = resolvePost(post);
    if (!postId) return null;
    return {
      id: postId,
      authorId: post.authorId,
      authorDisplayName: post.authorDisplayName || 'Người dùng',
      authorAvatar: post.authorAvatar ?? undefined,
      timeLabel: formatPostTime(post.createdAt),
      audience: post.audienceScope,
      caption: post.caption,
      media: post.media.map((m) => ({
        mediaKey: m.mediaKey,
        uri: m.mediaUrl ?? undefined,
        mediaType: m.mediaType,
        duration: m.duration ?? undefined,
      })),
      reactionCount: post.reactionCount ?? post.likeCount,
      commentCount: post.commentCount,
      shareCount: post.shareCount,
      likedByMe: post.likedByMe,
      // A soft-deleted row is NOT dropped here: it keeps its slot as a
      // tombstone so the preview matches the sheet (which does the same).
      comments: (post.comments ?? []).map((c) => ({
        id: c._id,
        authorDisplayName: c.isActive
          ? c.authorDisplayName || 'Người dùng'
          : '',
        authorAvatar: c.authorAvatar ?? undefined,
        content: c.isActive ? c.content : '[đã xóa]',
        timeLabel: formatPostTime(c.createdAt),
      })),
    };
  }

  getFeedPosts(): FeedPost[] {
    // Reads through getState() so a thread-derived comment count is what the
    // card renders (patchCommentCount), not the stale raw field.
    const { feedIds, postsById } = this.getState();
    return feedIds
      .map((id) => postsById.get(id))
      .filter((p): p is PostView => !!p)
      .map((p) => this.mapPostToFeedPost(p))
      .filter((p): p is FeedPost => p !== null);
  }

  async refreshPosts(): Promise<void> {
    const isColdLoad = this.state.feedIds.length === 0;
    if (isColdLoad) {
      this.setState({ isLoadingPosts: true, postsError: null });
    } else if (this.state.postsError !== null) {
      this.setState({ postsError: null });
    }
    try {
      const response = await postsApi.getFeed({ limit: 20 });
      const postsById = new Map<string, PostView>();
      const feedIds: string[] = [];
      let malformed = 0;
      for (const item of response.items) {
        // Key by the SAME id the UI uses (resolvePost), so every downstream
        // lookup — like, comment, media viewer, menu — hits the same entry.
        const id = resolvePost(item);
        if (!id) {
          malformed++;
          continue;
        }
        postsById.set(id, item);
        feedIds.push(id);
      }
      // A page of id-less posts would render as an empty feed that looks like
      // "no posts" — surface it as a real error instead.
      const postsError =
        malformed > 0
          ? 'Dữ liệu bài viết không hợp lệ — vui lòng thử lại'
          : null;
      this.setState({
        postsById,
        feedIds,
        postsCursor: response.nextCursor,
        isLoadingPosts: false,
        postsError,
      });
    } catch (err: unknown) {
      this.setState({
        isLoadingPosts: false,
        postsError: err instanceof Error ? err.message : 'Không thể tải bài viết',
      });
    }
  }

  async loadMorePosts(): Promise<void> {
    if (this.state.isLoadingPosts) return;
    if (!this.state.postsCursor) return;
    this.setState({ isLoadingPosts: true });
    try {
      const response = await postsApi.getFeed({
        cursor: this.state.postsCursor,
        limit: 20,
      });
      const postsById = new Map(this.state.postsById);
      const feedIds = [...this.state.feedIds];
      for (const item of response.items) {
        // Same id normalization as refreshPosts.
        const id = resolvePost(item);
        if (!id) continue;
        if (!postsById.has(id)) feedIds.push(id);
        postsById.set(id, { ...item, id });
      }
      this.setState({
        postsById,
        feedIds,
        postsCursor: response.nextCursor,
        isLoadingPosts: false,
        // A page that failed earlier must not stay on screen as a banner
        // after a successful one.
        postsError: null,
      });
    } catch (err: unknown) {
      this.setState({
        isLoadingPosts: false,
        postsError: err instanceof Error ? err.message : 'Không thể tải thêm bài viết',
        // Clear the cursor so the list's onEndReached cannot loop on a
        // failing page (the existing posts stay). Retry = refresh, which
        // clears postsError and reloads the first page.
        postsCursor: null,
      });
    }
  }

  async createPost(body: {
    caption?: string;
    media?: Parameters<typeof postsApi.createPost>[0]['media'];
    audienceScope: Parameters<typeof postsApi.createPost>[0]['audienceScope'];
    audienceListId?: string;
    mentions?: Parameters<typeof postsApi.createPost>[0]['mentions'];
    clientPostId?: string;
  }): Promise<PostView> {
    const clientPostId = body.clientPostId ?? generateClientId();
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      const mediaAssets = (body.media ?? []).map((m) => ({
        localUri: (m as unknown as { localUri?: string }).localUri ?? m.mediaKey,
        mediaType: String(m.mediaType),
        duration: m.duration ?? undefined,
        width: (m as unknown as { width?: number }).width,
        height: (m as unknown as { height?: number }).height,
      }));
      outboxRepository.enqueue('create_post', {
        caption: body.caption,
        audienceScope: body.audienceScope,
        audienceListId: body.audienceListId,
        mentions: body.mentions as CreatePostPayloadV1['mentions'],
        media: mediaAssets,
        clientPostId,
      });
      throw Object.assign(new Error('QUEUED'), {
        code: 'QUEUED',
        message: 'Sẽ đăng khi có mạng',
      });
    }

    const post = await postsApi.createPost({
      ...body,
      clientPostId,
    });
    // Prepend reconciled by ID (no duplicate on post.new replay)
    const postId = resolvePost(post);
    if (!postId) {
      throw new Error('Bài viết vừa tạo thiếu mã định danh');
    }
    const normalized: PostView = { ...post, id: postId };
    const postsById = new Map(this.state.postsById);
    postsById.set(postId, normalized);
    const feedIds = this.state.feedIds.includes(postId)
      ? this.state.feedIds
      : [postId, ...this.state.feedIds];
    this.setState({ postsById, feedIds });
    return normalized;
  }

  /**
   * Upsert a single post the app fetched out-of-band (e.g. a shared link
   * resolved in MomentViewer) so the feed shows it without a refetch.
   */
  cachePost(post: PostView): string | null {
    const id = resolvePost(post);
    if (!id) return null;
    const postsById = new Map(this.state.postsById);
    postsById.set(id, { ...post, id });
    const feedIds = this.state.feedIds.includes(id)
      ? this.state.feedIds
      : [id, ...this.state.feedIds];
    this.setState({ postsById, feedIds });
    return id;
  }

  async toggleLike(postId: string): Promise<void> {
    const post = this.state.postsById.get(postId);
    // Optimistic toggle
    if (post) {
      const likedByMe = !post.likedByMe;
      const likeCount = Math.max(0, post.likeCount + (likedByMe ? 1 : -1));
      const postsById = new Map(this.state.postsById);
      postsById.set(postId, {
        ...post,
        likedByMe,
        likeCount,
        reactionCount: likeCount,
      });
      this.setState({ postsById });
    }

    try {
      const result = await postsApi.toggleLike(postId);
      const current = this.state.postsById.get(postId);
      if (current) {
        const postsById = new Map(this.state.postsById);
        postsById.set(postId, {
          ...current,
          likedByMe: result.likedByMe,
          likeCount: result.likeCount,
          reactionCount: result.likeCount,
        });
        this.setState({ postsById });
      }
    } catch {
      // Revert optimistic update on failure
      await this.refreshPosts();
    }
  }

  async addComment(
    postId: string,
    content: string,
    parentId?: string,
  ): Promise<PostCommentView> {
    const comment = await postsApi.commentOnPost(postId, { content, parentId });
    const post = this.state.postsById.get(postId);
    if (post) {
      this.incrementCommentCount(postId, 1);
      const postsById = new Map(this.state.postsById);
      if (!parentId) {
        // Keep the card's 2-comment preview in step with the API: drop the
        // oldest previewed comment so the newest one (just posted) is visible
        // without waiting for a refresh.
        const preview = [...(post.comments ?? []), comment]
          .filter((c) => c.isActive || c._id === comment._id)
          .slice(-2);
        postsById.set(postId, { ...postsById.get(postId)!, comments: preview });
      } else {
        // Reply: bump the parent's reply count inside the preview.
        const comments = (post.comments ?? []).map((c) =>
          c._id === parentId
            ? { ...c, replyCount: (c.replyCount ?? 0) + 1 }
            : c,
        );
        postsById.set(postId, { ...postsById.get(postId)!, comments });
      }
      this.setState({ postsById });
    }
    return comment;
  }

  /**
   * Active top-level comment count from a loaded thread. `post.commentCount`
   * includes soft-deleted rows, so the card must show this instead. The value
   * is pinned in the overlay: a later refreshPosts (raw field) or a
   * `post.comment` replay (possibly a delayed delete) must not overwrite it.
   */
  patchCommentCount(postId: string, activeCommentCount: number): void {
    const post = this.state.postsById.get(postId);
    if (!post) return;
    this.commentCountOverlay.set(postId, activeCommentCount);
    if (post.commentCount === activeCommentCount) return;
    const postsById = new Map(this.state.postsById);
    postsById.set(postId, { ...post, commentCount: activeCommentCount });
    this.setState({ postsById });
  }

  /**
   * Re-read the server's active comment count after this device soft-deleted
   * `deletedCommentId`, then pin it. The card must show the server's number,
   * not `previous - 1` (see MomentsScreen.handleDeleteComment). The id is sent
   * so read-your-writes staleness cannot count the just-deleted row again.
   * A failed request keeps the current value.
   */
  async syncCommentCount(
    postId: string,
    deletedCommentId?: string,
    // The thread as the sheet shows it (tombstones flagged, ids unknown to
    // the card included). Used when the count request fails.
    thread?: PostCommentView[],
  ): Promise<void> {
    try {
      const { activeCommentCount } = await postsApi.getActiveCommentCount(
        postId,
        deletedCommentId,
      );
      if (activeCommentCount !== null) {
        this.patchCommentCount(postId, activeCommentCount);
      } else {
        // The server could not count (null). Never leave the card at
        // `previous - 1` over a thread the user is looking at.
        this.recountFromThread(postId, thread);
      }
    } catch {
      this.recountFromThread(postId, thread);
    }
  }

  /**
   * Fallback for a failed count request: active top-level rows of the thread
   * the sheet is showing. Without a thread there is nothing to count from,
   * so the pin and the `previous - 1` the caller applied stay.
   */
  private recountFromThread(postId: string, thread?: PostCommentView[]): void {
    if (!thread) return;
    const active = thread.filter((c) => !c.parentId && c.isActive !== false).length;
    this.patchCommentCount(postId, active);
  }

  /**
   * Insert a comment this device just wrote into the card's 2-comment preview
   * (top-level only). Kept OUT of the comment sheet's own array so the thread
   * and the preview never share state. A no-op when addComment already
   * applied the same write.
   */
  registerComment(postId: string, comment: PostCommentView): void {
    const post = this.state.postsById.get(postId);
    if (!post) return;
    const comments = post.comments ?? [];
    if (comment.parentId) return;
    if (comments.some((c) => c._id === comment._id)) return;
    const preview = [...comments, comment]
      .filter((c) => c.isActive || c._id === comment._id)
      .slice(-2);
    const postsById = new Map(this.state.postsById);
    postsById.set(postId, { ...post, comments: preview });
    this.setState({ postsById });
  }

  async deleteComment(commentId: string): Promise<void> {
    await postsApi.deleteComment(commentId);
    // Mark the row, don't drop it: the backend soft-deletes, keeping the
    // slot and the replies under a top-level row. Card and thread agree on
    // the tombstone; the count is re-read from the server by the caller
    // (syncCommentCount) instead of being guessed here.
    const postsById = new Map(this.state.postsById);
    let changed = false;
    for (const [id, post] of postsById) {
      const comments = post.comments ?? [];
      const isTopLevel = comments.some((c) => c._id === commentId);
      if (isTopLevel) {
        changed = true;
        postsById.set(id, {
          ...post,
          comments: comments.map((c) =>
            c._id === commentId ? { ...c, isActive: false } : c,
          ),
        });
        continue;
      }
      // A reply is never a top-level entry — mark it inside its parent and
      // lower that parent's replyCount.
      let touched = false;
      const nextComments = comments.map((c) => {
        if (!(c.replies ?? []).some((r) => r._id === commentId)) return c;
        touched = true;
        return {
          ...c,
          replies: (c.replies ?? []).map((r) =>
            r._id === commentId ? { ...r, isActive: false } : r,
          ),
          replyCount: Math.max(0, (c.replyCount ?? 0) - 1),
        };
      });
      if (!touched) continue;
      changed = true;
      this.incrementCommentCount(id, -1);
      postsById.set(id, { ...postsById.get(id)!, comments: nextComments });
    }
    if (changed) this.setState({ postsById });
  }

  async sharePost(
    postId: string,
  ): Promise<{ shareCount: number; deepLink: string; appLink: string }> {
    const result = await postsApi.sharePost(postId);
    // View (overlay applied) so a spread write can't drop the pinned count.
    const post = this.getState().postsById.get(postId);
    if (post) {
      const postsById = new Map(this.state.postsById);
      postsById.set(postId, { ...post, shareCount: result.shareCount });
      this.setState({ postsById });
    }
    return result;
  }

  async editPost(
    postId: string,
    body: { caption?: string; audienceScope?: PostView['audienceScope']; audienceListId?: string },
  ): Promise<PostView> {
    const updated = await postsApi.updatePost(postId, body);
    const id = resolvePost(updated) ?? postId;
    const normalized: PostView = { ...updated, id };
    const postsById = new Map(this.state.postsById);
    postsById.set(id, normalized);
    this.setState({ postsById });
    return normalized;
  }

  async deletePost(postId: string): Promise<void> {
    await postsApi.deletePost(postId);
    const postsById = new Map(this.state.postsById);
    postsById.delete(postId);
    this.setState({
      postsById,
      feedIds: this.state.feedIds.filter((id) => id !== postId),
    });
  }

  async reportPost(postId: string, reason: string): Promise<void> {
    await postsApi.reportPost(postId, reason);
  }

  async handlePostEvent(
    event: Extract<MomentsEvent, { type: `post.${string}` }>,
  ): Promise<void> {
    try {
      switch (event.type) {
        case 'post.new': {
          // Skip own posts — author already prepended on create
          if (this.currentUserId && event.authorId === this.currentUserId) return;
          if (this.state.postsById.has(event.postId)) return; // no duplicate on replay
          try {
            const post = await postsApi.getPostById(event.postId);
            const id = resolvePost(post);
            if (!id) return;
            const postsById = new Map(this.state.postsById);
            postsById.set(id, { ...post, id });
            this.setState({
              postsById,
              feedIds: [id, ...this.state.feedIds],
            });
          } catch {
            // Post may be out of scope — refresh silently to stay consistent
            this.refreshPosts().catch(() => {});
          }
          break;
        }
        case 'post.deleted': {
          const postsById = new Map(this.state.postsById);
          postsById.delete(event.postId);
          this.setState({
            postsById,
            feedIds: this.state.feedIds.filter((id) => id !== event.postId),
          });
          break;
        }
        case 'post.reaction': {
          const post = this.getState().postsById.get(event.postId);
          if (post) {
            // Always patch the count; only touch likedByMe when the event's
            // actor is this device's user (e.g. own like from another device).
            // A like by any other viewer must NOT flip local likedByMe.
            const actorId = event.actorId ?? event.viewerId;
            const isOwnEvent =
              !!actorId &&
              !!this.currentUserId &&
              actorId === this.currentUserId;
            // Preferred: actor-scoped `liked`. Legacy fallback: viewer-scoped
            // `likedByMe` is only meaningful when the event is our own.
            const nextLikedByMe = isOwnEvent
              ? (event.liked ?? event.likedByMe ?? post.likedByMe)
              : post.likedByMe;
            const postsById = new Map(this.state.postsById);
            // Write the STORED object (the view copy carries a count the raw
            // field may not), patched with the event. `id` is kept: socket
            // events arrive after the fetch that keyed this entry.
            postsById.set(event.postId, {
              ...this.state.postsById.get(event.postId)!,
              likeCount: event.likeCount,
              reactionCount: event.likeCount,
              likedByMe: nextLikedByMe,
            });
            this.setState({ postsById });
          }
          break;
        }
        case 'post.comment': {
          const post = this.getState().postsById.get(event.postId);
          if (post) {
            const stored = this.state.postsById.get(event.postId);
            if (!stored) break;
            // Enriched payload: merge the comment view + post counts in one
            // write; the thread-derived overlay still wins at read time.
            const next: PostView = { ...stored };
            const incoming = event.postUpdated;
            const nextCount =
              incoming?.commentCount ?? event.commentCount;
            if (nextCount > stored.commentCount) {
              next.commentCount = nextCount;
            }
            if (incoming?.likeCount !== undefined) {
              next.likeCount = incoming.likeCount;
              next.reactionCount = incoming.likeCount;
            }
            if (incoming?.shareCount !== undefined) {
              next.shareCount = incoming.shareCount;
            }
            const view = (event as { comment?: PostCommentView | null }).comment;
            if (view && view._id && !view.parentId) {
              const comments = [...(next.comments ?? [])];
              if (!comments.some((c) => c._id === view._id)) {
                comments.push(view);
                next.comments = comments.slice(-2);
              }
            }
            // Only write when something changed (count or preview merge).
            if (
              next.commentCount !== stored.commentCount ||
              next.likeCount !== stored.likeCount ||
              next.shareCount !== stored.shareCount ||
              next.comments !== stored.comments
            ) {
              const postsById = new Map(this.state.postsById);
              postsById.set(event.postId, next);
              this.setState({ postsById });
            }
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[momentsService] handlePostEvent error:', err);
    }
  }

  // ─── Reset on logout ─────────────────────────────────────────────────────────

  reset(): void {
    this.commentCountOverlay.clear();
    this.state = {
      feedRing: [],
      storiesByAuthor: new Map(),
      viewerCount: new Map(),
      highlights: new Map(),
      isLoading: false,
      error: null,
      postsById: new Map(),
      feedIds: [],
      postsCursor: null,
      isLoadingPosts: false,
      postsError: null,
    };
    this.notify();
  }
}

/** Compact Vietnamese relative time: "2 giờ", "5 phút", "3 ngày". */
function formatPostTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} tuần`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng`;
  return `${Math.floor(days / 365)} năm`;
}

export const momentsService = new MomentsService();
export default momentsService;
