/**
 * App configuration — reads Vite env variables.
 *
 * Contract (admin-web/AGENTS.md §5): VITE_API_URL MUST include the `/api`
 * prefix, e.g. `http://localhost:3000/api`. Vite only reads env at startup,
 * so an env change requires a dev-server restart.
 *
 * Fail-fast: a missing VITE_API_URL throws at import time instead of
 * producing silent 404s against the wrong host.
 */
function resolveApiUrl(): string {
  // NOTE: read the raw env FIRST, narrow the type AFTER — `as string ?? ...`
  // never falls back because `as` binds tighter than `??` (old bug).
  const raw: unknown = import.meta.env.VITE_API_URL;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      '[config] VITE_API_URL is missing. Set it in admin-web/.env ' +
        '(e.g. VITE_API_URL=http://localhost:3000/api) and restart the dev server.',
    );
  }
  return raw.trim().replace(/\/+$/, '');
}

export const config = {
  apiUrl: resolveApiUrl(),
};
