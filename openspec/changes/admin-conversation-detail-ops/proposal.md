# Proposal

## Why

The conversation detail route shipped by `admin-conversations-redesign` is read-mostly: moderators can see rich context but several actions are badge-only, missing, or stale — per-message reports can only be counted (not resolved in place), pinned messages cannot be unpinned by an admin, the transcript cannot be filtered by sender, a wrongly soft-deleted message cannot be restored, group membership cannot be managed, and the team has nowhere to leave an internal hand-off note on a conversation. The user explicitly chose the "full operations" bundle (Phương án 3) after an audit of the detail page.

## What Changes

- **FE — in-place message report actions**: clicking a per-message pending-report badge lazily fetches that message's pending reports (`GET /admin/reports?targetType=message&targetId=<mid>&status=pending` — endpoint exists) and resolves/dismisses them behind a `ConfirmDialog`; list/report caches invalidated on success.
- **FE — transcript navigation**: "previous/next reported message" jump using `reportedMessageCounts`; "Xem báo cáo" link from conversation-level report cards to `/reports/:id`.
- **FE — sender filter**: dropdown of members on the detail route filtering the message stream server-side via new optional `senderId` on `ConversationDetailDto`.
- **BE — admin unpin**: `DELETE /admin/conversations/:id/pin/:messageId` mirroring the membership-gated user pin route (admin is not a member), with audit; "Đã ghim" cards gain a Bỏ ghim action with confirm.
- **BE — message restore**: `POST /admin/messages/:id/restore` sets `deleted:false`, writes audit, emits `message_restored` to `conversation:<id>` (unknown event is ignored by old clients; incremental sync via `updatedAt` is the correctness path). Detail rows gain "Hoàn tác gỡ"; soft-delete copy changes from "không thể hoàn tác" to reversible.
- **BE + schema — conversation internal note**: `Conversation.internalNote: string (≤500)`; `PATCH /admin/conversations/:id/note { note }` (admin, audited, redaction rules unchanged); detail renders an editable "Ghi chú nội bộ" card.
- **BE + FE — member management (group conversations only)**: `POST /admin/conversations/:id/members/:userId/role { role: 'member' | 'admin' }` and `DELETE /admin/conversations/:id/members/:userId` (kick), both audited; member chips get role-change/kick controls gated to group type.
- **Copy fixes**: stale bottom-bar note ("Mở tin nhắn để gỡ nội dung vi phạm" — soft-delete already works on the row) replaced; report confirm copy updated for restore.
- **Audit**: new `ADMIN_AUDIT_ACTIONS` entries (`unpin_message`, `restore_message`, `update_conversation_note`, `change_member_role`, `remove_member`) + `audit-labels.ts` labels.
- **Non-goals (unchanged)**: mute/lock/delete conversation, admin rename/avatar of a conversation, `messageCount` denormalization, polling/live refresh of the open detail, `?msg=` deep anchors — each is a separate product/backend decision.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `admin-conversation-workbench`: the detail-route requirement grows operational surface — in-place per-message report resolve/dismiss with confirmation, reported-message jump, report deep link, sender filter, unpin action, internal-note editor, member role/kick controls, message restore action, and corrected copy.
- `admin-conversation-moderation`: add an ADDED requirement for the new admin operations endpoints (unpin mirror, note PATCH, member role/kick, `senderId` detail filter) with guard/audit/scenario coverage.
- `admin-message-moderation`: the soft-delete requirement becomes reversible — `POST /admin/messages/:id/restore` with `message_restored` emit and idempotent semantics.

## Impact

- **Backend**: `admin-moderation.controller.ts` (3 new routes + `senderId` filter), `conversations.service.ts` (reuse pin/unpin/note/member service methods — verify each exists, otherwise add), `conversations/conversation.schema.ts` (`internalNote`), `messages` restore path, `ADMIN_AUDIT_ACTIONS` + `audit-labels.ts`, DTO `conversation-detail.dto.ts`.
- **Frontend**: `ConversationDetail.tsx` (badge lazy panel, jump controls, sender select, unpin, note editor, member actions, restore, links/copy), `ConversationsPage.css` (small styles), tests in `conversations.test.tsx`.
- **Contract stacking**: depends on `admin-conversations-redesign` landing first (its delta defines the detail-route requirement this change modifies).
- **Mobile**: no required change — `message_restored` is additive; sync picks up `deleted:false` through `updatedAt`. Kick/role events are not pushed (members re-fetch on next load) — accepted for v1.
- **Security**: all new routes behind the controller-level `JwtAuthGuard + AdminGuard`; membership bypass is intentional for moderation (same as existing admin soft-delete) and always audited.