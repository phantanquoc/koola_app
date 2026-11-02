# Design

## Context

See `proposal.md` — Why / What Changes. This change stacks on `admin-conversations-redesign` (its delta defines the `Conversation detail route for moderation` requirement this design extends); land that change first.

Current shape that constrains the approach:

- Detail route already exists (`ConversationsDetailPage` + `ConversationDetail`) with confirm+toast+invalidate patterns, per-message `reportedMessageCounts`, resolved `pinnedMessages`, and pending/history report queries split by `targetId`.
- Pin/unpin exists only on the user-facing `POST/DELETE /conversations/:id/pin/:messageId`, membership-gated (`conversations.controller.ts`) — an admin is usually not a member, so it cannot be reused as-is.
- Soft-delete exists (`POST /admin/messages/:id/soft-delete` → `deleted:true` + `message_deleted` emit + audit); there is no reverse path, and UI copy currently claims irreversibility.
- `Conversation` schema has no internal-note field; the user profile precedent is a plain `internalNote` string edited through a dedicated PATCH.
- Group membership is fully service-managed on the user side (`ConversationsService`); no admin routes exist. Direct conversations must not accept kick/role operations.
- Audit discipline (DESIGN §5.2.2): every mutation goes through `ADMIN_AUDIT_ACTIONS` + `audit-labels.ts`; REST writes truth first, socket emits after commit.

## Goals / Non-Goals

**Goals:**

- A moderator can resolve message-level reports, unpin, restore a wrongly deleted message, filter the transcript by sender, jump between reported messages, manage group membership, and leave/read an internal note — all from `/conversations/:id` without losing context.
- Every new mutation is guarded, audited, confirmed in UI where destructive/irreversible-ish, and works with the existing TanStack Query cache model.
- Zero required mobile changes for this release.

**Non-Goals:**

- Mute/lock/delete conversation, admin edit of conversation name/avatar, `messageCount` denormalization, polling for live updates, `?msg=` anchors (see proposal).
- Restoring per-user `deletedFor` ("xóa phía tôi") state — restore only reverses the global admin soft-delete.
- Real-time push of membership changes to other connected members (v1 refetches on next load).

## Decisions

### D1 — Per-message report actions are lazy per-badge fetches, not a prefetched batch

Clicking a badge issues `GET /admin/reports?targetType=message&targetId=<mid>&status=pending&limit=50` (endpoint exists) and renders an inline confirm+action panel under the row. Success invalidates `['reports']`, `['conversation', id]` (badge counts live in the detail payload), `['conversations']`, `['conversations-stats']`.

- **Chosen over**: batch-fetching all message reports for shown messages — would need a new `targetIds[]` backend param for a cost paid on every load, while most conversations have zero reported messages.
- **Chosen over**: navigating to `/reports/:id` as the only path — loses transcript context, which is the point of this change (A0).

### D2 — Admin unpin is a mirrored admin route, not loosened user guards

`DELETE /admin/conversations/:id/pin/:messageId` lives on `AdminModerationController`, calls the same `ConversationsService` unpin method the user route uses, writes `unpin_message` audit, and returns 404 when the pin is absent.

- **Chosen over**: relaxing the user route's membership check — that would open member-gated write surface to any authenticated user shape and mixes audit/actor semantics.

### D3 — Restore mirrors soft-delete; sync is the correctness path, socket is best-effort

`POST /admin/messages/:id/restore` sets `deleted:false` **only when currently deleted** (idempotent no-op otherwise, no second audit), emits `message_restored` after the DB write to `conversation:<conversationId>`, and audits `restore_message`.

- Old clients ignore the unknown event; incremental sync (`updatedAt` bumps) is what guarantees convergence — same trust model as other additive events.
- **Chosen over**: rolling back `deletedFor[]` — that array is per-user "delete for me" state (spec `delete-for-me`) and must not be touched by an admin global restore.
- UI copy for soft-delete/restore flips to reversible pair; both sides of the pair stay behind ConfirmDialog (§3A2).

### D4 — Internal note: one schema field + one dedicated PATCH route

`Conversation.internalNote: string`, `default: ''`, `@MaxLength(500)`. `PATCH /admin/conversations/:id/note` accepts `{ note }` (empty string clears), audits `update_conversation_note` **without** echoing the note body into the audit payload (the note itself is readable on the conversation; audit keeps action+target only).

- **Chosen over**: a general conversation PATCH for admins — too easy to widen into editing user content (name/avatar), which is a product decision explicitly out of scope.
- **Chosen over**: a separate collection — a single short field does not warrant a join; mirrors `user.internalNote`.

### D5 — Member management: group-only, last-member guard, reuse service semantics

- `POST .../members/:userId/role` body `{ role: 'member' | 'admin' }` (`@IsIn`), `DELETE .../members/:userId` = kick.
- Both reject non-group conversations with 400; unknown conversation 404; unknown/not-a-member target 404; kick of the **last remaining member** → 400 (refuses to orphan the group).
- Implementation reuses `ConversationsService` membership mutations if their signatures fit (verify in tasks; otherwise thin wrappers that keep membership rules in the service layer — never duplicate membership logic in the controller).
- Audit: `change_member_role`, `remove_member`.
- **Chosen over**: chip-nested buttons inside the existing member `<Link>` — nested interactive elements are invalid a11y. Chip becomes a wrapper: identity stays a `Link`, role/kick buttons are siblings (group only), confirm dialogs before POST.

### D6 — Sender filter is a server-side `senderId` query param on the existing detail endpoint

`ConversationDetailDto` gains optional `senderId: string`; `msgFilter.senderId = senderId` when present (exact match, keeps `before`/`limit` pagination). FE renders a select of loaded members; changing it refetches `['conversation', id, senderId]` (sender in query key).

- **Chosen over**: client-side filtering — the client only holds the first page plus whatever was loaded; a filtered view must be complete.
- Alternative considered: extending `/admin/messages/search` — it requires `q`, wrong tool for "all messages from X".

### D7 — Reported-message jump operates on the shown set only

`reportedMessageCounts` keys ∩ currently loaded message ids form an ordered list; prev/next scrolls via the existing `msgRowRefs` mechanism. Messages not yet loaded are reached by load-older (spec wording: "among those shown").

- **Chosen over**: a backend "next reported message id" endpoint — extra round-trip for a navigation aid; load-older already exists.

### D8 — New audit actions join the shared constants

`ADMIN_AUDIT_ACTIONS` += `unpin_message`, `restore_message`, `update_conversation_note`, `change_member_role`, `remove_member`; matching Vietnamese labels in `audit-labels.ts` (one source per §5.2.2 — no `as unknown as` casts).

## Risks / Trade-offs

- **Restore vs clients that cached `deleted:true`** → unknown `message_restored` event is harmless; `updatedAt` sync converges. Residual: a client offline until forever still shows old state until next sync — same as every other mutation today.
- **Kick/role not pushed to other members** → other members see stale membership until their next detail load. Mitigation: same-tab invalidation refetches; document as v1 limitation in the spec scenario (no live requirement written).
- **Unpin race (user unpins concurrently)** → admin call 404; UI treats 404 as "already gone" and drops the card (refetch via `['conversation', id]`).
- **Badge-click stampede** → each click is one `targetId`-scoped query; panel is single-open (opening another closes the first), so concurrency stays at 1.
- **Chip restructure breaks styling/a11y** → keep `.conv-member-chip` visual classes, only change link nesting; verify at 1440/860 widths in the manual pass.
- **`senderId` filter + find bar interplay** → find still runs against the filtered stream (server find is scoped by `conversationId` only) — acceptable; hint text already tells the user results may need load-older.
- **Schema additive field** → no migration; old documents read as `''` via default on hydrate? (Mongoose applies schema default only on create — read path must treat `undefined` as `''`; note editor initializes with `?? ''`).

## Migration Plan

1. Backend first: DTO param → endpoints → schema field → audit constants (each step jest-green; `npx jest src/admin` + `npx jest src/conversations` if touched).
2. Frontend: badge panel → jump/sender → unpin/note/member/restore UI + copy fix (vitest per task).
3. Deploy order matters: FE ships after BE (new routes would 404 otherwise); rollback = revert FE first, then BE (the `internalNote` field is inert if unused).

## Open Questions

- None blocking: socket emit for membership changes, note-in-audit-payload, and messageCount are explicitly decided out of scope (proposal Non-Goals / D4).