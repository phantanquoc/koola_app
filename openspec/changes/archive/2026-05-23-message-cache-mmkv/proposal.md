## Why

Entering a previously-visited conversation showed a blank white area for ~500 ms while `useMessages` fetched the first page over REST. The earlier `media-cache-persistence` change made avatars and image/video bodies appear instantly, but the *messages themselves* still arrived from the network — leaving an empty chat for half a second before content painted.

That delay broke the perceived "Telegram/Zalo" experience the media cache was meant to deliver. The fix is to cache the head of every conversation in MMKV (the same store already proven by `media-cache-persistence`) and serve it synchronously on the first render frame after navigation, while the existing REST fetch continues to run in the background as a refresh.

## What Changes

- **NEW capability** `message-cache`: persistent MMKV-backed cache of recent chat messages, keyed by `conversationId`, capped at 50 head messages per conversation.
- New service `ChatApp/src/services/messageCacheService.ts` exposing `read`, `write`, `clear`, `clearAll`. Reads are synchronous (mmap-backed); writes serialize the array to JSON.
- `useMessages` reads the cache synchronously inside both `useState` lazy initializers (messages and `isInitialLoading`), so a cache hit paints content on the very first frame and skips the loading state entirely. The initial-fetch effect no longer wipes the array to `[]` up front (which had been the source of the white flash).
- `useMessages` debounces a `useEffect` that persists the messages array back to MMKV (500 ms) on every change, so bursts (typing acks, reaction toggles) collapse into a single write.
- Optimistic / pending messages (`_id` starts with `temp_` or `pending: true`) are filtered out of the persisted slice to avoid duplicate IDs once the server ack arrives.
- `IMessage.createdAt` is rehydrated as a `Date` on read (JSON only stores strings).
- `AuthContext.logout()` calls `messageCache.clearAll()` after `asyncStorage.clearAll()` so a different account never inherits the previous user's chat history.

## Capabilities

### New Capabilities
- `message-cache`: synchronous, MMKV-backed cache of recent chat messages so ChatScreen paints messages on the first render frame after navigation.

### Modified Capabilities
<!-- None — the public API of useMessages is unchanged; consumers (ChatScreen) need no modifications. -->

## Impact

**Affected code (ChatApp only — no backend changes):**
- New: `ChatApp/src/services/messageCacheService.ts`
- Modified: `ChatApp/src/screens/chat/hooks/useMessages.ts`
- Modified: `ChatApp/src/contexts/AuthContext.tsx` (logout integration)

**Dependencies:**
- Reuses the `react-native-mmkv@^3.3.3` already added by the `media-cache-persistence` change. No new dependencies.

**Out of scope:**
- Caching the per-conversation cursor for `loadEarlier`. Older history continues to come from REST on demand.
- Cross-account isolation beyond `clearAll()` on logout (e.g. per-user namespacing).
- Encryption of the message cache. MMKV supports an encryption key but no other store in the app currently encrypts; out of scope here.
- A cache-size or TTL eviction policy. The 50-message head cap per conversation is sufficient at current usage; a global eviction strategy can be added later if storage becomes a concern.

**Not affected (API preserved):**
- `ChatScreen.tsx`, all message rendering components, all socket handlers.
- `chat-backend/` — no backend changes whatsoever.
