/**
 * Token storage — wraps localStorage so the rest of the app
 * is decoupled from the storage mechanism.
 *
 * AUTH DESIGN DECISION (refresh-token storage):
 * Both tokens live in localStorage for this internal admin tool.
 * This deliberately differs from the mobile client (docs/SECURITY.md §3:
 * access token in memory only, refresh token in SecureStore).
 * Rationale: admin-web is a desktop browser SPA with no SecureStore
 * equivalent; silent refresh REQUIRES the refresh token to survive a page
 * reload (otherwise every reload forces re-login, defeating rule #3).
 * Tradeoff accepted: an XSS in admin-web can steal both tokens — hence the
 * compensating rules: no dangerouslySetInnerHTML with user content, render
 * user text as text, strict CSP in production (see docs/SECURITY.md).
 * Never store other users' tokens here. Cleared on logout.
 */
const ACCESS_KEY = 'admin_access_token';
const REFRESH_KEY = 'admin_refresh_token';

export const tokenStorage = {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  setAccess(token: string): void {
    localStorage.setItem(ACCESS_KEY, token);
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  setRefresh(token: string): void {
    localStorage.setItem(REFRESH_KEY, token);
  },
  /** Back-compat alias: read = access token. Prefer getAccess(). */
  get(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  /** Back-compat alias: write = access token. Prefer setAccess(). */
  set(token: string): void {
    localStorage.setItem(ACCESS_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
