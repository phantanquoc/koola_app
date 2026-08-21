## Context

ChatScreen currently has a split read path. Text/media messages use the SQLite local-first path: `useMessagesFromDb` calls `messageRepository.list()` synchronously inside the `useState` initializer, so the first React render already has rows and GiftedChat paints immediately. Inline call cards use the opposite path: `useInlineCallLogs` starts from `[]`, waits for a `useEffect` to fire `GET /call-logs?conversationId` over the network, then merges via `displayedMessages`. The merge includes a sort, so the list reflows on the second render — the user perceives a pop-in after 80-300ms. The hook also gates its initial fetch on a `transitionDone` flag and re-fetches on `useFocusEffect` and `webrtcService` terminal events with a 350ms debounce, which adds latency and complexity.

The project already has the building blocks for the correct solution under `ChatApp/src/services/db/`: a synchronous `op-sqlite` connection with WAL, forward-only migrations, a frame-coalesced `invalidationBroadcaster`, a `messageRepository` with `list/listBefore/upsertMany/subscribe/applySocketEvent`, `syncStateRepository`, `syncOrchestrator` with freshness windowing, and `socketEventRouter` that funnels `socketService` events into the repository layer. The fix mirrors that proven pattern for call logs.

Stakeholders: mobile chat UX (ChatScreen, ConversationList), local DB layer, sync/socket infrastructure, backend call-logs module (conditional emit patch only).

## Goals / Non-Goals

**Goals:**
- Inline call cards render on the first frame when opening a conversation, with zero network wait in the critical path.
- A call that ends while the user is inside the conversation appears in the timeline in real time without a REST refetch.
- Offline: previously synced call logs remain visible; online: background sync reconciles gaps.
- Preserve the existing `displayedMessages` merge/sort contract and `CallMessageCard` props.

**Non-Goals:**
- Changing `GET /call-logs` pagination contract or backend persistence shape.
- Redesigning `CallMessageCard` visuals or `CallMessageCard` grouping rules.
- Replacing the GiftedChat/inverted-list rendering model or introducing a new state library.
- Offline creation of call logs (calls always require network; only reads are offline).

## Decisions

### Decision: SQLite table `call_logs` mirroring `CallLog` schema
- **What:** New table with columns `id (PK, string _id)`, `session_id`, `conversation_id`, `initiator_id`, `target_user_id`, `call_type`, `status`, `started_at`, `answered_at`, `ended_at`, `duration`, `created_at`/`updated_at` if needed for sync. Timestamps stored as `INTEGER ms epoch`. Add indexes `(conversation_id, started_at DESC)` for hot-path list and `(conversation_id, updated_at DESC)` if sync uses updatedAt cursor. If a global sync cursor is introduced for call logs, a single `sync_state` key `call_logs:<conversationId>` or a global `call_logs` cursor can be evaluated — decision deferred to implementation, default is per-conversation pagination without a global cursor, matching the existing `callLogsApi` shape.
- **Why SQLite over in-memory cache:** Survives app restarts, works offline, reuses the same read path that already eliminated the pop-in for messages. In-memory cache would reintroduce cold-start misses.
- **Alternatives considered:** In-memory `Map` + prefetch warm — rejected because it misses cold start and is lost on reload; bundling call logs into `GET /messages/sync` — rejected because it couples unrelated domains and still waits on network. SQLite is the only option that makes the critical path synchronous.

### Decision: `callLogRepository` mirroring `messageRepository` API
- **What:** Functions `list({conversationId, limit, before?})`, `listBefore`, `getById`, `upsertMany(CallLogInputs[])`, `subscribe(conversationId, cb)`, `wipeAll()`, `pruneOldCallLogs()`. `upsertMany` upserts by `id`, runs in a transaction, coalesces notifications per conversation with `orderChanged: true` so `useInlineCallLogs` does a single `list()` reload.
- **Why:** Consistency with the existing repository pattern; reviewers already understand its invariants (transaction, invalidation, frame coalescing).
- **Alternatives considered:** Separate repository with custom notify — rejected, the broadcaster is already conversation-scoped and reusable.

### Decision: Rewrite `useInlineCallLogs` to SQLite-first
- **What:** `useState(() => repo.list({conversationId, limit:50}))` for instant mount; `useEffect` subscribes to `repo.subscribe(conversationId)` and triggers reload; `useEffect` also calls `syncCallLogsOnOpen(conversationId)` fire-and-forget off the critical path; `loadMore` becomes a synchronous `repo.listBefore` cursor read; `refresh` triggers a forced background sync; remove the `transitionDone` gate from the critical path (gate may remain for sync timing only, not for the initial read). Drop the `webrtcService` terminal-event debounce refetch in favor of socket→SQLite (keep as fallback only if socket emit is delayed).
- **Why:** Eliminates network from first-frame render and simplifies the hook.
- **Alternatives considered:** Keep REST on mount + cache — still pays network on first open.

### Decision: Socket → SQLite via `socketEventRouter`
- **What:** Add handlers for the backend's call-log socket events (e.g., `call_log_created`, `call_log_updated`, or reuse existing `call_ended` family if backend already emits them with full `CallLog` payload) that call `callLogRepository.upsertMany([payload])`. Wire them in `wireSocketEvents()`.
- **Why:** Real-time update without REST poll; matches the `new_message` → `messageRepository.upsertMany` path.
- **Alternatives considered:** Keep `webrtcService` event subscription + REST refetch — retains pop-in and debounce complexity.

### Decision: `syncCallLogsOnOpen` in `syncOrchestrator`
- **What:** Function `syncCallLogsOnOpen(conversationId)` that paginates `callLogsApi.getHistory({conversationId, page, limit:50})`, maps to `CallLogInput`, `callLogRepository.upsertMany`, respects a per-conversation freshness window (e.g., 60s via `sync_state` key `call_logs:<id>`). Called from `useInlineCallLogs` off the critical path and optionally from `ConversationListScreen` warm (fire-and-forget for top N conversations).
- **Why:** Keeps the REST fetch but moves it off the hot path; incremental upserts cause at most one batched notify, not a reflow per page.
- **Alternatives considered:** Global `/call-logs/sync` endpoint — not needed; per-conversation paging is cheap and matches existing usage.

### Decision: Migration as `MIGRATIONS[2]` (`003_call_logs` in SQL file if used)
- **What:** Append a new migration step that creates `call_logs` and its indexes via `IF NOT EXISTS`. Bump `CURRENT_VERSION` to 3. No data loss, transactional per migration.
- **Why:** Forward-only, idempotent, already tested via `migrations.spec.ts`.

### Decision: ConversationList warm is optional and fire-and-forget
- **What:** After `conversationsApi.list` succeeds, schedule `syncCallLogsOnOpen` for the first 8-12 conversations without awaiting or blocking UI. Failures are logged, not surfaced.
- **Why:** Improves hit rate for the common case (user opens a recent conv) without adding complexity.

## Risks / Trade-offs

- **Backend does not emit a socket event for call-log creation/update** → Realtime path never fires; mitigated by verifying `chat-backend/src/call-logs` and `webrtc` emit flow and adding `server.to('conv:<id>').emit('call_log_created', log)` (or equivalent) if missing. Background sync still reconciles, so UX degrades to "next open" rather than breaking.
- **Schema drift between Mongo `CallLog` and SQLite `call_logs`** → Mitigated by mirroring resident fields only (`_id`, `sessionId`, `initiatorId`, `targetUserId`, `conversationId`, `callType`, `status`, `startedAt`, `answeredAt`, `endedAt`, `duration`) and mapping explicitly in one place.
- **SQLite growth** → Mitigated by reusing the existing `pruneOldMessages` pattern with a `call_logs` counterpart (optional for this change; can be a follow-up).
- **Double notify / extra renders** → Mitigated by the broadcaster's frame coalescing and `upsertMany`'s single notify per conversation.
- **Stale `transitionDone` semantics** → Mitigated by removing the gate from the sync read path; the gate only delays the background sync, not the `list()`.

## Migration Plan

1. Add migration step for `call_logs` table + indexes; `runMigrations()` picks it up on next launch (idempotent, transactional).
2. Add `callLogRepository` and its tests; wire `dbInit.wipeAllData` to also `callLogRepository.wipeAll()`.
3. Extend `socketEventRouter` with call-log handlers.
4. Extend `syncOrchestrator` with `syncCallLogsOnOpen`.
5. Rewrite `useInlineCallLogs` to SQLite-first; update its spec tests to use an in-memory SQLite harness (same pattern as `messageRepository.spec.ts`).
6. (Optional) Add ConversationList warm; no migration needed.
7. Deploy mobile first; backend emit patch (if needed) can land independently — mobile degrades gracefully to background sync until the emit is present.
8. Rollback: reverting the mobile build leaves the `call_logs` table inert (no reads against it in the old code); no data loss.

## Open Questions

- Exact socket event name/payload the backend uses for call-log writes — to be verified by reading `chat-backend/src/call-logs` and `webrtc` gateway before implementation.
- Whether to use a per-conversation `sync_state` freshness key or a single global key for call logs — default to per-conversation to match the existing paging model.
