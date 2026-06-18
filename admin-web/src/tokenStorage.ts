/**
 * Token storage — wraps localStorage so the rest of the app
 * is decoupled from the storage mechanism.
 */
const TOKEN_KEY = 'admin_access_token';

export const tokenStorage = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
};
