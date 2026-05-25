## 1. Phase 0 — Test Infrastructure Blocker (must complete first)

- [x] 1.1 Add `jest-preset` for React Native to `ChatApp/jest.config.js` (preset, transformIgnorePatterns, testEnvironment); add `setupFiles` mocking `react-native-mmkv`, `react-native-blob-util`, `react-native-fast-image`, `@react-native-async-storage/async-storage`, `react-native-gesture-handler`, `react-native-reanimated`
- [x] 1.2 Add an op-sqlite mock (in-memory SQL or a thin sqlite3 wrapper) so repository tests can run on Node without a device
- [x] 1.3 Verify `npm test` runs an empty smoke test under ChatApp without errors before any repository code is written ← (verify: `npm test` exit code 0; mocks resolve cleanly)

## 2. Phase 1 — Foundations: Database and Repositories

- [x] 2.1 Add `op-sqlite` dependency to `ChatApp/package.json`; run `npx pod-install` (iOS, optional this phase) and confirm Android `assembleDebug` succeeds
- [x] 2.2 Create `ChatApp/src/services/db/connection.ts` with a singleton `getDb()` that opens `koola.db` from the app documents directory
- [x] 2.3 Create `ChatApp/src/services/db/migrations/index.ts` with a forward-only migration runner: reads `schema_version`, applies pending migrations inside a single transaction, rolls back on error
- [x] 2.4 Add migration `001_initial.sql` that creates `messages`, `conversations`, `sync_state`, `schema_version`, `account_state` tables and the indexes specified in `message-store-sqlite/spec.md`. Schema MUST mirror backend (`deleted` boolean, `deleted_for` JSON, `read_by` JSON, `media_thumbnail_key` nullable)
- [x] 2.5 Wire DB init into app startup (after `setUser(me)` in `AuthContext.restoreSession` line 114, plus the matching points in `login`, `register`, `verifyOtp`) so the schema is ready before any chat screen mounts
- [x] 2.6 Implement `messageRepository` with `list`, `listBefore`, `getById`, `insertOptimistic`, `confirmSend`, `markFailed`, `upsertMany`, `applySocketEvent`, `softDeleteForUser`, `subscribe` (matches `message-store-sqlite` requirements)
- [x] 2.7 Implement `conversationRepository` with `list`, `getById`, `upsertMany`, `subscribe`. Initial `list` API supports `{ limit, offset }` to match the existing page-based `conversationsApi.list`
- [x] 2.8 Implement `syncStateRepository` with `getCursor('global')`, `setCursor('global', iso)`, `clearAll` ← (verify: every repository function has unit tests and meets the budgets in `message-store-sqlite` performance scenario)
- [x] 2.9 Implement an in-process invalidation broadcaster used by `subscribe()`; coalesce multiple invalidations within one frame (requestAnimationFrame or microtask)
- [x] 2.10 Add `account_id` column to `account_state` and write a guard that drops/recreates the DB at login when `account_id` differs from the new user's id
- [x] 2.11 Extend `AuthContext.logout` (line 210, `finally` block) to call `messageRepository.wipeAll()` + `conversationRepository.wipeAll()` + `syncStateRepository.clearAll()` after socket disconnect, alongside the existing MMKV `clearAll` ← (verify: logout-then-login as different user shows zero rows from prior account)

## 3. Phase 2 — Backend Sync API (extend, do not create)

- [x] 3.1 In `chat-backend/src/messages/messages.service.ts` `syncMessages`, widen the query so soft-deleted messages whose `updatedAt >= since` are included in the result set, with a tombstone projection (id, conversationId, updatedAt, deleted, deletedFor) — content fields MAY be elided
- [x] 3.2 Confirm `messages-sync.controller.ts` `GET /messages/sync` continues to accept the existing `since`, `cursor`, `limit` shape with no signature change
- [x] 3.3 Add Mongoose compound index `(conversationId, updatedAt)` in `message.schema.ts` alongside the existing indexes; verify with `db.messages.getIndexes()` in dev
- [x] 3.4 Add controller integration tests covering: existing happy path still works, tombstones are returned for soft-deleted messages, `deletedFor` containing the caller is returned, membership is enforced
- [x] 3.5 Update Swagger description on the sync endpoint to mention tombstones in the response ← (verify: `/messages/sync` matches every scenario in `message-sync-api/spec.md` and the new index is used by `explain()`)

## 4. Phase 2 (cont.) — Mobile Sync Engine

- [x] 4.1 Create `ChatApp/src/services/sync/syncOrchestrator.ts` exposing `syncOnForeground`, `syncOnReconnect`, `syncOnOpen(conversationId)` and an internal `runDelta()` worker that paginates `messagesApi.sync` until `hasMore = false`
- [x] 4.2 Implement freshness window check (default 60 s configurable) reading the global cursor from `syncStateRepository.getCursor('global')` before issuing a sync request
- [x] 4.3 Wire `AppState` change → `syncOnForeground`; wire `socketService.on('connect')` → `syncOnReconnect`; wire ChatScreen mount → conditional `syncOnOpen`
- [x] 4.4 On sync response, apply rows via `messageRepository.upsertMany` inside a single transaction; only advance `syncStateRepository.setCursor('global', now)` after commit
- [x] 4.5 Implement exponential backoff (cap 30 s) for transient sync failures; cancel in-flight retry when a foreground trigger supersedes
- [x] 4.6 Route socket events (`new_message`, `message_ack`, `message_deleted`, `message_reaction`, `message_updated`) through `messageRepository.applySocketEvent`; subscriptions then drive UI
- [x] 4.7 Reconcile optimistic rows: confirm-send transaction merges the temp row into the canonical row (matched by `client_message_id`), removing any duplicate
- [x] 4.8 Migrate the legacy AsyncStorage `lastSyncAt` value into `sync_state.global` on first launch; delete the AsyncStorage key after successful migration ← (verify: every scenario in `message-sync-engine/spec.md` is exercised, including out-of-order, double-delivery, and the AsyncStorage→SQLite cursor migration)

## 5. Phase 3 — Read-Path Migration (flag-gated)

- [x] 5.1 Add a runtime/build-time `LOCAL_FIRST_SQLITE` flag (read from env / config service) and expose `useLocalFirstFlag()` hook
- [x] 5.2 Refactor `ChatApp/src/screens/chat/hooks/useMessages.ts` to read from `messageRepository` + subscription when the flag is on; keep the legacy MMKV+REST path under an `else` branch
- [x] 5.3 Move `sendMessage` / `sendMediaMessage` / `confirmMediaMessage` / `deleteMessage` / `reactToMessage` / `deleteForMe` to repository writes (still calling the same REST endpoints; repository handles optimistic + reconcile)
- [x] 5.4 Refactor `ChatApp/src/screens/main/ConversationListScreen.tsx` to read from `conversationRepository` + subscription when the flag is on. Replace the current `useFocusEffect` REST reset with: read from SQLite first, fire background sync if cursor stale
- [x] 5.5 Refactor `ChatApp/src/hooks/useMessageSync.ts` to write pulled messages into `messageRepository.upsertMany` and read/write the cursor from `syncStateRepository` when the flag is on
- [x] 5.6 Implement first-launch backfill `ChatApp/src/services/db/backfillFromMmkv.ts`: reads every key from the legacy MMKV `message-cache`, upserts into SQLite, deletes MMKV payload, sets `backfill_done` row
- [x] 5.7 Run backfill once after DB init when `backfill_done` is missing and the flag is on; on failure, log and continue boot
- [x] 5.8 Add a Storage section to the existing `ChatApp/src/screens/main/SettingsScreen.tsx` (do not create a new screen) showing media cap, used bytes, "Clear cache" button, using the existing `KoolaSurface`/`KoolaButton`/`KoolaText` components
- [x] 5.9 Add internal dogfooding metrics: log first-paint duration, sync error rate, backfill success/fail counts (use existing logger; no new telemetry deps) ← (verify: all `message-store-sqlite` MODIFIED-equivalent scenarios pass on a real device with the flag on)

## 6. Phase 3 (cont.) — Media Cache Enhancements

- [x] 6.1 Make `CACHE_CAP_BYTES` configurable: read from MMKV settings, fall back to 5 GB default; clamp 1 GB ≤ cap ≤ 20 GB
- [x] 6.2 Wire the Storage row in SettingsScreen to update the cap and trigger an immediate `evictIfNeeded(newCap)` if usage exceeds the new value
- [x] 6.3 Implement socket-driven preloader: subscribe to `new_message` events; for image/video media not yet cached, enqueue a low-priority download via `mediaCacheService.getOrDownload` with a small concurrency cap
- [x] 6.4 Respect a data-saver toggle (new setting) by skipping preload when on metered connection / data saver enabled
- [x] 6.5 Add unit tests for cap-change eviction and for preloader skip-on-data-saver ← (verify: every ADDED scenario in `media-cache-persistence` spec passes)

## 7. Verification, Rollout, and Cleanup

**Deferred to follow-up** — tasks 7.1–7.5 require human/device action and are tracked in a separate cleanup change. Task 7.6 is the cleanup change itself.

- [ ] 7.1 Run `gitnexus_impact` on every symbol touched in Phases 1–3 before each commit; record the report in PR descriptions per CLAUDE.md rules
- [ ] 7.2 Run `gitnexus_detect_changes` before each commit; verify scope matches the task being checked off
- [ ] 7.3 Manual QA matrix on Android: cold-start latency, foreground catch-up after 1h offline, send/receive while sync is in flight, logout-login wipe, account switch
- [ ] 7.4 Performance instrumentation review: confirm `messageRepository.list` ≤ 20 ms, ChatScreen first paint ≤ 50 ms warm DB, foreground catch-up ≤ 2 s for typical account
- [ ] 7.5 Stage rollout via feature flag: 5 % → 25 % → 50 % → 100 %; monitor sync error rate and crash rate
- [ ] 7.6 In a follow-up change, delete the legacy `messageCacheService.ts`, the MMKV-backfill task, the AsyncStorage `lastSyncAt` key reads in `useMessageSync` (still keeping the legacy fallback through the rollout), and the `LOCAL_FIRST_SQLITE` flag once the rollout is stable ← (verify: no remaining imports of `messageCacheService`; flag references removed)
