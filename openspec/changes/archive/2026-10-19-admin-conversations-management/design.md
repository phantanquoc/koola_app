# Design

## Context

See proposal.md for motivation. Current state: `ConversationsPage.tsx` is a 24-line skeleton reusing `PageHeader`/`TableShell`/`Pagination` but with uncontrolled per-keystroke search, silent `.catch(() => {})`, and no detail view. `UsersPage.tsx` (478 lines) is the established full-page frame (cancelled-flag fetch, `URLSearchParams`, form-submit search, filter-reset-page, `totalPages`, filter chips, `StateBlock`, drawer via `Dialog variant="drawer"`, `ConfirmDialog`, optimistic mutation + toast). Backend `GET /admin/conversations` searches `name` + nonexistent `topic` and sorts by `updatedAt`; detail returns raw lean members without user info. DESIGN.md (admin-web) is the only styling authority: all color/spacing via `var(--...)`, `.drawer` 480px, `.description-list`, ink-pill primary buttons, badge tone-dark on soft background.

## Goals / Non-Goals

**Goals:**

- One-page moderation workflow: filter → inspect → remove message → resolve report, no route change.
- Backend query params backward compatible (additive only, same response shape).

**Non-Goals:**

- No `DELETE /admin/conversations/:id`, no user-side report creation, no block/mute, no auto-moderation, no analytics (explicitly deferred, button disabled with tooltip).

## Decisions

- **Clone the UsersPage frame, not MessageSearchPage.** UsersPage is the complete pattern (loading/error/empty, chips, drawer, confirm, toast); MessageSearchPage is another skeleton. Alternative (new bespoke layout) rejected: inconsistent UX, more code.
- **`hasPendingReport` via Report collection lookup, not denormalized flag.** A flag would need schema change + write-path updates; a `$lookup`/`$in` on pending `targetType=conversation` reports is correct at admin-list scale. Alternative (denormalized `pendingReportCount`) rejected per non-goal of no schema change.
- **Member summaries resolved server-side in detail endpoint.** Detail currently returns raw member `userId`s; the drawer needs displayName/avatar. Populate in service with the existing batch helper style (`getConversationsByIds` precedent) rather than N+1 client calls.
- **Vietnamese hardcoded, no new i18n keys.** Verified: no page-level keys exist (`users.*` absent); UsersPage hardcodes vi-VN.
- **Delete button disabled, not hidden.** Visible-but-disabled with tooltip communicates roadmap and reserves layout space; hidden would confuse later.

## Risks / Trade-offs

- [Risk] `hasPendingReport` lookup slows list query on large datasets → Mitigation: index on `Report(targetType, status, targetId)` already implied by report-inbox usage; cap with existing pagination.
- [Risk] Regex search stays instead of text index → Mitigation: keep escaped-regex behavior (matches existing spec scenario); text-index migration is a separate perf change.
- [Risk] Drawer detail + reports = 2 requests per open → Mitigation: parallel fetch with single loading state; acceptable for admin scale.
