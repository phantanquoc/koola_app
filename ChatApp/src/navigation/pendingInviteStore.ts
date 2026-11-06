/**
 * pendingInviteStore.ts
 *
 * Holds an invite token that arrived while nobody was signed in (task 15.3).
 *
 * Why a store instead of a `returnTo` route param: the app uses React
 * Navigation's conditional-screen-group auth pattern (see RootNavigator), so
 * while `isAuthenticated` is false the AcceptInvite route does not exist in the
 * navigator at all. A `returnTo` param would have nowhere to live, and the
 * deep link cannot be re-delivered by the OS later. Parking the token outside
 * the navigator lets login finish and then replay it.
 *
 * Deliberately in-memory: an invite link is a one-shot action the user just
 * tapped. Persisting it would mean a link tapped and abandoned days ago could
 * pop a dialog on an unrelated launch.
 */

let pendingToken: string | null = null;

/** Park a token to be consumed once the user is authenticated. */
export function setPendingInviteToken(token: string | null): void {
  pendingToken = token && token.trim() ? token : null;
}

/**
 * Read and clear the parked token.
 *
 * Single-read by design: the consumer navigates to AcceptInvite, and a second
 * read (e.g. another AppState change) must not navigate again.
 */
export function takePendingInviteToken(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}

/** True when a token is waiting. Does not consume it. */
export function hasPendingInviteToken(): boolean {
  return pendingToken !== null;
}

/** Drop any parked token (logout teardown, tests). */
export function clearPendingInviteToken(): void {
  pendingToken = null;
}
