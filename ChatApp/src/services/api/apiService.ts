import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import ENV from '../../config/env';
import { asyncStorage } from '../storage/asyncStorage';
import { getDeviceHeaders } from '../DeviceIdService';
import type {
  LoginResponse,
  ConversationListResponse,
  Conversation,
  MessageListResponse,
  MessageAroundResponse,
  SyncMessagesResponse,
  PaginatedResponse,
  UserSearchResult,
  User,
  MessageSearchItem,
  Account,
  BusinessRole,
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

/**
 * Device session headers for the raw-`axios` calls below.
 *
 * The refresh paths deliberately bypass `apiClient` (its response interceptor
 * would recurse), which also means they bypass the request interceptor that
 * normally attaches these headers. Each of those paths re-switches into the
 * active business account, and the backend only creates/replaces the device
 * session when X-Device-ID is present — without this the device limit would go
 * unenforced on every refresh. Never throws: device metadata is best-effort.
 */
async function safeDeviceHeaders(): Promise<Record<string, string>> {
  try {
    return await getDeviceHeaders();
  } catch {
    return {};
  }
}

const apiClient: AxiosInstance = axios.create({
  baseURL: ENV.API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token + device session headers
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (config.headers) {
    // Attach access token
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // Attach device session headers for business account tracking. The backend
    // enforces 1 active device per business member off X-Device-ID, and
    // refreshes the session's lastActiveAt on every business API call, so these
    // go on every request rather than just /accounts/switch.
    try {
      const deviceHeaders = await getDeviceHeaders();
      for (const [name, value] of Object.entries(deviceHeaders)) {
        config.headers[name] = value;
      }
    } catch (err) {
      // Non-fatal: proceed without device headers. Personal accounts don't
      // require device tracking; business switches degrade to no session row.
      console.warn('[apiService] Failed to resolve device headers:', err);
    }
  }
  return config;
});

/**
 * Marker the backend's BusinessSessionGuard sends when this device lost the
 * business session to a newer login, or an admin forced it out. Matches
 * `BUSINESS_SESSION_ENDED` in chat-backend/src/common/guards/business-session.guard.ts.
 */
const SESSION_ENDED_MARKER = 'BUSINESS_SESSION_ENDED';

/** User-facing copy for that case (business-members task 17.1). */
export const SESSION_ENDED_MESSAGE =
  'Phiên làm việc đã kết thúc vì tài khoản được đăng nhập trên thiết bị khác.';

type SessionEndedHandler = (message: string) => void;
let sessionEndedHandler: SessionEndedHandler | null = null;

/**
 * Register the UI hook for "your business session was taken over".
 *
 * Separate from `setForceLogoutHandler`: a force-logout is a dead credential
 * and the user must sign in again, whereas this is a live personal session
 * whose BUSINESS context was revoked — the right response is to drop back to
 * the personal account and say why, not to log the user out.
 */
export function setSessionEndedHandler(fn: SessionEndedHandler | null): void {
  sessionEndedHandler = fn;
}

/** True when a 401 carries the guard's session-ended marker. */
function isSessionEnded(error: {
  response?: { data?: { message?: unknown } };
}): boolean {
  const msg = error?.response?.data?.message;
  if (typeof msg === 'string') return msg.includes(SESSION_ENDED_MARKER);
  if (Array.isArray(msg)) {
    return msg.some((m) => typeof m === 'string' && m.includes(SESSION_ENDED_MARKER));
  }
  return false;
}

// Response interceptor — handle 401 + refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Task 17.1: a revoked DEVICE session, not a dead token. Retrying the
    // refresh would re-switch into the business and evict the device that just
    // took over — a ping-pong between the two devices. Hand it to the UI
    // instead so it can fall back to the personal account.
    if (error.response?.status === 401 && isSessionEnded(error)) {
      await asyncStorage.clearActiveAccountId();
      try {
        sessionEndedHandler?.(SESSION_ENDED_MESSAGE);
      } catch {
        // ignore — best effort
      }
      return Promise.reject(error);
    }

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
            // Use the root token to switch into the business account.
            // NOTE: raw `axios` here (not apiClient) to avoid recursing through
            // this interceptor — so the device headers must be attached by hand,
            // otherwise the backend skips session creation and the 1-device
            // limit is silently bypassed on every token refresh.
            const { data: switchData } = await axios.post(
              `${ENV.API_URL}/accounts/switch`,
              { targetAccountId: activeAccountId },
              {
                headers: {
                  Authorization: `Bearer ${newAccessToken}`,
                  ...(await safeDeviceHeaders()),
                },
              },
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
          {
            headers: {
              Authorization: `Bearer ${newAccessToken}`,
              ...(await safeDeviceHeaders()),
            },
          },
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
          {
            headers: {
              Authorization: `Bearer ${newAccessToken}`,
              ...(await safeDeviceHeaders()),
            },
          },
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
  async updateSettings(body: {
    notificationsEnabled?: boolean;
    preferredLanguage?: string;
    autoTranslateEnabled?: boolean;
  }) {
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
  // ─── conversation-quick-actions: private per-user prefs ────────────────
  async updatePrefs(
    conversationId: string,
    body: { pinned?: boolean; muteDuration?: '1h' | '8h' | '24h' | 'forever' | 'off' },
  ): Promise<{ conversationId: string; pinned: boolean; mutedUntil: string | null; clearedAt: string | null }> {
    const { data } = await apiClient.patch(`/conversations/${conversationId}/prefs`, body);
    return data;
  },
  async clear(conversationId: string): Promise<{ conversationId: string; pinned: boolean; mutedUntil: string | null; clearedAt: string | null }> {
    const { data } = await apiClient.post(`/conversations/${conversationId}/clear`);
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
  async getMessagesAround(
    conversationId: string,
    messageId: string,
    limit = 20,
  ): Promise<MessageAroundResponse> {
    const params: Record<string, string | number> = { around: messageId, limit };
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

/**
 * Normalize one entry of `GET /accounts`.
 *
 * The backend returns three shapes from one array (AccountsService.listAccounts):
 * the root personal user, owned businesses (`role: 'owner'`, `isMember: false`)
 * and member businesses (`role` from business_members, plus `ownerDisplayName`
 * and `isMember: true`). ObjectIds arrive serialized, and the root document has
 * no `role`/`isMember` at all — so coerce ids to strings and only keep a role
 * when it is one the app understands.
 */
function normalizeAccount(raw: unknown): Account {
  const a = raw as Record<string, unknown>;
  const role = a.role;
  const accountType = a.accountType === 'business' ? 'business' : 'personal';

  return {
    _id: String(a._id),
    displayName: typeof a.displayName === 'string' ? a.displayName : '',
    avatar: typeof a.avatar === 'string' ? a.avatar : undefined,
    accountType,
    verificationStatus: a.verificationStatus as Account['verificationStatus'],
    logoKey: typeof a.logoKey === 'string' ? a.logoKey : undefined,
    ownerUserId: a.ownerUserId != null ? String(a.ownerUserId) : undefined,
    role:
      role === 'owner' || role === 'admin' || role === 'editor' || role === 'viewer'
        ? role
        : undefined,
    ownerDisplayName:
      typeof a.ownerDisplayName === 'string' ? a.ownerDisplayName : undefined,
    // Member businesses are the ones the user joined rather than owns; the
    // account switcher groups on this (owned vs joined).
    isMember: a.isMember === true,
    // Owned businesses only (task 13.5). The backend computes it with one
    // grouped count, so this is never a per-row fetch.
    memberCount:
      typeof a.memberCount === 'number' && Number.isFinite(a.memberCount)
        ? a.memberCount
        : undefined,
  };
}

export const accountsApi = {
  async list(): Promise<Account[]> {
    const { data } = await apiClient.get('/accounts');
    return Array.isArray(data) ? data.map(normalizeAccount) : [];
  },
  async createBusiness(payload: CreateBusinessAccountPayload): Promise<{ account: Account }> {
    const { data } = await apiClient.post('/accounts/business', payload);
    return data;
  },
  /**
   * `forcedLogout` is true when this switch evicted the member's session on
   * another device (backend enforces 1 active device per business member).
   */
  async switch(targetAccountId: string): Promise<{ accessToken: string; forcedLogout?: boolean }> {
    const { data } = await apiClient.post('/accounts/switch', { targetAccountId });
    return data;
  },
};

// ─── Commerce Catalog API (commerce-catalog-live) ───────────────────────────
// Public endpoints (`@Public()` on the backend) — sent through apiClient anyway
// so there is one HTTP stack (timeouts, base URL, auth refresh) for the app.

export type CommerceCategory = 'grocery' | 'food' | 'electronics' | 'home' | 'beauty';
export type CommerceSort = 'newest' | 'bestseller' | 'priceLow';

export interface ProductCardSeller {
  id: string;
  displayName: string;
  verified: true;
  province: string | null;
}

export interface ProductCard {
  id: string;
  name: string;
  /** Integer VND. */
  price: number;
  originalPrice: number | null;
  /** Presigned GET (≈1h) for the first image, or null. */
  imageUrl: string | null;
  imageKey: string | null;
  category: CommerceCategory;
  tags: string[];
  deliveryText: string;
  soldCount: number;
  seller: ProductCardSeller;
}

export interface ProductListParams {
  q?: string;
  category?: CommerceCategory;
  tag?: string;
  sellerId?: string;
  sort?: CommerceSort;
  page?: number;
  limit?: number;
}

export interface ProductListResponse {
  data: ProductCard[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ProductDetail extends Omit<ProductCard, 'seller'> {
  description: string;
  /** Same order as imageKeys; an entry is null if the server could not sign it. */
  imageUrls: (string | null)[];
  imageKeys: string[];
  seller: ProductCardSeller & {
    businessCategory: string | null;
    logoUrl: string | null;
  };
}

export interface SellerProfile {
  id: string;
  displayName: string;
  verified: true;
  province: string | null;
  businessCategory: string | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  followerCount?: number;
  totalSoldCount?: number;
  rating?: number;
  reviewCount?: number;
  foundedYear?: number | null;
  employeeCount?: string | null;
  exportMarketsCount?: number | null;
  viewCount?: number | null;
}

export interface SellerStorefrontResponse {
  seller: SellerProfile;
  productCount: number;
}

export interface ValidateResult {
  id: string;
  available: boolean;
  price: number | null;
  name: string | null;
  imageUrl: string | null;
  seller: { id: string; displayName: string } | null;
}

export type CommerceOrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED';
export type CommerceOrderPayment = 'cod' | 'bank';

export interface CommerceOrderBuyerInfo {
  name: string;
  phone: string;
  address: string;
  note: string | null;
}

export interface CommerceOrderItemSnapshot {
  productId: string;
  name: string;
  price: number;
  imageKey: string | null;
  qty: number;
}

export interface CommerceOrderShipping {
  fee: number | null;
  carrier: string | null;
  trackingCode: string | null;
  expectedDeliveryDate: string | null;
}

export interface CommerceOrderStatusEntry {
  status: CommerceOrderStatus;
  at: string;
  by: string;
  note: string | null;
}

export interface CommerceOrder {
  id: string;
  orderCode: string;
  buyerId: string;
  sellerId: string;
  buyerName: string | null;
  sellerName: string | null;
  items: CommerceOrderItemSnapshot[];
  itemCount: number;
  subtotal: number;
  shippingFee: number | null;
  total: number;
  buyerInfo: CommerceOrderBuyerInfo;
  payment: CommerceOrderPayment;
  shipping: CommerceOrderShipping;
  status: CommerceOrderStatus;
  statusHistory: CommerceOrderStatusEntry[];
  conversationId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CommerceOrderDetailResponse {
  order: CommerceOrder;
  seller: { id: string; displayName: string } | null;
  buyer: { id: string; displayName: string } | null;
  itemImageUrls: (string | null)[];
}

export interface CommerceOrderListResponse {
  data: CommerceOrder[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CommercePlaceOrderPayload {
  sellerId: string;
  items: { productId: string; qty: number }[];
  buyerInfo: { name: string; phone: string; address: string; note?: string };
  payment: CommerceOrderPayment;
  idempotencyKey: string;
}

export interface CommercePlaceOrderResponse {
  order: CommerceOrder;
  conversationId: string;
}

export interface CommerceListOrdersParams {
  status?: CommerceOrderStatus;
  page?: number;
  limit?: number;
}

export const commerceApi = {
  async listProducts(
    params: ProductListParams,
    opts?: { signal?: AbortSignal },
  ): Promise<ProductListResponse> {
    // Drop empty values so the backend's forbidNonWhitelisted / @IsIn never
    // sees `category=` or `q=` from a cleared filter.
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      clean[k] = v as string | number;
    }
    const { data } = await apiClient.get('/commerce/products', {
      params: clean,
      signal: opts?.signal,
    });
    return data;
  },
  async getProduct(id: string): Promise<ProductDetail> {
    const { data } = await apiClient.get(`/commerce/products/${encodeURIComponent(id)}`);
    return data;
  },
  async getSeller(id: string): Promise<SellerStorefrontResponse> {
    const { data } = await apiClient.get(`/commerce/sellers/${encodeURIComponent(id)}`);
    return data;
  },
  async validate(ids: string[]): Promise<ValidateResult[]> {
    const { data } = await apiClient.post('/commerce/products/validate', { ids });
    return (data as { items: ValidateResult[] }).items;
  },

  // ── Orders (commerce-orders) ───────────────────────────────────────────
  async placeOrder(payload: CommercePlaceOrderPayload): Promise<CommercePlaceOrderResponse> {
    const { data } = await apiClient.post('/commerce/orders', payload);
    return data as CommercePlaceOrderResponse;
  },
  async listMyOrders(params?: CommerceListOrdersParams): Promise<CommerceOrderListResponse> {
    const { data } = await apiClient.get('/commerce/orders/mine', { params });
    return data as CommerceOrderListResponse;
  },
  async listSellerOrders(params?: CommerceListOrdersParams): Promise<CommerceOrderListResponse> {
    const { data } = await apiClient.get('/commerce/orders/seller', { params });
    return data as CommerceOrderListResponse;
  },
  async getOrder(id: string): Promise<CommerceOrderDetailResponse> {
    const { data } = await apiClient.get(`/commerce/orders/${encodeURIComponent(id)}`);
    return data as CommerceOrderDetailResponse;
  },
  async confirmOrder(id: string, body: { shippingFee: number; expectedDeliveryDate: string }): Promise<CommerceOrder> {
    const { data } = await apiClient.patch(`/commerce/orders/${encodeURIComponent(id)}/confirm`, body);
    return (data as { order?: CommerceOrder }).order ?? (data as CommerceOrder);
  },
  async rejectOrder(id: string, body: { reason: string }): Promise<CommerceOrder> {
    const { data } = await apiClient.patch(`/commerce/orders/${encodeURIComponent(id)}/reject`, body);
    return (data as { order?: CommerceOrder }).order ?? (data as CommerceOrder);
  },
  async shipOrder(id: string, body: { carrier?: string; trackingCode?: string }): Promise<CommerceOrder> {
    const { data } = await apiClient.patch(`/commerce/orders/${encodeURIComponent(id)}/ship`, body);
    return (data as { order?: CommerceOrder }).order ?? (data as CommerceOrder);
  },
  async receiveOrder(id: string): Promise<CommerceOrder> {
    const { data } = await apiClient.patch(`/commerce/orders/${encodeURIComponent(id)}/receive`, {});
    return (data as { order?: CommerceOrder }).order ?? (data as CommerceOrder);
  },
  async cancelOrder(id: string, reason?: string): Promise<CommerceOrder> {
    const { data } = await apiClient.patch(`/commerce/orders/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {});
    return (data as { order?: CommerceOrder }).order ?? (data as CommerceOrder);
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

// ─── Call Logs API ──────────────────────────────────────────────────────────
export interface CallLogEntry {
  _id: string;
  sessionId: string;
  initiatorId: string;
  targetUserId: string;
  conversationId: string;
  callType: 'audio' | 'video';
  status: 'ended' | 'missed' | 'declined' | 'busy' | 'failed' | 'cancelled' | 'answered';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  duration: number;
  initiatorName?: string;
  initiatorAvatar?: string;
  targetName?: string;
  targetAvatar?: string;
}

export interface CallLogsResponse {
  items: CallLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export const callLogsApi = {
  async getHistory(params: {
    page?: number;
    limit?: number;
    conversationId?: string;
  }): Promise<CallLogsResponse> {
    const { data } = await apiClient.get('/call-logs', { params });
    return data;
  },
};

// ─── Business Members & Invites API (business-members-system) ───────────────
// Mirrors BusinessMembersController + BusinessInvitesController. Every write
// here is additionally guarded server-side by BusinessRoleGuard (admin+), so
// the client-side PermissionGate is a UX affordance, never the boundary.

/** A populated user reference as returned by Mongoose `.populate()`. */
export interface BusinessMemberUser {
  _id: string;
  displayName: string;
  avatar?: string;
  email?: string;
}

export interface BusinessMember {
  /** Membership row id — NOT the user id. Use `userId._id` for member routes. */
  _id: string;
  userId: BusinessMemberUser;
  role: BusinessRole;
  /** Populated to `{ displayName }` when the member arrived via an invite. */
  invitedBy?: { _id?: string; displayName?: string } | null;
  joinedAt?: string;
  lastActiveAt?: string | null;
  status: 'active' | 'suspended';
}

export interface BusinessInvite {
  id: string;
  email: string;
  role: BusinessRole;
  invitedBy?: { _id?: string; displayName?: string } | null;
  createdAt?: string;
  expiresAt?: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

/** Roles an invite may offer — `owner` is never invitable (backend DTO). */
export type InvitableRole = Exclude<BusinessRole, 'owner'>;

function isBusinessRole(value: unknown): value is BusinessRole {
  return value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer';
}

/**
 * The backend returns raw Mongoose docs, so ids arrive as ObjectIds that
 * serialise to strings and `userId` may be an unpopulated id if the referenced
 * user was deleted. Normalising here keeps every screen off defensive casts.
 */
function normalizeMember(raw: unknown): BusinessMember {
  const m = (raw ?? {}) as Record<string, unknown>;
  const rawUser = m.userId;
  const user = (typeof rawUser === 'object' && rawUser !== null ? rawUser : {}) as Record<
    string,
    unknown
  >;
  const invitedBy =
    typeof m.invitedBy === 'object' && m.invitedBy !== null
      ? (m.invitedBy as Record<string, unknown>)
      : null;

  return {
    _id: String(m._id ?? ''),
    userId: {
      _id: String(user._id ?? (typeof rawUser === 'string' ? rawUser : '')),
      displayName:
        typeof user.displayName === 'string' && user.displayName
          ? user.displayName
          : 'Người dùng đã xoá',
      avatar: typeof user.avatar === 'string' ? user.avatar : undefined,
      email: typeof user.email === 'string' ? user.email : undefined,
    },
    role: isBusinessRole(m.role) ? m.role : 'viewer',
    invitedBy: invitedBy
      ? {
          _id: invitedBy._id != null ? String(invitedBy._id) : undefined,
          displayName:
            typeof invitedBy.displayName === 'string' ? invitedBy.displayName : undefined,
        }
      : null,
    joinedAt: typeof m.joinedAt === 'string' ? m.joinedAt : undefined,
    lastActiveAt: typeof m.lastActiveAt === 'string' ? m.lastActiveAt : null,
    status: m.status === 'suspended' ? 'suspended' : 'active',
  };
}

function normalizeInvite(raw: unknown): BusinessInvite {
  const i = (raw ?? {}) as Record<string, unknown>;
  const invitedBy =
    typeof i.invitedBy === 'object' && i.invitedBy !== null
      ? (i.invitedBy as Record<string, unknown>)
      : null;
  const status = i.status;

  return {
    id: String(i.id ?? i._id ?? ''),
    email: typeof i.email === 'string' ? i.email : '',
    role: isBusinessRole(i.role) ? i.role : 'viewer',
    invitedBy: invitedBy
      ? {
          _id: invitedBy._id != null ? String(invitedBy._id) : undefined,
          displayName:
            typeof invitedBy.displayName === 'string' ? invitedBy.displayName : undefined,
        }
      : null,
    createdAt: typeof i.createdAt === 'string' ? i.createdAt : undefined,
    expiresAt: typeof i.expiresAt === 'string' ? i.expiresAt : undefined,
    status:
      status === 'accepted' || status === 'revoked' || status === 'expired'
        ? status
        : 'pending',
  };
}

export const businessMembersApi = {
  /** Readable by any member (no role guard on the backend). */
  async list(businessId: string): Promise<BusinessMember[]> {
    const { data } = await apiClient.get(`/businesses/${businessId}/members`);
    return Array.isArray(data) ? data.map(normalizeMember) : [];
  },
  /**
   * Admin+. Rejected with 400 when changing your own role or demoting the last
   * owner — surface `error.response.data.message` rather than a generic copy.
   */
  async changeRole(
    businessId: string,
    userId: string,
    role: BusinessRole,
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.put(
      `/businesses/${businessId}/members/${userId}/role`,
      { role },
    );
    return data;
  },
  /** Admin+. 400 on self-removal or removing the last owner. */
  async remove(businessId: string, userId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete(
      `/businesses/${businessId}/members/${userId}`,
    );
    return data;
  },
};

export const businessInvitesApi = {
  /** Admin+. 409 when the email already has a pending invite or is a member. */
  async create(
    businessId: string,
    payload: { email: string; role: InvitableRole },
  ): Promise<BusinessInvite> {
    const { data } = await apiClient.post(`/businesses/${businessId}/invites`, payload);
    return normalizeInvite(data);
  },
  /** Admin+. Backend returns pending invites only. */
  async list(businessId: string): Promise<BusinessInvite[]> {
    const { data } = await apiClient.get(`/businesses/${businessId}/invites`);
    return Array.isArray(data) ? data.map(normalizeInvite) : [];
  },
  /** Admin+. 400 when the invite was already accepted. */
  async revoke(businessId: string, inviteId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete(
      `/businesses/${businessId}/invites/${inviteId}`,
    );
    return data;
  },
  /** Admin+. 400 when the invite is expired or no longer pending. */
  async resend(businessId: string, inviteId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.post(
      `/businesses/${businessId}/invites/${inviteId}/resend`,
    );
    return data;
  },

  /**
   * Read an invite token without consuming it — powers the accept screen's
   * "X mời bạn làm Y" preview. 400 on an expired/invalid token, 404 once the
   * invite was revoked or already accepted.
   *
   * Requires a session (the route sits behind the global JwtAuthGuard), so the
   * accept flow must send an anonymous user through login first, carrying the
   * token along.
   */
  async verify(token: string): Promise<InvitePreview> {
    const { data } = await apiClient.get('/invites/verify', { params: { token } });
    return normalizeInvitePreview(data);
  },

  /**
   * Consume the invite as the signed-in user. 403 when the session's email is
   * not the invited one; `{ alreadyMember: true }` when the membership already
   * existed — treat that as success and switch into the business.
   */
  async accept(token: string): Promise<AcceptInviteResult> {
    const { data } = await apiClient.post('/invites/accept', { token });
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      success: d.success === true || d.alreadyMember === true,
      alreadyMember: d.alreadyMember === true,
      businessId: d.businessId != null ? String(d.businessId) : undefined,
      role: isBusinessRole(d.role) ? d.role : undefined,
    };
  },
};

/** `GET /invites/verify` — the invite as shown before accepting. */
export interface InvitePreview {
  businessId: string;
  businessName: string;
  businessLogoKey?: string;
  email: string;
  role: BusinessRole;
  inviterName?: string;
  expiresAt?: string;
}

export interface AcceptInviteResult {
  success: boolean;
  /** The user was already a member; the invite was closed out. */
  alreadyMember: boolean;
  businessId?: string;
  role?: BusinessRole;
}

/**
 * `businessId` arrives populated (`{ _id, displayName, logoKey }`) but degrades
 * to a bare id string if that populate ever drops, so handle both shapes.
 */
function normalizeInvitePreview(raw: unknown): InvitePreview {
  const i = (raw ?? {}) as Record<string, unknown>;
  const biz =
    typeof i.businessId === 'object' && i.businessId !== null
      ? (i.businessId as Record<string, unknown>)
      : {};
  const inviter =
    typeof i.invitedBy === 'object' && i.invitedBy !== null
      ? (i.invitedBy as Record<string, unknown>)
      : {};

  return {
    businessId: String(
      biz._id ?? (typeof i.businessId === 'string' ? i.businessId : ''),
    ),
    businessName:
      typeof biz.displayName === 'string' && biz.displayName
        ? biz.displayName
        : 'Tài khoản kinh doanh',
    businessLogoKey: typeof biz.logoKey === 'string' ? biz.logoKey : undefined,
    email: typeof i.email === 'string' ? i.email : '',
    role: isBusinessRole(i.role) ? i.role : 'viewer',
    inviterName:
      typeof inviter.displayName === 'string' ? inviter.displayName : undefined,
    expiresAt: typeof i.expiresAt === 'string' ? i.expiresAt : undefined,
  };
}

// ─── Business device sessions (business-members-system task 17) ─────────────

export interface BusinessSession {
  id: string;
  user: { _id: string; displayName: string; avatar?: string };
  deviceId: string;
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  createdAt?: string;
  lastActiveAt?: string;
}

function normalizeSession(raw: unknown): BusinessSession {
  const s = (raw ?? {}) as Record<string, unknown>;
  const u =
    typeof s.userId === 'object' && s.userId !== null
      ? (s.userId as Record<string, unknown>)
      : {};
  return {
    id: String(s.id ?? s._id ?? ''),
    user: {
      _id: String(u._id ?? (typeof s.userId === 'string' ? s.userId : '')),
      displayName:
        typeof u.displayName === 'string' && u.displayName
          ? u.displayName
          : 'Người dùng đã xoá',
      avatar: typeof u.avatar === 'string' ? u.avatar : undefined,
    },
    deviceId: typeof s.deviceId === 'string' ? s.deviceId : '',
    deviceModel: typeof s.deviceModel === 'string' ? s.deviceModel : undefined,
    osVersion: typeof s.osVersion === 'string' ? s.osVersion : undefined,
    appVersion: typeof s.appVersion === 'string' ? s.appVersion : undefined,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : undefined,
    lastActiveAt: typeof s.lastActiveAt === 'string' ? s.lastActiveAt : undefined,
  };
}

export const businessSessionsApi = {
  /** Admin+. One row per member holding an active device. */
  async list(businessId: string): Promise<BusinessSession[]> {
    const { data } = await apiClient.get(`/businesses/${businessId}/sessions`);
    return Array.isArray(data) ? data.map(normalizeSession) : [];
  },
  /** Admin+. 400 when the session is the caller's own — log out instead. */
  async forceLogout(
    businessId: string,
    sessionId: string,
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete(
      `/businesses/${businessId}/sessions/${sessionId}`,
    );
    return data;
  },
};

// ─── Business audit logs (business-members-system task 18) ─────────────────

export interface BusinessAuditLogEntry {
  id: string;
  actor: { _id: string; displayName: string; avatar?: string };
  eventType: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  deviceId?: string;
  createdAt?: string;
}

export interface BusinessAuditLogPage {
  logs: BusinessAuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

function normalizeAuditLog(raw: unknown): BusinessAuditLogEntry {
  const l = (raw ?? {}) as Record<string, unknown>;
  const a =
    typeof l.actorId === 'object' && l.actorId !== null
      ? (l.actorId as Record<string, unknown>)
      : {};
  return {
    id: String(l.id ?? l._id ?? ''),
    actor: {
      _id: String(a._id ?? (typeof l.actorId === 'string' ? l.actorId : '')),
      displayName:
        typeof a.displayName === 'string' && a.displayName
          ? a.displayName
          : 'Người dùng đã xoá',
      avatar: typeof a.avatar === 'string' ? a.avatar : undefined,
    },
    eventType: typeof l.eventType === 'string' ? l.eventType : 'unknown',
    resourceId: typeof l.resourceId === 'string' ? l.resourceId : undefined,
    changes:
      typeof l.changes === 'object' && l.changes !== null
        ? (l.changes as Record<string, unknown>)
        : undefined,
    metadata:
      typeof l.metadata === 'object' && l.metadata !== null
        ? (l.metadata as Record<string, unknown>)
        : undefined,
    deviceId: typeof l.deviceId === 'string' ? l.deviceId : undefined,
    createdAt: typeof l.createdAt === 'string' ? l.createdAt : undefined,
  };
}

export const businessAuditLogsApi = {
  /** Admin+. Newest first; `page` is 1-based. */
  async list(
    businessId: string,
    params: {
      page?: number;
      limit?: number;
      eventType?: string;
      actorId?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ): Promise<BusinessAuditLogPage> {
    const { data } = await apiClient.get(`/businesses/${businessId}/audit-logs`, {
      params,
    });
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      logs: Array.isArray(d.logs) ? d.logs.map(normalizeAuditLog) : [],
      total: typeof d.total === 'number' ? d.total : 0,
      page: typeof d.page === 'number' ? d.page : (params.page ?? 1),
      limit: typeof d.limit === 'number' ? d.limit : (params.limit ?? 20),
    };
  },
};

export default apiClient;
