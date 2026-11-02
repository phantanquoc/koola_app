# Proposal

## Why

`/conversations` is the last admin page still on a hand-rolled layout and a detail **drawer**, so it violates the `admin-web/DESIGN.md` rules every other list page already follows (URL-as-state filters, `useAdminList`, `ListHeader`/`StatusTabs`/`Pagination`, detail as a shareable route, no fake controls). Its data is also too thin for the moderation decisions it exists to support: tab counts are missing, report age (SLA) is invisible, date-range filtering and CSV export do not exist, and every list row ships a full `members` array only so the UI can print a length.

## What Changes

- **BREAKING (client contract)** `GET /admin/conversations` rows gain `memberCount` and `oldestPendingReportAt` and stop returning the full `members` array (detail still returns it), so list payload no longer scales with member count.
- New admin endpoint `GET /admin/conversations/stats` returning per-tab counts computed on the same filter builder as the list, so tab badges come from the server rather than being counted client-side.
- `ListConversationsDto` gains `createdFrom`/`createdTo` (and last-activity range) and constrains `sort` to an allow-list (`recent|created|reported|members`).
- New admin endpoint `GET /admin/conversations/export` reusing the list filter, capped at 500 rows, reporting `truncated`.
- Conversations list page rebuilt to the standard list archetype: filters/search/sort/pagination live in the URL, fetch goes through `useAdminList`, header uses `ListHeader` + `StatusTabs` + `FilterPopover`, table uses sortable `ColumnHeader`, states use `StateBlock`/`EmptyState`, and J/K/Enter/`?` keyboard navigation is added.
- Conversation detail moves from a drawer to a dedicated route `/conversations/:id` that is deep-linkable and returns to the exact list filter on "Back".
- The detail view loads its pending reports by `targetId` instead of downloading and client-filtering a page of all conversation reports, and surfaces the `reportedMessageCounts` the API already returns as badges on individual messages.
- The disabled "delete conversation — coming soon" control is removed rather than implemented (no endpoint exists; DESIGN forbids non-functional controls).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `admin-conversation-moderation`: the admin conversation API gains a stats endpoint, date-range and allow-listed sort parameters, a capped export endpoint, a lighter row projection (`memberCount`), and report-age signal (`oldestPendingReportAt`); report lookup gains `targetId` scoping so a single conversation's reports are fetched directly.
- `admin-conversation-workbench`: the list requirement grows tab counts, date-range filtering, allow-listed sorting, page-size selection, and URL-persisted state; the detail requirement changes from a **drawer** to a **shareable route**, adds per-message reported-count badges, and drops the disabled delete-conversation button.
- `admin-report-inbox`: the report list requirement gains a `targetId` filter so one conversation's reports can be fetched directly instead of downloading a page of all conversation reports and filtering client-side.

## Impact

- **Backend** — `chat-backend/src/admin/admin-moderation.controller.ts` (list/detail/stats/export, shared filter builder), `chat-backend/src/admin/dto/list-conversations.dto.ts`, `chat-backend/src/admin/admin.module.ts` (route registration order: `conversations/export` must precede `conversations/:id`), possible `reports` compound index.
- **Frontend** — `admin-web/src/pages/ConversationsPage.tsx` + `ConversationsPage.css`, new `admin-web/src/pages/ConversationsDetailPage.tsx` and `admin-web/src/components/ConversationDetail.tsx`, `admin-web/src/App.tsx` (new route), reuse of existing kit (`ListHeader`, `StatusTabs`, `FilterPopover`, `ColumnHeader`, `Pagination`, `StateBlock`, `EmptyState`, `ExportButton`).
- **Contracts** — `report-labels.ts#reportTargetHref` already emits `/conversations?focus=<id>`; that parameter must resolve to the new detail route so report→conversation links keep working.
- **Media** — no change to the presign contract: detail keeps rendering only `*Signed` fields with a re-sign/retry path.
- **Docs** — `admin-web/DESIGN.md` §9 known-debt list and the `/conversations` row in `admin-web/AGENTS.md`.
- **Tests** — admin-web vitest (URL↔params mapping, list states, row navigation, detail report fetch/mutation, export dialog) and `chat-backend` jest for the new endpoints.