import axios from 'axios';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import { config } from './config';
import { tokenStorage } from './tokenStorage';

/**
 * Axios instance for the admin API (admin-web/AGENTS.md rules 3–4).
 *
 * - Attaches Bearer access token on every request.
 * - 401 → silent refresh (POST /api/auth/refresh with the stored refresh
 *   token), retry the original request ONCE. Only when refresh truly fails
 *   (401/expired/revoked) clear tokens and redirect to /login.
 * - 403 → admin was demoted (AdminGuard re-reads isPlatformAdmin fresh from
 *   DB each request). Navigate to /forbidden — NEVER /login, that loops.
 * - 429 → broadcast a rate-limit event (pages show a toast + temporarily
 *   disable the action); no aggressive retry.
 * - DEV: log failed-response status + payload (never tokens — SECURITY.md §1).
 */

const REFRESH_URL = '/auth/refresh';
const RATE_LIMIT_COOLDOWN_MS = 10_000;

let rateLimitedUntil = 0;
let inflightRefresh: Promise<string> | null = null;

/** Pages subscribe to show the "too fast, try later" toast on 429. */
type RateLimitListener = () => void;
const rateLimitListeners = new Set<RateLimitListener>();

export function onRateLimited(listener: RateLimitListener): () => void {
  rateLimitListeners.add(listener);
  return () => {
    rateLimitListeners.delete(listener);
  };
}

export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

function notifyRateLimited(): void {
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  for (const listener of rateLimitListeners) listener();
}

function devLogResponse(error: AxiosError): void {
  if (import.meta.env.DEV) {
    // ponytail: status + data only — never headers (Authorization) or bodies with creds.
    console.debug(
      '[apiClient] request failed',
      error.response?.status,
      error.config?.method?.toUpperCase(),
      error.config?.url,
      error.response?.data,
    );
  }
}

/**
 * Single-flight refresh: concurrent 401s share one POST /auth/refresh.
 * Backend rotates the pair, so the response updates BOTH stored tokens.
 */
async function refreshAccessToken(): Promise<string> {
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      const refreshToken = tokenStorage.getRefresh();
      if (!refreshToken) throw new Error('no refresh token');
      const res = await axios.post<{ accessToken: string; refreshToken: string }>(
        `${config.apiUrl}${REFRESH_URL}`,
        { refreshToken },
      );
      tokenStorage.setAccess(res.data.accessToken);
      tokenStorage.setRefresh(res.data.refreshToken);
      return res.data.accessToken;
    })().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

function forceLogout(): void {
  tokenStorage.clear();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

const apiClient = axios.create({
  baseURL: config.apiUrl,
});

// Request interceptor — attach token
apiClient.interceptors.request.use((reqConfig) => {
  const token = tokenStorage.getAccess();
  if (token) {
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }
  return reqConfig;
});

// Response interceptor — map errors by status (AGENTS.md rule 4)
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    devLogResponse(error);

    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    // 401 → silent refresh + retry once (skip for the refresh call itself
    // and login, which have no valid session by definition).
    if (
      status === 401 &&
      original &&
      !original._retried &&
      original.url !== REFRESH_URL &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return apiClient.request(original);
      } catch {
        // Refresh token expired/revoked — genuine re-auth needed.
        forceLogout();
      }
      return Promise.reject(error);
    }

    // 401 on refresh/login itself, or refresh attempt failed → re-auth.
    if (status === 401) {
      // Login page handles its own 401 inline (field error) — only force
      // logout for authenticated sessions, never while ON /login.
      if (window.location.pathname !== '/login') forceLogout();
      return Promise.reject(error);
    }

    // 403 → demoted admin. Route to /forbidden, NEVER /login (loop).
    //
    // Ngoại lệ: `code: 'mfa_required'` là "cần bật 2FA", không phải bị hạ quyền.
    // Đá sang /forbidden sẽ báo sai và không có đường bật — AppLayout đã render
    // wall 2FA nên chỉ cần để lỗi nổi lên cho trang hiện thông điệp.
    if (status === 403) {
      const code = (error.response?.data as { code?: string } | undefined)?.code;
      if (code === 'mfa_required') return Promise.reject(error);
      if (window.location.pathname !== '/forbidden' && window.location.pathname !== '/login') {
        window.location.href = '/forbidden';
      }
      return Promise.reject(error);
    }

    // 429 → toast + temporary disable; callers check isRateLimited().
    if (status === 429) {
      notifyRateLimited();
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export default apiClient;
