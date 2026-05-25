## Why

APP_KOOLA mobile currently treats the backend as the source of truth for chat history and uses MMKV as a 50-message paint-time hint. Every conversation entry costs a REST round-trip (200–800 ms observed in production logs, up to ~1 s on slow conversations) and any history older than the cached head requires a network call. Industry-standard chat apps (Zalo, Telegram, WhatsApp, WeChat, Discord, Messenger) are local-first: SQLite holds the canonical message history on-device and the network is reduced to delta sync plus real-time push. This is the only architecture that delivers <20 ms conversation open and offline-capable history scrolling at scale.

The MMKV cache + 15 s TTL skip-REST shortcut shipped earlier removes the *redundant* refetch but cannot remove the *first* fetch, the *cold-start* fetch, or the *load-earlier* fetch. To close the perceived performance gap with Zalo/Telegram we need to move from "REST with cache" to "SQLite with sync".

## What Changes

- **NEW** local SQLite database on mobile (`koola.db`) holds the canonical copy of messages, conversations, and a global sync cursor. Reads on the hot path (`useMessages`, `ConversationListScreen`) query SQLite synchronously via JSI, never the network.
- **NEW** sync orchestrator service on mobile coordinates delta fetches, building on the existing `useMessageSync` global-since hook. Triggered on app foreground, socket reconnect, and conversation open when the local data is stale beyond a configurable horizon. The legacy `lastSyncAt` value in AsyncStorage is migrated into SQLite `sync_state` on first launch.
- **EXTENDED** existing backend endpoint `GET /messages/sync` (`messages-sync.controller.ts`) — keep the current global-since semantics; add a tombstone projection for soft-deleted messages so clients can converge their local copy. No new endpoint is created. The cursor-paginated `GET /conversations/:id/messages` is preserved unchanged for load-earlier.
- **MODIFIED** `useMessages` hook reads from the SQLite repository instead of REST + MMKV; socket events insert/update SQLite rows which then drive React state via reactive subscription. The MMKV message cache is retired once SQLite is the read path. **BREAKING** for downstream code that imports `messageCacheService` directly (only `useMessages` and `AuthContext.logout` today).
- **MODIFIED** media cache: raise default cap from 1 GB to a configurable 5 GB exposed as a new row inside the existing `SettingsScreen`, and add a socket-driven preloader that downloads incoming media on receipt instead of on first paint. The MMKV-backed `mediaIndexService` continues unchanged as the in-memory index.
- **MIGRATION** one-time backfill from existing MMKV `message-cache` entries plus the `lastSyncAt` AsyncStorage value into SQLite on first launch after upgrade so users keep their visible 50-message head and global sync cursor; MMKV cache and AsyncStorage `lastSyncAt` are then deleted. No backend migration; the canonical store has always been MongoDB.
- **OUT OF SCOPE (deferred)** SQLite FTS5 search will be addressed in a follow-up change `local-first-sqlite-search`. Schema is designed so that future work does not require a destructive migration.
- **OUT OF SCOPE (deferred)** Reworking `OfflineQueueService` to share its persistence with SQLite. Current behaviour (AsyncStorage queue, parallel to `useMessages.sendMessage`) is preserved; tracked as tech debt for a separate change.

## Capabilities

### New Capabilities

- `message-store-sqlite`: on-device SQLite database of messages and conversations that is the canonical local read source for chat UI; defines schema, repository API, and reactive subscriptions.
- `message-sync-engine`: orchestrator that drives delta sync between local SQLite and the backend, including foreground sync, reconnect sync, the global sync cursor, and idempotent socket-event insertion.

### Modified Capabilities

- `message-sync-api`: existing `GET /messages/sync` endpoint gains tombstone projection for soft-deleted messages and an additional Mongoose index on `(conversationId, updatedAt)` to keep the delta query off `createdAt`-based collection scans. Existing semantics (global-since, cursor pagination, per-user authorization) are preserved.
- `message-cache`: role narrows to a transitional read-through helper during migration only; once `message-store-sqlite` ships and the backfill completes, this capability is retired and its requirements are deleted in a follow-up change.
- `media-cache-persistence`: default cap raised from 1 GB to 5 GB and made configurable from `SettingsScreen`; a new requirement covers socket-driven media preloading.

## Impact

- **Mobile (`ChatApp/`):**
  - New native dependency: a SQLite binding (decision in `design.md`, candidates: `op-sqlite`, `WatermelonDB`, `expo-sqlite`).
  - New module: `ChatApp/src/services/db/` (database init, schema, migrations, repositories).
  - New module: `ChatApp/src/services/sync/` (sync orchestrator, conflict resolution, socket-to-DB adapter).
  - Refactor: `ChatApp/src/screens/chat/hooks/useMessages.ts` switches read path from MMKV+REST to SQLite repository; socket handlers write SQLite first.
  - Refactor: `ChatApp/src/screens/main/ConversationListScreen.tsx` reads from SQLite repository.
  - Refactor: `ChatApp/src/hooks/useMessageSync.ts` writes pulled messages into the SQLite repository instead of returning them in-memory; reads `lastSyncAt` from SQLite `sync_state` once migration is complete.
  - Retired (after backfill): `ChatApp/src/services/messageCacheService.ts`.
  - Settings: extend the existing `ChatApp/src/screens/main/SettingsScreen.tsx` with a Storage section (media cap slider, total used, Clear cache).
  - Jest infrastructure: configure `jest-preset` for React Native with native mocks before any repository unit tests can run (current ChatApp Jest is installed but unconfigured).
- **Backend (`chat-backend/`):**
  - `messages-sync.controller.ts`: extend response to include tombstones; signature unchanged.
  - `messages.service.ts` `syncMessages`: include soft-deleted messages whose `updatedAt >= since` in the result set, with content fields optionally elided to reduce payload.
  - Mongoose: add compound index on `(conversationId, updatedAt)` so delta queries do not collide with the existing `(conversationId, createdAt DESC)` index.
- **High-risk areas touched (per CLAUDE.md):**
  - `chat.gateway.ts` — read-only consumption of existing events; no schema change.
  - `AuthContext.tsx` — login/restore extended to call `db.init(userId)` after `setUser`; logout extended to wipe SQLite alongside the existing `messageCache.clearAll()`.
  - `OfflineQueueService.ts` — left as-is in this change. Future change to be tracked separately.
- **Migration / rollback:**
  - First launch after upgrade: backfill from MMKV → SQLite + AsyncStorage `lastSyncAt` → SQLite, then mark MMKV stale; MMKV reads remain as fallback for one release in case SQLite init fails on a device, after which the cache is deleted.
  - Feature flag `LOCAL_FIRST_SQLITE` (env / build flag) gates the new read path so the team can ship incrementally and disable in production if a device-level bug appears.
- **Performance targets:**
  - Cold-start conversation open: ≤ 50 ms to first paint with cached data, ≤ 20 ms when DB warm.
  - Conversation list cold-start: ≤ 100 ms to first paint with last-known list.
  - Background sync delta for a typical user (≤ 100 conversations, ≤ 500 new messages): ≤ 2 s on 4G.
- **Out of scope:**
  - End-to-end encryption of the local DB (tracked separately).
  - iOS-only optimisations (project ships Android first; iOS parity follows the same schema).
  - Replacing the MMKV-backed `mediaIndexService` — that capability is orthogonal and already shipped.
  - SQLite FTS5 search and search UI (follow-up change `local-first-sqlite-search`).
  - Reworking `OfflineQueueService` to share SQLite persistence (tracked as separate tech-debt change).
