/**
 * momentsView.ts
 *
 * Pure function describing the state of the story-rail REGION of the Moments
 * screen. No React dependency — extracted for testability.
 *
 * IMPORTANT (regression 2026-08-11, found on device): this resolver describes
 * ONLY the story rail sub-region, never the whole screen. The screen chrome
 * (composer prompt, quick actions, own-ring rail) and the Phase-1 mock feed
 * always render regardless of story state. An earlier version gated the entire
 * screen on real story presence, so a user with no friend stories saw a blank
 * empty state and lost the whole Phase-1 feed. The story region is a status
 * banner inside the feed flow, not an on/off switch for the screen.
 *
 * The own ring is always synthesised (see MomentsScreen.ownRing), so "has any
 * ring" is meaningless as a content signal — the meaningful signal is whether
 * any FRIEND ring exists. Priority order: ready > loading > error > friend-empty
 *   - Friend rings exist        → ready       (keep showing them, even during
 *                                              a silent refresh or transient error)
 *   - No friend rings + loading → loading     (cold start / refresh in flight)
 *   - No friend rings + error   → error       (inline, non-blocking, retryable)
 *   - No friend rings otherwise → friend-empty (friends haven't posted yet)
 */

export type MomentsStoryRegion = 'loading' | 'error' | 'friend-empty' | 'ready';

export function resolveMomentsStoryRegion(args: {
  isLoading: boolean;
  error: string | null;
  hasFriendRings: boolean;
}): MomentsStoryRegion {
  const { isLoading, error, hasFriendRings } = args;

  // Friend rings already loaded — keep showing them through silent refresh or a
  // transient error so the rail never flickers back to a placeholder.
  if (hasFriendRings) return 'ready';

  // Cold start / refresh with no friend rings yet — show a non-blocking hint.
  if (isLoading) return 'loading';

  // The refresh failed and there are no friend rings to fall back to.
  if (error) return 'error';

  // Loaded successfully, but no friend has posted a Moment.
  return 'friend-empty';
}
