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
}

export interface PostMediaView {
  mediaKey: string;
  mediaType: MediaType;
  thumbnailKey: string | null;
  duration: number | null;
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
  authorDisplayName: string;
  authorAvatar: string | null;
  replies?: PostCommentView[];
  replyCount?: number;
}

export interface PostView {
  _id: string;
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

export interface PostCommentsResponse {
  comments: PostCommentView[];
  nextCursor: string | null;
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

  async sharePost(postId: string): Promise<{ shareCount: number; deepLink: string }> {
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

  async deleteComment(commentId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete(`/moments/posts/comments/${commentId}`);
    return data;
  },
};
