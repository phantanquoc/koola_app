import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import ENV from '../../config/env';
import { asyncStorage } from '../storage/asyncStorage';
import type {
  LoginResponse,
  ConversationListResponse,
  Conversation,
  MessageListResponse,
  SyncMessagesResponse,
  PaginatedResponse,
  UserSearchResult,
  User,
  MessageSearchItem,
  Account,
  CreateBusinessAccountPayload,
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

        // Step 1: Refresh root access token
        const { data } = await axios.post(`${ENV.API_URL}/auth/refresh`, {
          refreshToken,
        });

        let newAccessToken: string = data.accessToken;
        await asyncStorage.setRefreshToken(data.refreshToken);

        // Step 2: If active account is a business account, re-mint the biz token
        const activeAccountId = await asyncStorage.getActiveAccountId();
        if (activeAccountId) {
          try {
            // Use the root token to switch into the business account
            const { data: switchData } = await axios.post(
              `${ENV.API_URL}/accounts/switch`,
              { targetAccountId: activeAccountId },
              { headers: { Authorization: `Bearer ${newAccessToken}` } },
            );
            newAccessToken = switchData.accessToken;
          } catch {
            // Switch failed — fall back to root personal and clear active account
            await asyncStorage.clearActiveAccountId();
            // newAccessToken remains the root personal token
          }
        }

        accessToken = newAccessToken;

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed — force logout
        accessToken = null;
        await asyncStorage.clearTokens();
        await asyncStorage.clearActiveAccountId();
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

    let newAccessToken: string = data.accessToken;
    await asyncStorage.setRefreshToken(data.refreshToken);

    // If active account is a business account, re-mint the biz token
    const activeAccountId = await asyncStorage.getActiveAccountId();
    if (activeAccountId) {
      try {
        const { data: switchData } = await axios.post(
          `${ENV.API_URL}/accounts/switch`,
          { targetAccountId: activeAccountId },
          { headers: { Authorization: `Bearer ${newAccessToken}` } },
        );
        newAccessToken = switchData.accessToken;
      } catch {
        await asyncStorage.clearActiveAccountId();
      }
    }

    accessToken = newAccessToken;
    return newAccessToken;
  } catch {
    accessToken = null;
    await asyncStorage.clearTokens();
    await asyncStorage.clearActiveAccountId();
    try {
      forceLogoutHandler?.();
    } catch {
      // ignore — best effort
    }
    return null;
  }
}

/**
 * Socket-safe token refresh. Unlike `refreshAccessTokenInMemory` which
 * force-logs-out on ANY failure (including transient network errors), this
 * function distinguishes error classes so SocketService can decide whether to
 * retry (network) or give up (auth expired / revoked).
 */
export async function refreshAccessTokenForSocket(): Promise<{
  token: string | null;
  reason: 'ok' | 'network' | 'auth';
}> {
  try {
    const refreshToken = await asyncStorage.getRefreshToken();
    if (!refreshToken) {
      // No refresh token at all — session is gone
      accessToken = null;
      await asyncStorage.clearTokens();
      await asyncStorage.clearActiveAccountId();
      try { forceLogoutHandler?.(); } catch { /* ignore */ }
      return { token: null, reason: 'auth' };
    }

    const { data } = await axios.post(`${ENV.API_URL}/auth/refresh`, {
      refreshToken,
    });

    let newAccessToken: string = data.accessToken;
    await asyncStorage.setRefreshToken(data.refreshToken);

    // If active account is a business account, re-mint the biz token
    const activeAccountId = await asyncStorage.getActiveAccountId();
    if (activeAccountId) {
      try {
        const { data: switchData } = await axios.post(
          `${ENV.API_URL}/accounts/switch`,
          { targetAccountId: activeAccountId },
          { headers: { Authorization: `Bearer ${newAccessToken}` } },
        );
        newAccessToken = switchData.accessToken;
      } catch {
        await asyncStorage.clearActiveAccountId();
      }
    }

    accessToken = newAccessToken;
    return { token: newAccessToken, reason: 'ok' };
  } catch (err: unknown) {
    // Classify the error
    const axiosErr = err as { response?: { status?: number } };
    if (axiosErr.response?.status === 401 || axiosErr.response?.status === 403) {
      // Refresh token genuinely invalid / revoked — session is dead
      accessToken = null;
      await asyncStorage.clearTokens();
      await asyncStorage.clearActiveAccountId();
      try { forceLogoutHandler?.(); } catch { /* ignore */ }
      return { token: null, reason: 'auth' };
    }
    // No response = network error, or any other unexpected error → retryable
    return { token: null, reason: 'network' };
  }
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await apiClient.post('/auth/login', { email, password });
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
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ message: string; expiresIn: number }> {
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
  async forgotPassword(email: string): Promise<{ message: string }> {
    const { data } = await apiClient.post('/auth/forgot-password', { email });
    return data;
  },
  async verifyResetOtp(
    email: string,
    otp: string,
  ): Promise<{ resetToken: string }> {
    const { data } = await apiClient.post('/auth/reset-password/verify', {
      email,
      otp,
    });
    return data;
  },
  async resetPassword(
    resetToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const { data } = await apiClient.post('/auth/reset-password', {
      resetToken,
      newPassword,
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
  async updateMe(body: {
    displayName?: string;
    avatar?: string;
    bio?: string;
    username?: string;
    coverPhoto?: string;
    dateOfBirth?: string | null;
    gender?: string | null;
  }): Promise<User> {
    const { data } = await apiClient.put('/users/me', body);
    return data;
  },
  async checkUsername(u: string): Promise<{ available: boolean; reason?: string }> {
    const { data } = await apiClient.get('/users/check-username', { params: { u } });
    return data;
  },
  async requestPhoneOtp(phone: string): Promise<{ message: string; expiresIn: number }> {
    const { data } = await apiClient.post('/users/me/phone/request-otp', { phone });
    return data;
  },
  async verifyPhoneOtp(phone: string, code: string): Promise<User> {
    const { data } = await apiClient.post('/users/me/phone/verify-otp', { phone, code });
    return data;
  },
  async removePhone(): Promise<User> {
    const { data } = await apiClient.delete('/users/me/phone');
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
      replyTo?: string;
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
  async setReaction(
    conversationId: string,
    messageId: string,
    emoji: string | null,
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

// ─── Accounts API ─────────────────────────────────────────────────────────────

export const accountsApi = {
  async list(): Promise<Account[]> {
    const { data } = await apiClient.get('/accounts');
    return data;
  },
  async createBusiness(payload: CreateBusinessAccountPayload): Promise<{ account: Account }> {
    const { data } = await apiClient.post('/accounts/business', payload);
    return data;
  },
  async switch(targetAccountId: string): Promise<{ accessToken: string }> {
    const { data } = await apiClient.post('/accounts/switch', { targetAccountId });
    return data;
  },
};

// ─── Account Discovery API ───────────────────────────────────────────────────

export interface BusinessAccountItem {
  _id: string;
  displayName: string;
  avatar?: string;
  logoKey?: string;
  tagline?: string;
  description?: string;
  relationshipType?: 'partner' | 'supplier';
  province?: string;
  businessCategory?: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  address?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface BusinessAccountListResponse {
  items: BusinessAccountItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const accountDiscoveryApi = {
  async list(params?: {
    q?: string;
    relationshipType?: string;
    businessCategory?: string;
    province?: string;
    cursor?: string;
    limit?: number | string;
    sort?: string;
  }): Promise<BusinessAccountListResponse> {
    const { data } = await apiClient.get('/accounts/discover', { params });
    return data;
  },

  async getById(accountId: string): Promise<BusinessAccountItem> {
    const { data } = await apiClient.get(`/accounts/discover/${accountId}`);
    return data;
  },
};

export default apiClient;
