import api from '../../utils/apiClient';
import { AxiosResponse } from 'axios';
import { Conversation, Message, ConversationListResponse } from '../../types';

// ─── Auth ──────────────────────────────────────────────
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  register: (data: { email: string; password: string; displayName: string }) =>
    api.post<AuthTokensResponse>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<AuthTokensResponse>('/auth/login', data),
  refresh: (refreshToken: string): Promise<AxiosResponse<AuthTokensResponse>> =>
    api.post<AuthTokensResponse>('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  getMe: () => api.get('/users/me'),
};

// ─── Users ─────────────────────────────────────────────
export const usersApi = {
  getMe: () => api.get('/users/me'),
  updateMe: (data: { displayName?: string; avatar?: string }) =>
    api.put('/users/me', data),
  getPresence: (userId: string) =>
    api.get(`/users/${userId}/presence`),
  batchGetPresence: (ids: string[]) =>
    api.get(`/users/presence?ids=${ids.join(',')}`),
  updateFcmToken: (fcmToken: string, platform: string) =>
    api.put('/users/me/fcm-token', { fcmToken, platform }),
  removeFcmToken: (fcmToken: string) =>
    api.delete('/users/me/fcm-token', { data: { fcmToken } }),
  updateSettings: (settings: { notificationsEnabled?: boolean }) =>
    api.put('/users/me/settings', settings),
  searchUsers: (q: string, cursor?: string) => {
    const params = new URLSearchParams({ q });
    if (cursor) params.set('cursor', cursor);
    return api.get(`/users/search?${params}`);
  },
};

// ─── Conversations ──────────────────────────────────────
export const conversationsApi = {
  list: (page = 1, limit = 20): Promise<AxiosResponse<ConversationListResponse>> =>
    api.get<ConversationListResponse>(`/conversations?page=${page}&limit=${limit}`),
  get: (conversationId: string) =>
    api.get(`/conversations/${conversationId}`),
  create: (data: { type: 'direct' | 'group'; name?: string; memberIds: string[] }) =>
    api.post<Conversation>('/conversations', data),
  addMember: (conversationId: string, userId: string) =>
    api.post(`/conversations/${conversationId}/members`, { userId }),
  removeMember: (conversationId: string, userId: string) =>
    api.delete(`/conversations/${conversationId}/members/${userId}`),
  startDirectChat: (userId: string) =>
    api.post('/conversations/direct/' + userId),
};

// ─── Messages ──────────────────────────────────────────
export const messagesApi = {
  list: (conversationId: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return api.get(`/conversations/${conversationId}/messages?${params}`);
  },
  send: (conversationId: string, data: { type: string; content: string; mediaUrl?: string; mediaMimeType?: string; mediaSize?: number; clientMessageId?: string }) =>
    api.post(`/conversations/${conversationId}/messages`, data),
  delete: (conversationId: string, messageId: string) =>
    api.delete(`/conversations/${conversationId}/messages/${messageId}`),
  search: (conversationId: string, q: string, cursor?: string) => {
    const params = new URLSearchParams({ q });
    if (cursor) params.set('cursor', cursor);
    return api.get(`/conversations/${conversationId}/messages/search?${params}`);
  },
  sync: (since: string, cursor?: string) => {
    const params = new URLSearchParams({ since });
    if (cursor) params.set('cursor', cursor);
    return api.get(`/messages/sync?${params}`);
  },
};

// ─── Media ─────────────────────────────────────────────
export const mediaApi = {
  getUploadUrl: (filename: string, mimeType: string, size: number) =>
    api.post('/media/upload', { filename, mimeType, size }),
  getUrl: (mediaKey: string) =>
    api.get(`/media/${mediaKey}`),
};
