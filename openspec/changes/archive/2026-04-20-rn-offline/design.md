## Context

**Current state**: The chat app has online messaging via REST + WebSocket. When the device goes offline, the socket disconnects and messages fail silently (caught but set to `failed` with no retry). There is no persistence of the offline queue, and no mechanism to fetch missed messages on reconnect.

**Spec source**: `openspec/changes/chat-app/specs/offline-queue/spec.md` — which defines requirements for offline queue, message sync, local storage, optimistic UI, and connectivity monitoring.

**Constraints**: React Native 0.76, `@react-native-async-storage/async-storage` (already installed), `@react-native-community/netinfo` (already installed), no MMKV (would require new dependency).

## Goals / Non-Goals

**Goals:**
- Messages sent offline are queued and delivered when connectivity returns
- Exponential backoff prevents thundering-herd on mass reconnect
- Missed messages are fetched and merged on reconnect (no data loss)
- Sync state persists across app restarts
- Optimistic UI gives immediate feedback for all sends
- Network status is visible to the user at all times

**Non-Goals:**
- E2E encryption (Phase 3)
- Message editing (Phase 3)
- Background message queue processing (messages only retry on app open)
- Offline media upload (queue only text/file reference metadata — actual media must be re-uploaded)

## Decisions

### D1: AsyncStorage for Queue Persistence

Using the existing `@react-native-async-storage/async-storage` instead of MMKV. MMKV would be faster but requires a new native dependency. The queue operations are I/O-bound anyway (network), so AsyncStorage's async overhead is negligible compared to HTTP latency.

**Alternatives**: MMKV (faster but new dependency), Redux-Persist (overkill for this use case).

### D2: Queue lives in a Singleton Service (not React state)

`OfflineQueueService` is a plain class singleton that manages the queue. React hooks (`useOfflineQueue`) subscribe to it via event emitter pattern. This avoids prop drilling and works regardless of which screen the user is on.

**Alternatives**: Context provider (works but more boilerplate), Redux store (overkill).

### D3: Send flow always goes through the queue

`useMessages.sendMessage` checks `isOnline` and either POSTs directly (online) or queues (offline). This unifies the send path — the UI never needs to know the difference.

**Alternatives**: Separate `sendOffline` API (fragile, easy to forget), always queue everything (unnecessary network waste when online).

### D4: Sync runs server→client first, then queue flush

On reconnect: (1) `GET /messages/sync?since=lastSyncAt` to fetch missed messages, (2) POST queued messages. This ensures the server's conversation state is current before sending, preventing potential out-of-order delivery.

**Alternatives**: Queue flush first (could send to stale conversation state), interleaved (complex, no benefit).

### D5: Exponential backoff — `min(2^retryCount * 1000, 30000)` ms, max 5 retries

Formula matches spec exactly. Max delay cap of 30s prevents indefinite waits on persistent failure.

### D6: OfflineBanner is per-screen, not global

Each `ChatScreen` instance renders the banner when offline. `useNetworkStatus` hook exposes `isConnected` as a React state so re-renders are scoped to screens that subscribe.

**Alternatives**: Global toast/banner in App root (would require new navigation-layer component), notification (too intrusive).

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Queue grows unbounded if device is offline for days | Low | Medium | Cap queue at 500 messages; warn user at 200 |
| Media messages queued offline fail on resend (presigned URL expired) | Medium | Low | Clear `mediaUrl` from queued media message; prompt user to re-select on retry |
| Token expires mid-retry-queue flush | Medium | Medium | axios interceptor already handles 401 → refresh; retry queue flush continues after token refresh |
| Duplicate messages if /sync overlaps with queued sends | Low | Medium | Server deduplicates by `clientMessageId`; client dedupes by `_id` on merge |
| App killed during queue flush (partial sends) | Low | Medium | Queue is only removed from AsyncStorage after HTTP 200; interrupted flush resumes on next app open |

## Migration Plan

This is an additive feature — no migration needed.

**Deploy sequence**:
1. Deploy NestJS `GET /messages/sync` endpoint (backward compatible — old RN clients just won't call it)
2. Ship RN offline feature behind feature flag (disabled by default) for internal testing
3. Enable feature flag for all users

**Rollback**: Disable feature flag or revert to previous RN build. No data migration involved.

## Open Questions

All fog points resolved (see `docs/rn-offline-breakdown.md`):
- Backend sync endpoint → included in scope
- Storage → AsyncStorage (already installed)
- Offline banner position → per-screen floating banner
- Queue processing order → sync first, then flush queue
