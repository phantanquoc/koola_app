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
  Business,
  BusinessListResponse,
  CreateBusinessPayload,
  MessageSearchItem,
} from '../../types';

// ─── Axios Instance ───────────────────────────────────────────────────────────

let accessToken: string | null = null;

// Force-logout handler — set by AuthContext on mount. When the 401 interceptor
// can't refresh the session, it invokes this so the UI can clear user state,
// disconnect sockets, and route back to login. Without this, the app would
// silently sit on a screen with no token, retrying failing requests forever.
type ForceLogoutHandler = () => void;
let forceLogoutHandler: ForceLogoutHandler | null = null;

export function setForceLogoutHandler(fn: ForceLogoutHandler | null): void {
  forceLogoutHandler = fn;
}

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
        await asyncStorage.setRefreshToken(data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed — force logout
        accessToken = null;
        await asyncStorage.clearTokens();
        // Notify the UI so AuthContext can clear user state and disconnect
        // sockets. Wrapped in try/catch so a buggy handler can't break the
        // interceptor chain.
        try {
          forceLogoutHandler?.();
        } catch {
          // ignore — best effort
        }
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

export async function refreshAccessTokenInMemory(): Promise<string | null> {
  try {
    const refreshToken = await asyncStorage.getRefreshToken();
    if (!refreshToken) return null;

    const { data } = await axios.post(`${ENV.API_URL}/auth/refresh`, {
      refreshToken,
    });

    accessToken = data.accessToken;
    await asyncStorage.setRefreshToken(data.refreshToken);
    return data.accessToken;
  } catch {
    accessToken = null;
    await asyncStorage.clearTokens();
    try {
      forceLogoutHandler?.();
    } catch {
      // ignore — best effort
    }
    return null;
  }
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
  async registerInit(body: {
    phone: string;
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ message: string }> {
    const { data } = await apiClient.post('/auth/register/init', body);
    return data;
  },
  async verifyOtp(
    email: string,
    otp: string,
  ): Promise<LoginResponse> {
    const { data } = await apiClient.post('/auth/register/verify', {
      email,
      otp,
    });
    return data;
  },
  async resendOtp(email: string): Promise<{ message: string }> {
    const { data } = await apiClient.post('/auth/register/resend-otp', {
      email,
    });
    return data;
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
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<UserSearchResult>> {
    const params: Record<string, string> = { q };
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get('/users/search', { params, signal });
    return data;
  },
  async getUserById(userId: string): Promise<User | null> {
    try {
      const { data } = await apiClient.get(`/users/${userId}`);
      return data as User;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },
};

// ─── Conversations API ────────────────────────────────────────────────────────

/**
 * Normalize a conversation returned by the backend.
 *
 * Backend populates `members.userId` into a full User object via Mongoose
 * `.populate()`. Mobile code — and the `Conversation` type — expects
 * `userId: string` plus a separate `user?: User` field. This adapter
 * flattens the populated form into that shape so callers do not need to
 * defensively unwrap it.
 */
function normalizeConversation(raw: unknown): Conversation {
  const conv = raw as Omit<Conversation, 'members'> & {
    members: Array<{
      userId: string | (User & { _id: string });
      user?: User;
      role: 'admin' | 'member';
      joinedAt: string;
    }>;
  };
  const members = conv.members.map((m) => {
    const uid: unknown = m.userId;
    if (uid && typeof uid === 'object' && '_id' in (uid as object)) {
      const populated = uid as User & { _id: string };
      return {
        role: m.role,
        joinedAt: m.joinedAt,
        userId: populated._id,
        user: populated,
      };
    }
    return {
      role: m.role,
      joinedAt: m.joinedAt,
      userId: uid as string,
      user: m.user,
    };
  });
  return { ...conv, members } as Conversation;
}

export const conversationsApi = {
  async list(page = 1, limit = 20): Promise<ConversationListResponse> {
    const { data } = await apiClient.get('/conversations', {
      params: { page, limit },
    });
    return {
      ...data,
      conversations: (data.conversations as unknown[]).map(normalizeConversation),
    };
  },
  async getDetails(conversationId: string) {
    const { data } = await apiClient.get(`/conversations/${conversationId}`);
    return {
      ...data,
      conversation: normalizeConversation(data.conversation),
    };
  },
  async createGroup(name: string, memberIds: string[]): Promise<{ conversation: Conversation }> {
    const { data } = await apiClient.post('/conversations', { name, memberIds });
    return { ...data, conversation: normalizeConversation(data.conversation) };
  },
  async startDirectChat(userId: string): Promise<{ conversation: Conversation; isNew: boolean }> {
    const { data } = await apiClient.post(`/conversations/direct/${userId}`);
    return { ...data, conversation: normalizeConversation(data.conversation) };
  },
  async pinMessage(conversationId: string, messageId: string) {
    const { data } = await apiClient.post(`/conversations/${conversationId}/pin/${messageId}`);
    return data;
  },
  async unpinMessage(conversationId: string, messageId: string) {
    const { data } = await apiClient.delete(`/conversations/${conversationId}/pin/${messageId}`);
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
      mediaDuration?: number;
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
  async forward(messageId: string, targetConversationIds: string[]) {
    const { data } = await apiClient.post(`/messages/${messageId}/forward`, {
      targetConversationIds,
    });
    return data;
  },
  async searchMessages(
    q: string,
    cursor?: string,
    limit = 20,
    signal?: AbortSignal,
  ): Promise<{
    items: MessageSearchItem[];
    nextCursor: string | null;
    total: number;
  }> {
    const params: Record<string, string | number> = { q, limit };
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get('/messages/search', { params, signal });
    return data;
  },
  async toggleReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
  ) {
    const { data } = await apiClient.put(
      `/conversations/${conversationId}/messages/${messageId}/react`,
      { emoji },
    );
    return data;
  },
  async deleteForMe(conversationId: string, messageId: string) {
    const { data } = await apiClient.put(
      `/conversations/${conversationId}/messages/${messageId}/delete-for-me`,
    );
    return data;
  },
  async markRead(conversationId: string, upToTimestamp?: string) {
    const { data } = await apiClient.post(
      `/conversations/${conversationId}/messages/read`,
      upToTimestamp ? { upToTimestamp } : {},
    );
    return data;
  },
};

// ─── Media API ────────────────────────────────────────────────────────────────

export const mediaApi = {
  async requestUploadUrl(body: {
    filename: string;
    mimeType: string;
    size: number;
    conversationId?: string;
  }): Promise<{ uploadUrl: string; mediaKey: string; expiresAt: string }> {
    const { data } = await apiClient.post('/media/upload', body);
    return data;
  },
  async getDownloadUrl(
    mediaKey: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const { data } = await apiClient.get(
      `/media/${encodeURIComponent(mediaKey)}`,
    );
    return data;
  },
  async deleteMedia(mediaKey: string): Promise<{ deleted: boolean }> {
    const { data } = await apiClient.delete(
      `/media/${encodeURIComponent(mediaKey)}`,
    );
    return data;
  },
};

// ─── Businesses API ───────────────────────────────────────────────────────────

export const businessesApi = {
  async list(params?: {
    q?: string;
    relationshipType?: string;
    category?: string;
    province?: string;
    cursor?: string;
    limit?: number | string;
  }): Promise<BusinessListResponse> {
    const { data } = await apiClient.get('/businesses', { params });
    return data;
  },
  async getById(id: string): Promise<Business> {
    const { data } = await apiClient.get(`/businesses/${id}`);
    return data;
  },
  async getMine(): Promise<Business[]> {
    const { data } = await apiClient.get('/businesses/me');
    return data;
  },
  async getMyConnections(): Promise<{ items: Business[] }> {
    const { data } = await apiClient.get('/businesses/connected');
    return data;
  },
  async create(
    body: CreateBusinessPayload,
  ): Promise<{ business: Business }> {
    const { data } = await apiClient.post('/businesses', body);
    return data;
  },
  async update(
    id: string,
    body: Partial<CreateBusinessPayload>,
  ): Promise<{ business: Business }> {
    const { data } = await apiClient.put(`/businesses/${id}`, body);
    return data;
  },
  async connect(id: string): Promise<{ message: string }> {
    const { data } = await apiClient.post(`/businesses/${id}/connect`);
    return data;
  },
  async disconnect(id: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete(`/businesses/${id}/connect`);
    return data;
  },
};

export default apiClient;
