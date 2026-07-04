/**
 * momentsView.spec.ts
 *
 * Unit tests for the pure resolveMomentsView function.
 * Verifies view-state decision logic that prevents the Moments tab flash.
 */

import { resolveMomentsView } from '../momentsView';

describe('resolveMomentsView', () => {
  it('returns "skeleton" on cold start (loading, empty feed)', () => {
    expect(resolveMomentsView({ isLoading: true, error: null, ringsLength: 0 })).toBe('skeleton');
  });

  it('returns "empty" on auth-race / no data yet (not loading, no error, empty feed)', () => {
    expect(resolveMomentsView({ isLoading: false, error: null, ringsLength: 0 })).toBe('empty');
  });

  it('returns "content" when feed has rings (warm, idle)', () => {
    expect(resolveMomentsView({ isLoading: false, error: null, ringsLength: 3 })).toBe('content');
  });

  it('returns "content" during silent background refresh (isLoading true but rings exist)', () => {
    // This is THE anti-flash assertion: even though isLoading is true,
    // existing rings prevent the spinner/skeleton from replacing content.
    expect(resolveMomentsView({ isLoading: true, error: null, ringsLength: 3 })).toBe('content');
  });

  it('returns "content" when refresh errors but rings already loaded', () => {
    // Background refresh failed — keep showing stale content, don't flash error
    expect(resolveMomentsView({ isLoading: false, error: 'Network error', ringsLength: 2 })).toBe('content');
  });

  it('returns "error" when feed is empty and there is an error', () => {
    expect(resolveMomentsView({ isLoading: false, error: 'Không thể tải khoảnh khắc', ringsLength: 0 })).toBe('error');
  });

  it('skeleton takes priority over error when loading + error + empty (edge case)', () => {
    // If somehow both isLoading and error are set with empty feed, loading wins
    expect(resolveMomentsView({ isLoading: true, error: 'stale error', ringsLength: 0 })).toBe('skeleton');
  });
});
