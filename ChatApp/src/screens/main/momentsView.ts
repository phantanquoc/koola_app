/**
 * momentsView.ts
 *
 * Pure function to determine which view state the Moments screen should render.
 * Extracted for testability — no React dependency.
 *
 * Priority order: content > skeleton > error > empty
 *   - If rings already exist, always show content (even during background refresh or error)
 *   - If rings empty + loading, show skeleton (cold start)
 *   - If rings empty + error, show inline error
 *   - Otherwise (empty, not loading, no error), show empty state
 */

export type MomentsView = 'skeleton' | 'error' | 'empty' | 'content';

export function resolveMomentsView(args: {
  isLoading: boolean;
  error: string | null;
  ringsLength: number;
}): MomentsView {
  const { isLoading, error, ringsLength } = args;

  // Already have feed data — always keep showing content (silent refresh / transient error)
  if (ringsLength > 0) return 'content';

  // Cold start: loading with empty feed
  if (isLoading) return 'skeleton';

  // Network/server error with empty feed
  if (error) return 'error';

  // Truly empty: loaded successfully but no stories from anyone
  return 'empty';
}
