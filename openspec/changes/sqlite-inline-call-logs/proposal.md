## Why

ChatScreen shows text messages instantly from SQLite (`useMessagesFromDb` reads synchronously in the `useState` initializer, 0ms network) but inline call cards (`CallMessageCard` via `useInlineCallLogs`) start from an empty array and fetch `GET /call-logs?conversationId` over REST. The result is a visible pop-in: messages appear on the first frame, call boxes appear 80-300ms later after the network round-trip, and the `displayedMessages` merge only runs on the second render. Offline, call history is invisible even though the conversation has cached messages.

## What Changes

- Add a local SQLite `call_logs` store that mirrors the backend `CallLog` documents, making it the canonical read source for inline call cards on the hot path.
- Make `useInlineCallLogs` SQLite-first: synchronous `list()` in the `useState` initializer for instant first-frame render, reactive subscription for changes, background sync for freshness. Remove REST from the critical render path.
- Route realtime call termination events into SQLite via `socketEventRouter` so a call that ends while the user is inside the conversation appears immediately without a refetch.
- Add a background sync (`syncCallLogsOnOpen`) that fetches `GET /call-logs?conversationId` off the critical path, upserts into SQLite, and notifies subscribers incrementally (no pop-in).
- Keep the chronological merge in `ChatScreen.displayedMessages` unchanged, but it now receives `callLogs` synchronously on mount.
- Optionally warm the SQLite cache from `ConversationListScreen` (prefetch top conversations fire-and-forget into SQLite, off the UI path).
- Verify/patch backend socket emits for call logs if missing (emit `call_log_created`/`call_log_updated` to `conv:<id>` room).

## Capabilities

### New Capabilities
- `call-log-sqlite-store`: On-device SQLite persistence for call logs (table, indexes, repository, reactive subscriptions, retention wiring) that is the canonical read source for ChatScreen's inline timeline.

### Modified Capabilities
- `inline-call-cards`: Change read path from direct REST fetch on mount to SQLite-first instant read + background sync; add realtime insertion via socket→SQLite.
- `call-logs`: No REST contract change (`GET /call-logs` stays), but add requirement that call termination creates/updates are emitted over socket to the conversation room so offline-first clients can stay consistent.
- `message-store-sqlite`: Extend the local database scope to include the new `call_logs` table and its migration (schema version bump).

## Impact

- Mobile: new `callLogRepository.ts`, `dbInit`/`migrations` schema bump, `socketEventRouter` wiring, `syncOrchestrator` extension, rewrite of `useInlineCallLogs`, optional `ConversationListScreen` warm.
- Backend (conditional): one socket emit in `call-logs`/`webrtc` flow if not already present; no API shape change.
- No breaking changes to `GET /call-logs` or GiftedChat rendering contract.
- Performance: list queries on `(conversation_id, started_at DESC)` with LIMIT; realtime path ≤5ms via `applySocketEvent`-style handler; first-frame render no longer waits on network.
