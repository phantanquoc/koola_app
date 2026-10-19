/**
 * Shared CORS allow-list for HTTP + Socket.IO.
 *
 * Reads FRONTEND_URL (comma-separated). In production this MUST be set; in
 * development we fall back to local Metro/web hosts.
 */
export function getAllowedOrigins(): string[] {
  const urls = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (urls.length > 0) return urls;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FRONTEND_URL must be set in production (comma-separated list of allowed origins)',
    );
  }

  return [
    'http://localhost:8081',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
}

/**
 * Vite dev-server origins (default port 5173) on any host. A static
 * allow-list cannot enumerate every teammate's LAN IP, so in
 * non-production we also accept `http://<any-host>:5173` — the admin-web
 * `npm run dev` server. Production never reaches this branch because
 * FRONTEND_URL is required there (see getAllowedOrigins).
 */
const DEV_VITE_ORIGIN_PATTERN =
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}|[A-Za-z0-9.-]+):5173$/;

/**
 * Single allow-check shared by HTTP (main.ts) and Socket.IO gateways
 * (chat.gateway.ts, webrtc.gateway.ts).
 */
export function isOriginAllowed(requestOrigin: string): boolean {
  if (getAllowedOrigins().includes(requestOrigin)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return DEV_VITE_ORIGIN_PATTERN.test(requestOrigin);
}

/**
 * CORS option factory for Socket.IO gateways.
 *
 * Returns a function compatible with socket.io's `cors.origin` callback so
 * that the allow-list is evaluated at request time (after env is loaded).
 *
 * Native mobile clients (React Native) do not send a real HTTP Origin —
 * they typically send nothing, `file://`, or `null`. CORS is a browser
 * concept; non-browser origins are allowed unconditionally. Authentication
 * happens inside the gateway handshake (JWT in query.token), not CORS.
 */
export function socketCorsOrigin() {
  return (
    requestOrigin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void => {
    // Non-browser clients — no Origin, null, or file:// — allow.
    // Real browsers always send a concrete http(s):// origin.
    if (
      !requestOrigin ||
      requestOrigin === 'null' ||
      requestOrigin === 'file://' ||
      !/^https?:\/\//i.test(requestOrigin)
    ) {
      callback(null, true);
      return;
    }

    const allowed = isOriginAllowed(requestOrigin);
    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${requestOrigin} not allowed by CORS`));
    }
  };
}
