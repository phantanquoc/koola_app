## Context

`media-cache-persistence` removed the Blurhash flash on conversation list avatars and on images/videos within chat by hydrating an MMKV-backed media-URI index synchronously at app boot. ChatScreen still painted blank for ~500 ms after navigation, however, because `useMessages` started with `messages = []` and only filled it once the REST initial fetch resolved.

GiftedChat then re-rendered with the resulting array, and only then did the screen show content. The chat *header* (avatar, name) painted immediately because that data lives on the conversation list item already, but the body sat white until the network round-trip finished.

The goal of this change is the same as `media-cache-persistence` but for message content: a previously-visited conversation should appear with messages on the first render frame after navigation. The network fetch should still run, both to confirm the cache is up to date and to deliver any messages received while the app was closed.

## Goals / Non-Goals

**Goals:**
- ChatScreen displays messages on the very first render frame after navigation for any conversation visited at least once before in this account.
- The cache survives process restart, OS storage pressure, and system "Clear cache" actions (MMKV is mmap, not OS cache).
- The cache cannot leak across accounts — logout wipes it.
- The existing REST fetch and Socket.IO event handling continue to drive eventual consistency. The cache is a paint-time hint, not a source of truth.

**Non-Goals:**
- Caching pagination state (`nextCursor`). Earlier-than-cached history still loads via REST on demand.
- Encrypting the on-disk cache. MMKV's encryption key option could be added later if needed; no other store in the app encrypts today.
- Caching messages from conversations the user has not opened. The cache is populated as a side effect of `useMessages` running.
- Background prefetch of inactive conversations.

## Decisions

### 1. Reuse MMKV instead of introducing another store

`media-cache-persistence` already pinned `react-native-mmkv@^3.3.3` and proved synchronous mmap reads on the project's New Architecture configuration. A separate MMKV instance (`id: 'message-cache'`) gives namespacing without a second native dependency.

**Alternatives considered**: AsyncStorage (async hydration would re-create the white flash this change exists to remove), SQLite via `op-sqlite` (doubles native footprint and query complexity for a trivially small data shape).

### 2. Synchronous read in `useState` lazy initializer

The cache read MUST happen synchronously before React's first render of ChatScreen, otherwise the cached content paints on frame 2 instead of frame 1 — defeating the purpose. `useState(() => messageCache.read(conversationId))` runs the initializer once per mount, on the render thread, before paint. MMKV's mmap-backed string read finishes in well under one millisecond at the cap chosen below.

**Alternatives considered**: A `useEffect` that sets state on mount (always paints frame 1 with `[]` first, then re-renders — exactly the failure mode this change fixes).

### 3. 50-message head cap per conversation

ChatScreen's initial REST page is 20 messages; loading earlier appends. The first user-visible render only needs the head of the conversation. Caching 50 gives some buffer for back-scrolling without re-fetch and bounds storage growth: even with 1,000 active conversations and 1 KB/message, the worst-case cache is ~50 MB — comfortably within MMKV's design envelope.

**Alternatives considered**: Caching everything `useMessages` ever holds (would grow without bound across long-lived conversations), or caching just 20 (would force a re-fetch on any modest back-scroll, producing a visible "loading earlier" spinner where the cache could have served).

### 4. Skip optimistic / pending messages on write

Optimistic messages have client-only `_id`s that mutate when the server acknowledgment arrives (`temp_<uuid>` → server `_id`). Persisting them would either (a) cause duplicate IDs on the next mount when the server-acked version arrives or (b) require a reconciliation step. Filtering them at write time is simpler and the cost — losing one frame's worth of "optimistic state" if the user kills the app mid-send — is acceptable.

### 5. Debounced write (500 ms)

`useMessages` mutates the array on every reaction toggle, ack, and edit. Writing on every change would flood MMKV with redundant snapshots during typing or rapid scrolling. A 500 ms trailing debounce coalesces bursts into one write and still persists fast enough that even a user who immediately backgrounds the app gets up-to-date cache.

**Alternatives considered**: Persist on every mutation (write storm), persist only on unmount (loses recent messages if the OS kills the process), persist on `AppState` change (more code to wire and the user backgrounds the app constantly during normal use).

### 6. Date rehydration on read

`IMessage.createdAt` is a `Date`. JSON converts it to a string. GiftedChat calls methods on the value as if it were a `Date`, so `read()` walks the parsed array and rebuilds each `createdAt` via `new Date(...)`. Other fields (reactions, media metadata, IDs) are JSON-friendly and need no special handling.

### 7. Logout integration

`AuthContext.logout()` already clears AsyncStorage. Adding `messageCache.clearAll()` in the same `finally` block ensures a switching-accounts user never sees the previous user's chat history. The call is synchronous and cannot fail in a way that should block logout.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Cache served on mount is stale (user received messages on another device) | The existing REST fetch still runs on every mount and overwrites the array on success. Worst case the user sees stale content for ~300 ms before refresh. |
| MMKV instance ID collision with another store added later | Use the explicit ID `message-cache`; document it alongside the existing `media-index` instance. |
| Optimistic message lost if app dies mid-send | Acceptable. The OfflineQueueService persists the *outbound API call* separately, which is the durable path. |
| Cache JSON parse fails (corruption) | `read()` returns `[]` on any parse error; the screen falls back to the network fetch path. |
| Logout race: a chat screen still mounted when `clearAll()` runs | Acceptable. The next mount re-reads (and finds it empty) and fetches from REST. No user-visible regression beyond the half-second the cache was supposed to save. |
| MMKV write blocks the JS thread during burst | Debounce (§5) keeps writes infrequent; even an uncoalesced write of 50 IMessage objects serializes in well under one millisecond. |

## Migration Plan

No migration needed. On first launch after this change ships:

1. The MMKV `message-cache` instance is empty.
2. The first time the user opens any conversation, `useMessages` reads `[]` from cache, the REST fetch runs as before, and the resulting array is written to MMKV.
3. The next time the same conversation is opened, the cache hit is served on frame 1.

**Rollback**: revert the commit. The MMKV `message-cache` instance is left on disk but harmless — no other code reads it. A follow-up `mmkv.clearAll()` could be added to a chore commit if needed.

## Open Questions

- **Should the cache also persist `hasEarlier` and the next cursor?** Decision deferred. Doing so would skip one round-trip when the user scrolls up immediately after opening a conversation, but adds reconciliation logic when the cached cursor disagrees with the live conversation. Not worth it for v1.
- **Should `messageCache.clearAll()` also run after a force-logout (token revoked server-side)?** Today the force-logout path goes through `AuthContext.logout()`, so yes. If a future code path bypasses `logout()`, the cache would persist; document that as a constraint on future force-logout work.
