/**
 * momentsApi.ts
 *
 * Typed API wrappers for all moments endpoints, built on the existing apiService.
 * Mirrors the backend MomentsController routes exactly.
 */

import apiClient from '../api/apiService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'video';
export type AudienceScope = 'public' | 'connections' | 'custom';

export interface MentionEntry {
  userId: string;
  username: string;
  offset: number;
  length: number;
}

export interface MusicRef {
  trackId: string;
  startMs: number;
}

export interface ReactionEntry {
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface Story {
  _id: string;
  storyGroupId: string;
  overFlowIndex: number;
  authorId: string;
  mediaKey: string;
  mediaType: MediaType;
  thumbnailKey: string | null;
  duration: number | null;
  caption: string;
  mentions: MentionEntry[];
  musicRef: MusicRef | null;
  audienceScope: AudienceScope;
  audienceListId: string | null;
  reactions: ReactionEntry[];
  viewCount: number;
  hasOverflow: boolean;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presigned media URL valid 1h — returned by getStoryById */
  mediaUrl?: string;
  /** Presigned thumbnail URL — returned by getStoryById for video stories */
  thumbnailUrl?: string;
  /** Aggregated reaction counts { '❤️': 3, '😂': 1 } */
  reactionCounts?: Record<string, number>;
  /** The calling viewer's own reaction emoji (if any) */
  myReaction?: string | null;
}

export interface FeedItem {
  authorId: string;
  lastStoryId: string;
  hasUnviewed: boolean;
  stories: Story[];
}

export interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
  total: number;
}

export interface ViewerEntry {
  viewerId: string;
  viewedAt: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ViewersResponse {
  viewers: ViewerEntry[];
  nextCursor: string | null;
}

export interface Highlight {
  _id: string;
  ownerId: string;
  title: string;
  coverKey: string | null;
  storyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AudienceList {
  _id: string;
  ownerId: string;
  name: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MusicTrack {
  _id: string;
  title: string;
  artist: string;
  durationMs: number;
  audioKey: string;
  previewKey: string | null;
  coverKey: string | null;
  tags: string[];
  usageCount: number;
  licenseType: string;
  licenseUrl: string;
  sourceUrl: string;
  attribution: string;
  isActive: boolean;
  addedBy: string;
  createdAt: string;
  /** Presigned audio URL (short-lived) */
  audioUrl?: string;
  /** Presigned preview URL */
  previewUrl?: string;
}

export interface MusicTracksResponse {
  tracks: MusicTrack[];
  nextCursor: string | null;
  total: number;
}

// ─── Stories ─────────────────────────────────────────────────────────────────

export const storiesApi = {
  async createStory(body: {
    mediaKey: string;
    mediaType: MediaType;
    thumbnailKey?: string;
    duration?: number;
    caption?: string;
    audienceScope: AudienceScope;
    audienceListId?: string;
    musicRef?: MusicRef;
    clientStoryId?: string;
    mentions?: MentionEntry[];
  }): Promise<Story> {
    const { data } = await apiClient.post('/moments/stories', body);
    return data;
  },

  async getFeed(params?: { cursor?: string; limit?: number }): Promise<FeedResponse> {
    const { data } = await apiClient.get('/moments/feed', { params });
    return data;
  },

  async getStoryById(storyId: string): Promise<Story> {
    const { data } = await apiClient.get(`/moments/stories/${storyId}`);
    return data;
  },

  async deleteStory(storyId: string): Promise<void> {
    await apiClient.delete(`/moments/stories/${storyId}`);
  },
};

// ─── Views ───────────────────────────────────────────────────────────────────

export const viewsApi = {
  async recordView(storyId: string): Promise<void> {
    await apiClient.post(`/moments/stories/${storyId}/views`);
  },

  async listViewers(
    storyId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<ViewersResponse> {
    const { data } = await apiClient.get(`/moments/stories/${storyId}/viewers`, { params });
    return data;
  },
};

// ─── Reactions ───────────────────────────────────────────────────────────────

export const reactionsApi = {
  async reactToStory(storyId: string, emoji: string): Promise<void> {
    await apiClient.post(`/moments/stories/${storyId}/reactions`, { emoji });
  },

  async removeReaction(storyId: string): Promise<void> {
    await apiClient.delete(`/moments/stories/${storyId}/reactions`);
  },
};

// ─── Comments ────────────────────────────────────────────────────────────────

export const commentsApi = {
  async commentOnStory(storyId: string, text: string): Promise<{ conversationId: string; messageId: string }> {
    const { data } = await apiClient.post(`/moments/stories/${storyId}/comments`, { text });
    return data;
  },
};

// ─── Highlights ──────────────────────────────────────────────────────────────

export const highlightsApi = {
  async createHighlight(body: { title: string; storyIds: string[] }): Promise<Highlight> {
    const { data } = await apiClient.post('/moments/highlights', body);
    return data;
  },

  async updateHighlight(
    highlightId: string,
    body: {
      title?: string;
      addStoryIds?: string[];
      removeStoryIds?: string[];
      orderedStoryIds?: string[];
    },
  ): Promise<Highlight> {
    const { data } = await apiClient.patch(`/moments/highlights/${highlightId}`, body);
    return data;
  },

  async deleteHighlight(highlightId: string): Promise<void> {
    await apiClient.delete(`/moments/highlights/${highlightId}`);
  },

  async getUserHighlights(userId: string): Promise<{ highlights: Highlight[] }> {
    const { data } = await apiClient.get(`/moments/users/${userId}/highlights`);
    return data;
  },

  async getHighlightDetail(highlightId: string): Promise<{ highlight: Highlight; stories: Story[] }> {
    const { data } = await apiClient.get(`/moments/highlights/${highlightId}`);
    return data;
  },
};

// ─── Audience Lists ──────────────────────────────────────────────────────────

export const audienceListsApi = {
  async createList(body: { name: string; memberIds?: string[] }): Promise<AudienceList> {
    const { data } = await apiClient.post('/moments/audience-lists', body);
    return data;
  },

  async updateList(
    listId: string,
    body: {
      name?: string;
      addMemberIds?: string[];
      removeMemberIds?: string[];
    },
  ): Promise<AudienceList> {
    const { data } = await apiClient.patch(`/moments/audience-lists/${listId}`, body);
    return data;
  },

  async deleteList(listId: string): Promise<void> {
    await apiClient.delete(`/moments/audience-lists/${listId}`);
  },

  async listOwn(): Promise<{ lists: AudienceList[] }> {
    const { data } = await apiClient.get('/moments/audience-lists');
    return data;
  },

  async getDetail(listId: string): Promise<AudienceList> {
    const { data } = await apiClient.get(`/moments/audience-lists/${listId}`);
    return data;
  },
};

// ─── Music Library ────────────────────────────────────────────────────────────

export const musicApi = {
  async searchTracks(params?: {
    q?: string;
    tag?: string;
    sort?: 'trending' | 'recent';
    limit?: number;
  }): Promise<MusicTracksResponse> {
    const { data } = await apiClient.get('/moments/music-tracks', { params });
    return data;
  },

  async getTrackById(trackId: string): Promise<MusicTrack> {
    const { data } = await apiClient.get(`/moments/music-tracks/${trackId}`);
    return data;
  },
};
