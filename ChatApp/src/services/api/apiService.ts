import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import ENV from '../../config/env';
import { asyncStorage } from '../storage/asyncStorage';
import type {
  LoginResponse,
  RegisterResponse,
  ConversationListResponse,
  Conversation,
  MessageListResponse,
  SyncMessagesResponse,
  PaginatedResponse,
  UserSearchResult,
  User,
} from '../../types';

// ─── Axios Instance ───────────────────────────────────────────────────────────

let accessToken: string | null = null;

const apiClient: AxiosInstance = axios.create({
  baseURL: ENV.API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor — handle 401 + refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await asyncStorage.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${ENV.API_URL}/auth/refresh`, {
          refreshToken,
        });

        accessToken = data.accessToken;
        await asyncStorage.setAccessToken(data.accessToken);
        await asyncStorage.setRefreshToken(data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed — force logout
        accessToken = null;
        await asyncStorage.clearTokens();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

// ─── Token management ─────────────────────────────────────────────────────────

export function setAccessTokenInMemory(token: string | null): void {
  accessToken = token;
}

export function getAccessTokenInMemory(): string | null {
  return accessToken;
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await apiClient.post('/auth/login', { email, password });
    return data;
  },
  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<RegisterResponse> {
    const { data } = await apiClient.post('/auth/register', {
      email,
      password,
      displayName,
    });
    return data;
  },
  async refresh(refreshToken: string) {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken });
    return data;
  },
  async logout(refreshToken: string) {
    await apiClient.post('/auth/logout', { refreshToken });
  },
};

// ─── Users API ────────────────────────────────────────────────────────────────

export const usersApi = {
  async getMe(): Promise<User> {
    const { data } = await apiClient.get('/users/me');
    return data;
  },
  async updateMe(body: { displayName?: string; avatar?: string }) {
    const { data } = await apiClient.put('/users/me', body);
    return data;
  },
  async updateSettings(body: { notificationsEnabled?: boolean }) {
    const { data } = await apiClient.put('/users/me/settings', body);
    return data;
  },
  async registerFcmToken(fcmToken: string, platform: string) {
    await apiClient.put('/users/me/fcm-token', { fcmToken, platform });
  },
  async removeFcmToken(fcmToken: string) {
    await apiClient.delete('/users/me/fcm-token', { data: { fcmToken } });
  },
  async searchUsers(
    q: string,
    cursor?: string,
  ): Promise<PaginatedResponse<UserSearchResult>> {
    const params: Record<string, string> = { q };
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get('/users/search', { params });
    return data;
  },
};

// ─── Conversations API ────────────────────────────────────────────────────────

export const conversationsApi = {
  async list(page = 1, limit = 20): Promise<ConversationListResponse> {
    const { data } = await apiClient.get('/conversations', {
      params: { page, limit },
    });
    return data;
  },
  async getDetails(conversationId: string) {
    const { data } = await apiClient.get(`/conversations/${conversationId}`);
    return data;
  },
  async createGroup(name: string, memberIds: string[]): Promise<{ conversation: Conversation }> {
    const { data } = await apiClient.post('/conversations', { name, memberIds });
    return data;
  },
  async startDirectChat(userId: string): Promise<{ conversation: Conversation; isNew: boolean }> {
    const { data } = await apiClient.post(`/conversations/direct/${userId}`);
    return data;
  },
};

// ─── Messages API ─────────────────────────────────────────────────────────────

export const messagesApi = {
  async list(
    conversationId: string,
    cursor?: string,
    limit = 20,
  ): Promise<MessageListResponse> {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get(
      `/conversations/${conversationId}/messages`,
      { params },
    );
    return data;
  },
  async send(
    conversationId: string,
    body: {
      content?: string;
      type?: string;
      clientMessageId?: string;
      mediaUrl?: string;
      mediaMimeType?: string;
      mediaSize?: number;
    },
  ) {
    const { data } = await apiClient.post(
      `/conversations/${conversationId}/messages`,
      body,
    );
    return data;
  },
  async deleteMessage(conversationId: string, messageId: string) {
    const { data } = await apiClient.delete(
      `/conversations/${conversationId}/messages/${messageId}`,
    );
    return data;
  },
  async sync(
    since?: string,
    cursor?: string,
    limit = 100,
  ): Promise<SyncMessagesResponse> {
    const params: Record<string, string | number> = { limit };
    if (since) params.since = since;
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get('/messages/sync', { params });
    return data;
  },
};

export default apiClient;
