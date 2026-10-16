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
import { generateClientId } from '../../utils/clientId';
import * as outboxRepository from '../db/outboxRepository';

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
  | { type: 'post.comment'; postId: string; authorId: string; commentId: string; commentCount: number };

type Listener = (state: MomentsState) => void;

// ─── Service ──────────────────────────────────────────────────────────────────

class MomentsService {
  private listeners: Set<Listener> = new Set();
  private currentUserId: string | null = null;

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
    return this.state;
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

  /** Map a backend PostView to the presentational FeedPost (PostCard contract). */
  mapPostToFeedPost(post: PostView): FeedPost {
    return {
      id: post._id,
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
      comments: (post.comments ?? []).map((c) => ({
        id: c._id,
        authorDisplayName: c.authorDisplayName || 'Người dùng',
        authorAvatar: c.authorAvatar ?? undefined,
        content: c.isActive ? c.content : '[đã xóa]',
        timeLabel: formatPostTime(c.createdAt),
      })),
    };
  }

  getFeedPosts(): FeedPost[] {
    return this.state.feedIds
      .map((id) => this.state.postsById.get(id))
      .filter((p): p is PostView => !!p)
      .map((p) => this.mapPostToFeedPost(p));
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
      for (const item of response.items) {
        postsById.set(item._id, item);
        feedIds.push(item._id);
      }
      this.setState({
        postsById,
        feedIds,
        postsCursor: response.nextCursor,
        isLoadingPosts: false,
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
        if (!postsById.has(item._id)) feedIds.push(item._id);
        postsById.set(item._id, item);
      }
      this.setState({
        postsById,
        feedIds,
        postsCursor: response.nextCursor,
        isLoadingPosts: false,
      });
    } catch (err: unknown) {
      this.setState({
        isLoadingPosts: false,
        postsError: err instanceof Error ? err.message : 'Không thể tải thêm bài viết',
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
      // Text-only posts are durable: enqueue for replay with the same
      // clientPostId (server dedupes on replay). Posts WITH media keep the
      // inline-retry behavior — media upload requires connectivity and is not
      // representable in the outbox payload.
      if (!body.media || body.media.length === 0) {
        outboxRepository.enqueue('create_post', {
          caption: body.caption,
          audienceScope: body.audienceScope,
          audienceListId: body.audienceListId,
          mentions: body.mentions as Array<{ userId: string; displayName?: string }> | undefined,
          clientPostId,
        });
        throw Object.assign(new Error('QUEUED'), {
          code: 'QUEUED',
          message: 'Sẽ đăng khi có mạng',
        });
      }
      throw Object.assign(new Error('OFFLINE'), {
        code: 'OFFLINE',
        message: 'Không có kết nối mạng. Vui lòng thử lại sau.',
      });
    }

    const post = await postsApi.createPost({
      ...body,
      clientPostId,
    });
    // Prepend reconciled by ID (no duplicate on post.new replay)
    const postsById = new Map(this.state.postsById);
    postsById.set(post._id, post);
    const feedIds = this.state.feedIds.includes(post._id)
      ? this.state.feedIds
      : [post._id, ...this.state.feedIds];
    this.setState({ postsById, feedIds });
    return post;
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
    // Patch commentCount + preview in place; full list loads on sheet open
    const post = this.state.postsById.get(postId);
    if (post) {
      const postsById = new Map(this.state.postsById);
      postsById.set(postId, {
        ...post,
        commentCount: post.commentCount + 1,
      });
      this.setState({ postsById });
    }
    return comment;
  }

  async sharePost(postId: string): Promise<{ shareCount: number; deepLink: string }> {
    const result = await postsApi.sharePost(postId);
    const post = this.state.postsById.get(postId);
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
    const postsById = new Map(this.state.postsById);
    postsById.set(postId, updated);
    this.setState({ postsById });
    return updated;
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
            const postsById = new Map(this.state.postsById);
            postsById.set(post._id, post);
            this.setState({
              postsById,
              feedIds: [post._id, ...this.state.feedIds],
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
          const post = this.state.postsById.get(event.postId);
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
            postsById.set(event.postId, {
              ...post,
              likeCount: event.likeCount,
              reactionCount: event.likeCount,
              likedByMe: nextLikedByMe,
            });
            this.setState({ postsById });
          }
          break;
        }
        case 'post.comment': {
          const post = this.state.postsById.get(event.postId);
          if (post) {
            const postsById = new Map(this.state.postsById);
            postsById.set(event.postId, {
              ...post,
              commentCount: event.commentCount,
            });
            this.setState({ postsById });
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
