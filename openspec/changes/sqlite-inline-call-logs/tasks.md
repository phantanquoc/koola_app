## 1. SQLite Foundation — `call_logs` Table and Migration

- [ ] 1.1 Add migration step for `call_logs` table + indexes `(conversation_id, started_at DESC)` in `ChatApp/src/services/db/migrations/index.ts` (append to `MIGRATIONS`, bump `CURRENT_VERSION` to 3) <!-- idempotent IF NOT EXISTS, transactional per migration -->
- [ ] 1.2 Extend `ChatApp/src/services/db/dbInit.ts` `wipeAllData()` to also call `callLogRepository.wipeAll()` and ensure `runMigrations()` picks up the new version on fresh and upgraded installs
- [ ] 1.3 Verify migration behavior: fresh install at v3, upgrade v2→v3 preserves existing rows, double-run is idempotent, failure leaves `schema_version` untouched ← (verify: schema after migration has `call_logs` + index, existing `messages`/`conversations`/`outbox` rows untouched, `schema_version=3`)

## 2. Call Log Repository — `callLogRepository.ts`

- [ ] 2.1 Create `ChatApp/src/services/db/callLogRepository.ts` with types `CallLogInput`/`DbCallLog`, helpers `toMs`, `rowToInput`, and `list({conversationId, currentUserId?, limit, before?})` + `listBefore` + `getById` reading from SQLite ordered by `started_at DESC` using the hot-path index
- [ ] 2.2 Implement `upsertMany(CallLogInput[])` — single transaction, INSERT or UPDATE by `id`, single `notify(conversationId, {kind, messageIds, orderChanged:true})` per affected conversation (coalesced; mirror `messageRepository.upsertMany` contract)
- [ ] 2.3 Implement `subscribe(conversationId, cb)` / `wipeAll()` / optional `pruneOldCallLogs(opts)` via `invalidationBroadcaster`; ensure per-conversation scoping and clean unmount
- [ ] 2.4 Add `ChatApp/src/services/db/__tests__/callLogRepository.spec.ts` covering list ordering, listBefore cursor, upsert idempotency, subscribe scoping, and wipeAll ← (verify: `callLogRepository.spec` green; list ≤20ms budget asserted via perf log or mock DB harness)

## 3. Realtime Path — Socket → SQLite

- [ ] 3.1 Extend `ChatApp/src/services/sync/socketEventRouter.ts` with call-log handlers that `callLogRepository.upsertMany([payload])` on incoming call-log socket events; verify exact backend event name/payload by reading `chat-backend/src/call-logs` and `chat-backend/src/webrtc` gateway (use `call_log_created`/`call_log_updated` or the existing `call_ended` family if backend already emits full `CallLog` payloads) and normalize payload to `CallLogInput`
- [ ] 3.2 (Conditional) If backend does not already emit a per-conversation room event for call-log creation/update, add emit in `chat-backend/src/call-logs/call-logs.service.ts` or `webrtc.gateway.ts` — e.g., `server.to('conv:<conversationId>').emit('call_log_created', log)` — gated by conversation membership, no API shape change ← (verify: while in ChatScreen for C, ending a call causes the new card to appear within one frame via subscription, without any `GET /call-logs` request observed)

## 4. Background Sync — `syncCallLogsOnOpen`

- [ ] 4.1 Add `syncCallLogsOnOpen(conversationId)` in `ChatApp/src/services/sync/syncOrchestrator.ts` that paginates `callLogsApi.getHistory({conversationId, page, limit:50})`, maps to `CallLogInput`, `callLogRepository.upsertMany`, respects per-conversation freshness window (e.g., 60s via `sync_state` key `call_logs:<id>`), runs off the critical path and is fire-and-forget from the caller
- [ ] 4.2 Add tests for `syncCallLogsOnOpen` — freshness skip, multi-page pagination, idempotent upsert, no throw on network failure ← (verify: no network call when fresh; second call within window is no-op; multi-page merges correctly)

## 5. Hook Rewrite — `useInlineCallLogs` SQLite-First

- [ ] 5.1 Rewrite `ChatApp/src/screens/chat/hooks/useInlineCallLogs.ts` to SQLite-first: `useState(() => repo.list({conversationId, limit:50}))` for instant mount, `useEffect` subscribe to `repo.subscribe(conversationId)` driving reload, `useEffect` fire-and-forget `syncCallLogsOnOpen(conversationId)` off the critical path, `loadMore` via `repo.listBefore`, `refresh` via forced background sync; remove REST from the mount path and remove the `transitionDone` gate from the read path (gate may remain only for sync timing if desired)
- [ ] 5.2 Drop the `webrtcService` terminal-event debounce REST refetch as the primary realtime path (keep only as optional fallback if socket emit is absent), ensuring no stale `conversationId` capture and no double fetch
- [ ] 5.3 Update `ChatApp/src/screens/chat/hooks/__tests__/useInlineCallLogs.spec.tsx` to the SQLite harness (in-memory DB via `_setDbForTesting`), covering mount instant read, subscription-driven update, `loadMore` cursor, and `refresh`/sync; remove REST-mock expectations for the critical path ← (verify: no `callLogsApi.getHistory` in the mount critical path; realtime event appears via subscription; offline still shows cached cards)

## 6. ConversationList Warm (Optional, Fire-and-Forget)

- [ ] 6.1 Add warm prefetch in `ConversationListScreen` (or `conversationRepository` warm layer) that after `conversationsApi.list` succeeds, fires `syncCallLogsOnOpen` for top 8-12 conversations without awaiting or blocking UI; failures are logged only ← (verify: opening a recent conversation that was warmed shows inline cards on first frame even before any ChatScreen sync)

## 7. Wiring, Types, and Regression

- [ ] 7.1 Ensure `ChatApp/src/screens/chat/ChatScreen.tsx` merge `displayedMessages` remains unchanged and receives `callLogs` synchronously; verify no prop change to `CallMessageCard` and `renderMessage` identity stays pinned
- [ ] 7.2 Run type-check and tests: `ChatApp: tsc --noEmit`, `jest` (new `callLogRepository.spec`, updated `useInlineCallLogs.spec`, existing `migrations.spec` with v3), `chat-backend: tsc` if backend emit patched; manual device smoke: cold open conv with calls → instant; end a call while in conv → instant card; offline open → cached cards ← (verify: tsc 0 errors, jest green, device smoke passes cold/warm/realtime/offline)
