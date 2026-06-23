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
}

export type MomentsEvent =
  | { type: 'story.new'; storyId: string; authorId: string; mediaType: string; audienceScope?: string; createdAt: string }
  | { type: 'story.deleted'; storyId: string; authorId: string }
  | { type: 'story.mention'; storyId: string; authorId: string; captionSnippet: string }
  | { type: 'story.reaction'; storyId: string; viewerId: string; emoji: string; action?: 'add' | 'remove' };

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
    this.setState({ isLoading: true, error: null });
    try {
      const response = await storiesApi.getFeed({ limit: 50 });

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

      this.setState({ feedRing, storiesByAuthor, isLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải khoảnh khắc';
      this.setState({ isLoading: false, error: msg });
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

  // ─── Reset on logout ─────────────────────────────────────────────────────────

  reset(): void {
    this.state = {
      feedRing: [],
      storiesByAuthor: new Map(),
      viewerCount: new Map(),
      highlights: new Map(),
      isLoading: false,
      error: null,
    };
    this.notify();
  }
}

export const momentsService = new MomentsService();
export default momentsService;
