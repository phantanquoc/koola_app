## Context

The mobile chat client today reads messages by hitting `messagesApi.list` on every conversation open and uses MMKV (`messageCacheService`) only as a paint-time hint for the first 50 messages. Even after the recent skip-REST-when-fresh + flush-on-unmount improvements, the UX still trails Zalo/Telegram because:

- Cold-start conversations always pay 200–800 ms of REST latency.
- History older than the cached 50-message head requires another REST round-trip.
- Search is impossible without a server endpoint.
- Offline reads of prior conversations are limited to whatever is in the MMKV head slice.

Industry-standard chat apps solve this with a local-first SQLite store on the client and a delta-sync protocol with the server. APP_KOOLA's backend (NestJS + MongoDB + Socket.IO with Redis fanout) and the existing mobile services (MMKV, Socket.IO, OfflineQueueService, mediaIndexService) provide the right foundation for the same pattern.

This document records the technical decisions for the migration, the intended architecture, and the staged rollout plan.

## Goals / Non-Goals

**Goals:**
- A local SQLite database becomes the canonical read source for chat UI on mobile.
- Conversation open paints in ≤ 50 ms when the database has data.
- Background sync (foreground transition + socket reconnect) reconciles local SQLite with backend MongoDB without blocking UI.
- Existing socket events continue to be the real-time path; they are now applied to SQLite first.
- Migration is incremental, gated by a feature flag, and reversible.
- The change is invisible to the backend's existing real-time pipeline (no breaking change to gateway events or Mongoose schemas).

**Non-Goals:**
- End-to-end encryption of the local database (separate work).
- iOS-only optimisations (Android is the primary target; iOS gets the same schema by default).
- Replacing or modifying the existing MMKV-backed `mediaIndexService` (orthogonal capability already shipped).
- Replacing the existing cursor-paginated `GET /conversations/:id/messages` endpoint — it remains the load-earlier path.
- Implementing search UI in this change. The FTS5 capability is included in specs to lock in the schema, but the UI work is deferred to a follow-up change.

## Decisions

### Decision 1: Use `op-sqlite` as the SQLite binding

**Choice:** [op-sqlite](https://github.com/OP-Engineering/op-sqlite) (Margelo).

**Why:**
- JSI-based, synchronous reads available where needed, and benchmarked as the fastest RN SQLite binding by a wide margin.
- Maintained by the same team behind `react-native-mmkv` (already in our stack), so the install and New-Architecture story is familiar — Fabric + TurboModules compatible.
- Supports FTS5 out of the box (needed for Phase 4 search).
- Plain SQL surface, no model framework lock-in. We can wrap it in a thin repository ourselves.

**Alternatives considered:**
- **WatermelonDB** — strong reactive model and observable queries, but imposes a model framework, has its own sync protocol, and conflicts with our bespoke socket-based real-time pipeline. Adopting it would force a larger rewrite of `useMessages` and OfflineQueueService.
- **expo-sqlite** — simpler API, but slower (no JSI sync path until very recent versions), and the project does not currently use Expo modules elsewhere on the chat surface. Adopting it would add Expo modules just for one feature.
- **react-native-quick-sqlite** — predecessor of op-sqlite with the same author moved to op-sqlite; effectively deprecated.
- **react-native-sqlite-storage** — bridge-based (slow), less actively maintained, no New-Architecture story.

### Decision 2: Hand-rolled repository layer over raw SQL

**Choice:** Thin repository modules under `ChatApp/src/services/db/` exposing typed functions (`messageRepository.list`, `messageRepository.upsertMany`, etc.) backed by hand-written SQL strings inside the repo. No ORM.

**Why:**
- We need precise control over the SQL for the hot-path queries (`(conversation_id, created_at DESC)` index). ORMs tend to generate suboptimal SQL.
- Schema is small (≤ 5 tables) and stable. The cost of an ORM is not justified.
- Easier to reason about migrations and cross-platform parity.

**Alternative:** Drizzle ORM has an op-sqlite adapter and a nice TypeScript story, but it is overkill at this scale and adds a build-time dependency.

### Decision 3: Schema-versioned forward-only migrations in user-space

**Choice:** A single-file migration registry under `ChatApp/src/services/db/migrations/` that applies migrations in order inside a transaction at app launch, using a `schema_version` table (single row, single int).

**Why:**
- We control timing and error handling (we want a recoverable error UI rather than a silent crash).
- Op-sqlite does not ship a built-in migration tool; user-space migrations are the standard pattern.
- Forward-only avoids the bug class where a downgrade migration drops user data.

**Constraints written into the spec:**
- Migrations run inside a single transaction. Any failure rolls back and leaves `schema_version` at the pre-migration value.
- Migrations must be idempotent.
- Destructive migrations require explicit user confirmation (no spec yet — out of scope until needed).

### Decision 4: Reactive subscription via per-conversation invalidation broadcaster

**Choice:** `messageRepository.subscribe({ conversationId, callback })` registers a callback in an in-process pub/sub. Every write that mutates a row notifies subscribers for the affected `conversation_id`. The hook layer maps the invalidation into a re-query + `setMessages`.

**Why:**
- Avoids the heavyweight overhead of WatermelonDB's reactive model framework.
- Matches the existing `socketService.on/off` pattern in the codebase, so the cleanup story is consistent.
- Subscriptions can be coalesced (one re-query per frame max) without changing the API.

**Alternative:** SQLite update hooks at the native level. Op-sqlite supports them, but they fire from a non-JS thread and complicate the contract; the in-process broadcaster is simpler and sufficient.

### Decision 5: Hybrid sync — REST delta + socket real-time

**Choice:** Real-time updates continue to flow through the existing `chat.gateway.ts` + Socket.IO + Redis adapter pipeline. The new `GET /messages/sync` endpoint is used only for catch-up after foreground / reconnect / cold start.

**Why:**
- We already have a working real-time pipeline. Replacing it with a "long-poll sync" pattern would be a bigger and riskier change with no UX benefit.
- The sync endpoint's only job is to fill gaps. With socket events for the live path, the sync window is small in steady state (only matters after offline / sleep).
- This matches WhatsApp / Telegram operationally: real-time push + delta catch-up.

**Trade-off:** Possible double-delivery (socket + sync both deliver the same message). Mitigated by idempotent UPSERT keyed on `id`, plus dedup on `client_message_id` for optimistic reconciliation. This is locked in `message-sync-engine` requirements.

### Decision 6: Extend the existing `/messages/sync` endpoint, do not create a new one

**Discovery:** The endpoint `GET /messages/sync?since=&cursor=&limit=` already exists in `chat-backend/src/messages/messages-sync.controller.ts:41`, returning messages newer than `since` across all conversations the user is a member of, with cursor pagination. The mobile hook `useMessageSync.ts` already consumes it and stores `lastSyncAt` in AsyncStorage.

**Choice:** Reuse this endpoint and the global-since semantics. Extend its response shape to include tombstones for soft-deleted messages, and add the missing Mongoose index. Do not introduce a new endpoint or per-conversation cursor.

**Why:**
- The global-since model is *already what we need* for foreground catch-up: one round-trip pulls every new message across all the user's conversations.
- Replacing it with a per-conversation endpoint would be a regression in network efficiency and a backwards-compat break for the existing client hook.
- Tombstones can be added by extending `messages.service.syncMessages` to return soft-deleted rows whose `updatedAt >= since`. No DTO change, just additional rows.
- Blast radius stays minimal: `messages.controller` untouched; `messages.service.syncMessages` widens its query; Mongoose gains one compound index.

**Index requirement:** compound `(conversationId, updatedAt)` so the tombstone-inclusive query does not collide with the existing `(conversationId, createdAt DESC)` list-earlier index. Verified by `explain()` in tests.

**Trade-off vs proposal v1:** The original proposal claimed the endpoint did not exist and specified a new multi-conversation API. That claim was wrong (corrected via verifier pass before implementation). Multi-conversation is achieved naturally by global-since; per-conversation `since` cursors are unnecessary and would over-engineer the storage in `sync_state`. The mobile sync engine therefore tracks a *single* global `lastSyncAt` (mirroring the current AsyncStorage key) under a `sync_state` row keyed `'global'`.

### Decision 7: Migration via one-shot MMKV→SQLite backfill

**Choice:** On first launch after upgrade, a backfill task reads the legacy MMKV `message-cache` instance and upserts every cached message into SQLite. After success, MMKV cache is deleted. Marked complete via `backfill_done` row in SQLite to stay idempotent.

**Why:**
- Preserves the user's "instant-on" experience for previously visited conversations across the upgrade boundary.
- Single explicit step is easier to reason about than a long-running dual-write coexistence.
- Backfill failure does not block boot — fall through to network sync as if it were a fresh install.

**Alternative:** Dual-write (write both MMKV and SQLite for one release). Rejected — doubles the persistence surface and creates a class of inconsistency bugs ("which one wins on read?") that the team would have to triage.

### Decision 8: Feature flag `LOCAL_FIRST_SQLITE`

**Choice:** A runtime/build-time flag controls whether the read path goes to SQLite or to the legacy MMKV+REST. Flag is checked once per ChatScreen mount.

**Why:**
- Lets us ship the database, repositories, and sync engine in production without flipping the read path until we are confident.
- Provides a safe rollback if a device-specific bug appears.
- The cost of the flag is tiny — one branch in one place. Worth it given the scope of the change.

**Removal plan:** flag is deleted in a follow-up change once a release has run with it on for the rollout window.

### Decision 9: OfflineQueueService stays out of scope; mirror backend `deleted: boolean`, not a richer `deleted_at`

**OfflineQueue:** `OfflineQueueService.ts` persists pending messages to AsyncStorage and is only consumed by some send paths — `useMessages.sendMessage` calls `messagesApi.send` directly without going through the queue. Reworking this to share SQLite persistence would expose existing inconsistency and increase scope materially.

**Choice:** Leave `OfflineQueueService` unchanged in this change. The new SQLite write path applies only to `useMessages` and the sync engine. The follow-up change `local-first-offline-queue-unification` (TBD) will collapse the two paths.

**Mongoose schema mirror:** Backend uses `deleted: boolean` (no `deletedAt` timestamp), `readBy: string[]`, and does not currently store `mediaThumbnailKey`. The SQLite schema mirrors backend exactly:

- `deleted INTEGER NOT NULL DEFAULT 0` (0/1, mirror of Mongo `deleted`)
- `read_by TEXT NOT NULL DEFAULT '[]'` (JSON array of user ids)
- `media_thumbnail_key TEXT` is kept on the SQLite row for compatibility with mobile code that already references it (`useMessages.toGiftedMessage` line 40), populated from the message payload as today; backend ignorance is harmless because mobile is the only consumer.

**Why:** A locally-richer schema (e.g. `deleted_at INTEGER`) creates a permanent translation layer between local and remote shape. The cost of the translator outweighs the cost of one boolean. If audit / undo features ever need a deletion timestamp, they will need backend support anyway and can be added together.

**Trade-off:** If we later want to sort by deletion time we will have to migrate. Acceptable; deletion-sort is not on the roadmap.

## Risks / Trade-offs

- **[Risk] Op-sqlite native module fails to install on a developer or device** → Mitigation: pin a known-good version, document install steps, provide a fallback build flag that disables SQLite; CI runs `assembleDebug` after install.
- **[Risk] Backfill writes inconsistent data because MMKV cache shape evolved** → Mitigation: backfill validates each row against the SQLite schema before insert, skips invalid rows, logs counts.
- **[Risk] Sync endpoint returns large payloads on first sync of a heavy account** → Mitigation: bounded initial window (e.g. last 200 messages or last 30 days, whichever smaller), enforced server-side; subsequent pages via cursor.
- **[Risk] Socket event arrives before `new_message` for a reaction (out-of-order)** → Mitigation: `applySocketEvent` upserts a stub row when needed; subsequent `new_message` upserts on the same id consolidate the data. Spec requirement covers this.
- **[Risk] Optimistic reconciliation creates duplicate rows when both REST send result and socket `new_message` arrive** → Mitigation: dedup transaction in `confirmSend`; the upsert on `client_message_id` ensures only one row survives. Existing tests in `useMessages.sendMessage` already exercise this race; adapt them.
- **[Risk] Database disk usage grows unbounded on heavy users** → Mitigation: per-conversation `messages` rows are not capped (canonical store), but media is bounded by the existing LRU cap (now configurable). A future change can introduce optional aging-out of very old rows; out of scope here.
- **[Risk] Logout race — wiping the DB while a write is in flight** → Mitigation: wipe runs after socket disconnect and after the OfflineQueue is paused; repository writes are serialised through the connection. Documented in `message-store-sqlite` requirements.
- **[Risk] Cross-account leakage if logout cleanup fails** → Mitigation: at login, compare `account_id` recorded inside the DB; if different from the new user, drop the entire DB and recreate. Belt-and-suspenders on top of the explicit logout wipe.
- **[Trade-off] Adds ~3–5 MB to the app binary** (op-sqlite + native deps). Acceptable given the UX gain and that the project already ships native modules of similar size.
- **[Trade-off] Schema changes now require migrations**. We accept the discipline cost; migrations are explicit and reviewed.
- **[Trade-off] Backend gains a new endpoint that must be authorised, indexed, and load-tested**. Scoped in `message-sync-api` spec; performance budget in proposal.
- **[Risk] ChatApp Jest is installed but unconfigured (no preset, no setup files)** → Mitigation: configure `react-native` Jest preset and the standard native module mocks (mmkv, op-sqlite, async-storage, gesture-handler, reanimated) as the *first* task. Repository tests cannot run otherwise. Listed as task 1.0 / blocker.
- **[Risk] AsyncStorage `lastSyncAt` belongs to `useMessageSync` and is read on every sync call** → Mitigation: backfill into SQLite `sync_state` ('global' row) on first launch with the flag on. Until backfill completes, `useMessageSync` keeps reading AsyncStorage; after backfill it switches to SQLite. Single switchover, no dual-read steady state.
- **[Risk] OfflineQueueService persists to AsyncStorage and runs parallel to `useMessages.sendMessage`** → Mitigation: out of scope per Decision 9. Document the existing inconsistency in the follow-up tech-debt change. The SQLite migration neither makes it worse nor depends on fixing it first.
- **[Risk] ChatHomeScreen's page-based pagination for conversation list is harder to migrate to SQLite than cursor-based** → Mitigation: SQLite repository exposes a simple `list({ limit, offset })` initially (offset paging matches backend); later migration to cursor is a non-breaking change once both ends use SQLite.
- **[Risk] `mediaThumbnailKey` is referenced in mobile (`useMessages.toGiftedMessage` line 40) but not present in backend schema** → Mitigation: SQLite stores it as a nullable column; sync just leaves it null when backend payload omits it. No-op until backend adds it.

## Migration Plan

**Phase 1 — Foundations (mobile-only, flag off):**
1. Add `op-sqlite` dependency and verify Android build.
2. Implement DB init, schema v1, migration runner.
3. Implement `messageRepository`, `conversationRepository`, `syncStateRepository` with tests.
4. Wire SQLite logout wipe into `AuthContext.logout` alongside existing MMKV `clearAll`.

**Phase 2 — Sync engine and socket adapter (mobile + backend):**
5. Backend: add `GET /messages/sync` + service method + Mongo index.
6. Mobile: implement sync orchestrator (foreground / reconnect / open triggers).
7. Mobile: route socket events through `messageRepository.applySocketEvent`.
8. Add Settings storage UI (toggle for `LOCAL_FIRST_SQLITE` in dev builds; config endpoint in prod).

**Phase 3 — Read-path migration (flag-gated):**
9. Refactor `useMessages` to use the repository when the flag is on. Keep MMKV+REST path live behind the flag.
10. Refactor `ConversationListScreen` similarly.
11. Implement MMKV→SQLite backfill on first launch with the flag on.
12. Internal dogfood with flag on; metrics on first-paint latency, sync error rate.

**Phase 4 — Rollout, search, cleanup:**
13. Enable flag for production users in stages.
14. After a stabilisation window, delete the legacy MMKV `messageCacheService` and the flag (separate change).
15. Implement FTS5 search + UI (separate follow-up change as noted).

**Rollback strategy:** Disable the feature flag. The legacy MMKV+REST path remains in place during Phase 3 specifically so rollback is one configuration toggle. After Phase 4 cleanup the rollback option goes away — by then we have committed.

## Open Questions

- Should the sync endpoint accept multiple `conversationIds` in a single call, or is the client expected to fan out one call per conversation? Decision: support multi-conversation in a single call (locked in `message-sync-api` spec) to keep foreground catch-up to one round-trip; revisit if backend memory pressure surfaces during load testing.
- Do we need to encrypt the local SQLite at rest? Out of scope for this change. Tracked separately under a future security-hardening proposal.
- Where do we surface "sync stale" indicators in the UI? Proposed but not required by spec. Default: silent. Will revisit after dogfooding.
- What is the maximum reasonable cap for media cache? Spec sets bounds 1 GB ≤ cap ≤ 20 GB; default 5 GB. Acceptable starting point; can be tuned post-launch based on device storage telemetry.
