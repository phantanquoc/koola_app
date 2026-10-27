/**
 * postsApi.ts
 *
 * Typed API wrappers for the moments posts endpoints, built on apiService.
 * Mirrors the backend MomentsController posts routes exactly.
 */

import apiClient from '../api/apiService';
import type {
  AudienceScope,
  MediaType,
  MentionEntry,
} from './momentsApi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PostMediaInput {
  mediaKey: string;
  mediaType: MediaType;
  thumbnailKey?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface PostMediaView {
  mediaKey: string;
  mediaType: MediaType;
  thumbnailKey: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
}

export interface PostCommentView {
  _id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  likedByMe: boolean;
  authorDisplayName: string;
  authorAvatar: string | null;
  /** Always present: both the feed preview and the full list resolve replies. */
  replies: PostCommentView[];
  replyCount: number;
}

export interface PostView {
  _id: string;
  /**
   * Canonical id. The backend always sends `_id`; `id` is the alias the mobile
   * app keys everything off (index keys, feedIds, action targets).
   */
  id: string;
  authorId: string;
  caption: string;
  media: PostMediaView[];
  mentions: MentionEntry[];
  audienceScope: AudienceScope;
  audienceListId: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  clientPostId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Feed alias for likeCount — matches PostCard's reactionCount shape */
  reactionCount: number;
  likedByMe: boolean;
  authorDisplayName: string;
  authorAvatar: string | null;
  comments: PostCommentView[];
}

export interface PostsFeedResponse {
  items: PostView[];
  nextCursor: string | null;
  total: number;
}

/**
 * Active top-level comment count for the card. `deletedCommentId` is the row
 * the caller just soft-deleted: the count query cannot see this client's own
 * write under read-your-writes staleness, so the server subtracts it.
 */
export interface ActiveCommentCountResponse {
  activeCommentCount: number | null;
}

export interface PostCommentsResponse {
  comments: PostCommentView[];
  nextCursor: string | null;
  /**
   * Ids of soft-deleted rows inside this page. They are still returned (they
   * hold the page's chronological place and cursor) but are NOT counted — the
   * sheet renders them as a tombstone, never as a comment.
   */
  deletedIds: string[];
  /** Active top-level comments on the post; `null` if the count failed. */
  activeCommentCount: number | null;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export const postsApi = {
  async createPost(body: {
    caption?: string;
    media?: PostMediaInput[];
    audienceScope: AudienceScope;
    audienceListId?: string;
    mentions?: MentionEntry[];
    clientPostId?: string;
  }): Promise<PostView> {
    const { data } = await apiClient.post('/moments/posts', body);
    return data;
  },

  async getFeed(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<PostsFeedResponse> {
    const { data } = await apiClient.get('/moments/posts/feed', { params });
    return data;
  },

  async getPostById(postId: string): Promise<PostView> {
    const { data } = await apiClient.get(`/moments/posts/${postId}`);
    return data;
  },

  async updatePost(
    postId: string,
    body: { caption?: string; audienceScope?: AudienceScope; audienceListId?: string },
  ): Promise<PostView> {
    const { data } = await apiClient.patch(`/moments/posts/${postId}`, body);
    return data;
  },

  async deletePost(postId: string): Promise<void> {
    await apiClient.delete(`/moments/posts/${postId}`);
  },

  async toggleLike(postId: string): Promise<{ likedByMe: boolean; likeCount: number }> {
    const { data } = await apiClient.post(`/moments/posts/${postId}/like`);
    return data;
  },

  async unlike(postId: string): Promise<{ likedByMe: boolean; likeCount: number }> {
    const { data } = await apiClient.delete(`/moments/posts/${postId}/like`);
    return data;
  },

  async getActiveCommentCount(
    postId: string,
    deletedCommentId?: string,
  ): Promise<ActiveCommentCountResponse> {
    const { data } = await apiClient.get(`/moments/posts/${postId}/comments/count`, {
      params: deletedCommentId ? { deletedCommentId } : undefined,
    });
    return data;
  },

  async sharePost(
    postId: string,
  ): Promise<{ shareCount: number; deepLink: string; appLink: string }> {
    const { data } = await apiClient.post(`/moments/posts/${postId}/share`);
    return data;
  },

  async reportPost(postId: string, reason: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.post(`/moments/posts/${postId}/report`, { reason });
    return data;
  },

  async commentOnPost(
    postId: string,
    body: { content: string; parentId?: string },
  ): Promise<PostCommentView> {
    const { data } = await apiClient.post(`/moments/posts/${postId}/comments`, body);
    return data;
  },

  async listComments(
    postId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<PostCommentsResponse> {
    const { data } = await apiClient.get(`/moments/posts/${postId}/comments`, { params });
    return data;
  },

  async listReplies(
    postId: string,
    commentId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<{ replies: PostCommentView[]; nextCursor: string | null }> {
    const { data } = await apiClient.get(
      `/moments/posts/${postId}/comments/${commentId}/replies`,
      { params },
    );
    return data;
  },

  async toggleCommentLike(
    commentId: string,
  ): Promise<{ likedByMe: boolean; likeCount: number }> {
    const { data } = await apiClient.post(`/moments/posts/comments/${commentId}/like`);
    return data;
  },

  async deleteComment(commentId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete(`/moments/posts/comments/${commentId}`);
    return data;
  },
};
