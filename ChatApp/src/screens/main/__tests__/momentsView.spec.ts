/**
 * momentsView.spec.ts
 *
 * Unit tests for the pure resolveMomentsStoryRegion function.
 *
 * This resolver describes ONLY the story-rail region. The anti-flash guarantee
 * lives here: when friend rings already exist the region stays "ready" through a
 * silent refresh or transient error, and a cold start shows "loading" (not a
 * flash of the friend-empty state). Regression 2026-08-11: the region must never
 * be able to blank the whole screen — that is enforced at the screen level, but
 * these cases prove the region itself never reports a blocking state while data
 * is present.
 */

import { resolveMomentsStoryRegion } from '../momentsView';

describe('resolveMomentsStoryRegion', () => {
  it('returns "loading" on cold start when there are no friend rings', () => {
    expect(
      resolveMomentsStoryRegion({ isLoading: true, error: null, hasFriendRings: false }),
    ).toBe('loading');
  });

  it('returns "friend-empty" when loaded with no friend rings and no error', () => {
    expect(
      resolveMomentsStoryRegion({ isLoading: false, error: null, hasFriendRings: false }),
    ).toBe('friend-empty');
  });

  it('returns "ready" when friend rings exist', () => {
    expect(
      resolveMomentsStoryRegion({ isLoading: false, error: null, hasFriendRings: true }),
    ).toBe('ready');
  });

  it('returns "ready" during a silent refresh when friend rings already exist', () => {
    expect(
      resolveMomentsStoryRegion({ isLoading: true, error: null, hasFriendRings: true }),
    ).toBe('ready');
  });

  it('returns "ready" when a refresh errors but friend rings already exist', () => {
    expect(
      resolveMomentsStoryRegion({
        isLoading: false,
        error: 'Network error',
        hasFriendRings: true,
      }),
    ).toBe('ready');
  });

  it('returns "error" when there are no friend rings and the feed errors', () => {
    expect(
      resolveMomentsStoryRegion({
        isLoading: false,
        error: 'Không thể tải khoảnh khắc',
        hasFriendRings: false,
      }),
    ).toBe('error');
  });

  it('gives loading priority over error while no friend rings exist and loading', () => {
    expect(
      resolveMomentsStoryRegion({
        isLoading: true,
        error: 'stale error',
        hasFriendRings: false,
      }),
    ).toBe('loading');
  });
});
