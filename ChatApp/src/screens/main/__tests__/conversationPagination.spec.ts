/**
 * conversationPagination.spec.ts
 *
 * Unit tests for the pure conversation-list pagination state machine.
 *
 * Regression target: a user with 61 conversations only ever saw 20, and the
 * "load more" footer refetched page 1 forever. Two independent causes:
 *   1. the page counter only advanced on the flag-off (legacy) path, so
 *      local-first always re-requested page 1;
 *   2. the SQLite read was hard-capped at 50 rows.
 *
 * These tests drive the state machine the way the screen does, so they lock the
 * paging arithmetic without mounting the screen (which needs navigation, theme,
 * auth, socket and SQLite).
 */

import {
  CONVERSATION_PAGE_SIZE,
  INITIAL_PAGINATION_STATE,
  advancePagination,
  dbReadLimit,
  hasMoreFromWindow,
  requestPage,
  type PaginationState,
} from '../conversationPagination';

/**
 * Mirrors ConversationListScreen.fetchConversations: pick the page, then
 * advance once that page has landed. Returns the page that was requested.
 */
function fetchPage(
  state: PaginationState,
  reset: boolean,
): { requested: number; next: PaginationState } {
  const requested = requestPage(state, reset);
  return { requested, next: advancePagination(state, reset) };
}

describe('requestPage', () => {
  it('requests page 1 on the very first fetch', () => {
    expect(requestPage(INITIAL_PAGINATION_STATE, false)).toBe(1);
  });

  it('always restarts at page 1 on reset, however deep the list is', () => {
    const deep: PaginationState = { nextPage: 7, loadedPages: 6 };
    expect(requestPage(deep, true)).toBe(1);
  });
});

describe('page counter advances on the local-first path (Bug 1)', () => {
  it('requests a NEW page on every successive loadMore', () => {
    // The bug: every one of these came back as page 1, so the same 20
    // conversations were re-upserted and the list never grew.
    let state = INITIAL_PAGINATION_STATE;
    const requested: number[] = [];

    // Focus/refresh lands page 1 first, as the screen's useFocusEffect does.
    ({ next: state } = fetchPage(state, true));

    for (let i = 0; i < 3; i++) {
      const r = fetchPage(state, false);
      requested.push(r.requested);
      state = r.next;
    }

    expect(requested).toEqual([2, 3, 4]);
    expect(state.nextPage).toBe(5);
  });

  it('never requests the same page twice across a long paging session', () => {
    let state = INITIAL_PAGINATION_STATE;
    const requested: number[] = [];
    ({ next: state } = fetchPage(state, true));
    for (let i = 0; i < 10; i++) {
      const r = fetchPage(state, false);
      requested.push(r.requested);
      state = r.next;
    }
    expect(new Set(requested).size).toBe(requested.length);
  });
});

describe('dbReadLimit — no hard cap (Bug 2)', () => {
  it('is never the old hard-coded 50 that truncated the list', () => {
    // 4 pages = 80 rows of window; the old code would have read only 50.
    const state: PaginationState = { nextPage: 5, loadedPages: 4 };
    expect(dbReadLimit(state)).toBe(80);
    expect(dbReadLimit(state)).toBeGreaterThan(50);
  });

  it('reads one page worth before anything has landed (warm start paints)', () => {
    expect(dbReadLimit(INITIAL_PAGINATION_STATE)).toBe(CONVERSATION_PAGE_SIZE);
  });

  it('grows one page at a time, never unbounded', () => {
    let state = INITIAL_PAGINATION_STATE;
    ({ next: state } = fetchPage(state, true));
    expect(dbReadLimit(state)).toBe(20);
    ({ next: state } = fetchPage(state, false));
    expect(dbReadLimit(state)).toBe(40);
    ({ next: state } = fetchPage(state, false));
    expect(dbReadLimit(state)).toBe(60);
  });
});

describe('61 conversations are all reachable end to end', () => {
  const TOTAL = 61;

  it('pages in all 61 rows and then stops offering more', () => {
    let state = INITIAL_PAGINATION_STATE;
    // Initial focus fetch.
    ({ next: state } = fetchPage(state, true));
    expect(hasMoreFromWindow(state, TOTAL)).toBe(true); // 20 < 61

    const pagesRequested: number[] = [];
    let guard = 0;
    while (hasMoreFromWindow(state, TOTAL)) {
      if (++guard > 20) throw new Error('pagination failed to terminate');
      const r = fetchPage(state, false);
      pagesRequested.push(r.requested);
      state = r.next;
    }

    // 61 rows over a page size of 20 needs pages 2, 3 and 4 after page 1.
    expect(pagesRequested).toEqual([2, 3, 4]);
    // Window (80) now covers every row, so the footer is gone for good.
    expect(hasMoreFromWindow(state, TOTAL)).toBe(false);
    expect(dbReadLimit(state)).toBeGreaterThanOrEqual(TOTAL);
  });

  it('keeps hasMore false after a refresh once everything is loaded', () => {
    // Regression guard: the raw REST hasMore for page 1 is true for any
    // multi-page account, so reusing it here would resurrect the footer
    // forever on the local-first path.
    let state: PaginationState = { nextPage: 5, loadedPages: 4 };
    expect(hasMoreFromWindow(state, TOTAL)).toBe(false);

    ({ next: state } = fetchPage(state, true)); // pull-to-refresh / re-focus

    expect(hasMoreFromWindow(state, TOTAL)).toBe(false);
    // The read window must not shrink back to 20 and lose 41 rows.
    expect(dbReadLimit(state)).toBeGreaterThanOrEqual(TOTAL);
  });

  it('re-focusing an expanded list does not collapse the read window', () => {
    let state: PaginationState = { nextPage: 4, loadedPages: 3 };
    const before = dbReadLimit(state);
    ({ next: state } = fetchPage(state, true));
    expect(dbReadLimit(state)).toBe(before);
    // ...and the next loadMore still moves forward, not back to page 1.
    expect(requestPage(state, false)).toBe(2);
  });
});

describe('hasMoreFromWindow boundaries', () => {
  it('is false when the total is an exact multiple of the page size', () => {
    // 40 of 40 loaded — nothing left, footer must not hang.
    expect(hasMoreFromWindow({ nextPage: 3, loadedPages: 2 }, 40)).toBe(false);
  });

  it('is true when one row spills past the window', () => {
    expect(hasMoreFromWindow({ nextPage: 3, loadedPages: 2 }, 41)).toBe(true);
  });

  it('is false for an empty account', () => {
    expect(hasMoreFromWindow(INITIAL_PAGINATION_STATE, 0)).toBe(false);
  });

  it('is false when the account fits in a single page', () => {
    expect(hasMoreFromWindow({ nextPage: 2, loadedPages: 1 }, 12)).toBe(false);
  });
});

describe('flag-off (legacy) path behaviour is unchanged', () => {
  it('still walks pages 1,2,3... exactly as the old pageRef did', () => {
    // Old code: reset -> pageRef=2; append -> pageRef+1. The page sequence the
    // legacy path requests must be byte-for-byte the same after the refactor.
    let state = INITIAL_PAGINATION_STATE;
    const requested: number[] = [];

    let r = fetchPage(state, true); // focus/refresh
    requested.push(r.requested);
    state = r.next;
    expect(state.nextPage).toBe(2); // old: pageRef.current = 2

    for (let i = 0; i < 3; i++) {
      r = fetchPage(state, false);
      requested.push(r.requested);
      state = r.next;
    }

    expect(requested).toEqual([1, 2, 3, 4]);
  });

  it('uses the same page size the legacy path hard-coded', () => {
    expect(CONVERSATION_PAGE_SIZE).toBe(20);
  });
});
