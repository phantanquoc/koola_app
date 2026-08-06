/**
 * conversationPagination.ts
 *
 * Pure pagination state machine for the conversation list.
 *
 * Extracted from ConversationListScreen so the paging arithmetic can be tested
 * without mounting the screen (which would require the full navigation, theme,
 * auth, socket and SQLite stack).
 *
 * Two consumers share this state:
 *   - the REST fetch, which needs "which page do I request next?"
 *   - the SQLite read (local-first path), which needs "how many rows have I
 *     actually loaded, so how wide should my read window be?"
 *
 * Keeping both derived from one value is what prevents the two paths from
 * drifting apart — the flag-on read window can never claim more rows than REST
 * has actually delivered, and never fewer.
 */

/** Page size used for every REST conversation fetch. */
export const CONVERSATION_PAGE_SIZE = 20;

export interface PaginationState {
  /** 1-based page number to request on the next non-reset fetch. */
  nextPage: number;
  /** How many pages of REST data have successfully landed. */
  loadedPages: number;
}

/** Nothing fetched yet: the first request is page 1. */
export const INITIAL_PAGINATION_STATE: PaginationState = {
  nextPage: 1,
  loadedPages: 0,
};

/**
 * Which page should this fetch request?
 * A reset (pull-to-refresh / focus) always restarts at page 1.
 */
export function requestPage(state: PaginationState, reset: boolean): number {
  return reset ? 1 : state.nextPage;
}

/**
 * Advance after a page has successfully landed.
 *
 * append → one more page landed on top of what we already had.
 * reset  → page 1 just landed, so page 2 is next.
 *
 * A reset deliberately does NOT shrink `loadedPages`. The reset only re-fetches
 * page 1 from REST to freshen the top of the list; the rows from deeper pages
 * are still in SQLite. Rewinding the count would collapse an already-expanded
 * list back to 20 rows every time the screen regains focus, which reads to the
 * user as the pagination bug never having been fixed.
 */
export function advancePagination(
  state: PaginationState,
  reset: boolean,
): PaginationState {
  return reset
    ? { nextPage: 2, loadedPages: Math.max(1, state.loadedPages) }
    : { nextPage: state.nextPage + 1, loadedPages: state.loadedPages + 1 };
}

/**
 * How many rows the local-first SQLite read should ask for.
 *
 * The window tracks the REST pages actually loaded rather than a fixed cap.
 * A fixed cap is what broke this screen before: a hard `limit: 50` silently
 * truncated any account with more than 50 conversations, no matter how many
 * pages the user paged through.
 *
 * The window is bounded without an artificial ceiling: it only grows when the
 * user explicitly loads another page, and the backend stops handing out pages
 * once `hasMore` goes false. So it converges on the user's real conversation
 * count and stops there.
 *
 * Before the first page lands we still return one page worth, so a warm-start
 * read (SQLite already seeded from a previous session) paints immediately
 * instead of rendering an empty list.
 */
export function dbReadLimit(state: PaginationState): number {
  return Math.max(1, state.loadedPages) * CONVERSATION_PAGE_SIZE;
}

/**
 * Whether the "load more" footer should still be offered on the local-first path.
 *
 * The REST `hasMore` flag describes only the page that was just requested, so it
 * cannot be used directly here: a reset re-fetches page 1, whose `hasMore` is
 * true for any account with more than one page — which would resurrect the
 * footer even after the user had already paged in every conversation.
 *
 * Deriving it from the rows the read window covers against the server total is
 * stable regardless of which page was last requested, so the footer disappears
 * once and stays gone.
 */
export function hasMoreFromWindow(state: PaginationState, total: number): boolean {
  return dbReadLimit(state) < total;
}
