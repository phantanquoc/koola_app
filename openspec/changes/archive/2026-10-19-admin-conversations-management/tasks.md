# Tasks

## 1. Backend query upgrades (additive, no schema change)

- [x] 1.1 Remove dead `topic` filter from `GET /admin/conversations` and verify search on name-only returns correct results via curl
- [x] 1.2 Sort list by `lastMessageAt` desc (nulls last) and verify ordering via curl with mixed null/non-null fixtures
- [x] 1.3 Add `hasPendingReport`, `minMembers`, `maxMembers` query params and verify each filter plus combinations via curl ← (verify: all new params work, response shape unchanged, non-admin gets 403)
- [x] 1.4 Populate member summaries (displayName, avatar, accountType) in `GET /admin/conversations/:id` and verify no N+1 (single batch query) via test or query log

## 2. Conversations list page rebuild

- [x] 2.1 Rebuild `ConversationsPage.tsx` on UsersPage frame: debounced form-submit search, type/pending-report/member-count filters with reset-page, filter chips, and verify list renders with loading/error/empty states
- [x] 2.2 Add table columns (name+preview, type badge, member count, last-message time, report indicator), Pagination footer, and verify at 1440/860/390px per DESIGN.md §12
- [x] 2.3 Wire new query params to backend filters and verify each filter round-trips end-to-end (chip reflects active filter, page resets to 1)

## 3. Detail drawer with inline moderation

- [x] 3.1 Build drawer: member list with role badges + 20 recent messages read-only, soft-deleted dimmed with badge, and verify against a conversation with mixed deleted/normal messages
- [x] 3.2 Add message soft-delete behind ConfirmDialog with toast + row update, and verify 403/404 paths show error toast ← (verify: confirm → API → toast → row updates; cancel does nothing)
- [x] 3.3 Add related pending reports with inline resolve/dismiss + disabled delete-conversation button with tooltip, and verify report status updates in place without navigation

## 4. Integration checks

- [x] 4.1 Run `npm run build` + typecheck in admin-web and backend lint/tests for touched modules, all green
- [ ] 4.2 Full flow check: filter to reported conversation → open drawer → remove message → resolve report → confirm list badge clears ← (verify: end-to-end moderation loop with no page reload)

## 5. Round 3 — compact table polish

- [x] 5.1 P1 header/toolbar: count inline in title, spinner during filter reload
- [x] 5.2 P2 drawer: no changes needed (already compact)
- [x] 5.3 P3 search drawer: no changes needed (already debounced + scoped)
- [x] 5.4 P4 table: 54px rows, 1-line preview ellipsis, relative time + full-time tooltip, type icon on avatar (Loại column removed), row hover, skeleton-only-on-empty + stale dim otherwise
