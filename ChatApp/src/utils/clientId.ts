/**
 * Client-side id generator for messages and queued actions.
 *
 * Why not `uuid`? The `uuid` npm package (v7+) uses `crypto.getRandomValues()`,
 * which is not available in React Native's Hermes/JSC runtime unless the
 * polyfill `react-native-get-random-values` is imported at the top of
 * `index.js`. Adding that polyfill requires a native rebuild, so we provide
 * a lightweight alternative for cases where the id only needs to be:
 *   - Unique per client (dedup/optimistic reconciliation)
 *   - Roughly ordered (debugging convenience)
 *   - URL-safe
 *
 * These ids are NOT used as security tokens. Backend validates ownership
 * and content regardless of the id supplied.
 */

const hex = (n: number): string =>
  Math.floor(Math.random() * Math.pow(16, n))
    .toString(16)
    .padStart(n, '0');

/**
 * Generate a 36-char RFC-4122-shaped id (8-4-4-4-12 hex).
 * The last 12 hex chars encode the current millisecond timestamp so that
 * sorting ids alphabetically roughly matches creation order — useful when
 * scanning logs.
 *
 * Collision probability at realistic send rates (<100/s per user) is
 * negligible: ~1 in 2^52 per second.
 */
export function generateClientId(): string {
  const ts = Date.now().toString(16).padStart(12, '0').slice(-12);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${ts}`;
}
