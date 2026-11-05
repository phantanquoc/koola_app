# Proposal

## Why

The admin `/conversations` page is a 24-line skeleton (3-column table, uncontrolled search, silent error swallowing) while moderators need a real workflow: find heated or reported conversations, inspect members and message context, remove violating messages, and resolve reports without jumping between pages. Backend support exists but the list endpoint sorts by `updatedAt`, filters on a nonexistent `topic` field, and cannot filter by pending reports or member count.

## What Changes

- Rebuild `ConversationsPage.tsx` on the `UsersPage` frame: debounced search + submit, type filter, pending-report filter, member-count filter, sort by last message, table, pagination, filter chips, loading/error/empty states, toasts.
- Add a 480px detail drawer: member list with role badges, 20 recent messages read-only (soft-deleted shown dimmed with badge), message soft-delete behind `ConfirmDialog`, related reports with inline resolve/dismiss, delete-conversation button disabled with "coming soon" tooltip.
- Backend `GET /admin/conversations`: drop the dead `topic` filter, sort by `lastMessageAt`, add `hasPendingReport`, `minMembers`, `maxMembers` query params. No schema changes.

## Capabilities

### New Capabilities

- `admin-conversation-workbench`: end-to-end admin workflow for browsing, filtering, inspecting, and moderating conversations from the admin web panel (list UX, detail drawer, inline moderation actions).

### Modified Capabilities

- `admin-conversation-moderation`: list endpoint behavior changes — sort key becomes `lastMessageAt` desc instead of `updatedAt` desc, `topic` search removed, new `hasPendingReport`/`minMembers`/`maxMembers` filters.

## Impact

- Frontend: `admin-web/src/pages/ConversationsPage.tsx` only (rewrites the skeleton; reuses existing kit components, no new dependencies).
- Backend: `chat-backend/src/admin/admin-moderation.controller.ts` and its service (query params only; response shape unchanged, backward compatible).
- No DB migration, no schema change, no new endpoints.
