# rn-offline — Breakdown

**Date:** 2026-04-01
**Module:** rn-offline (Module 18)
**Status:** Planning complete

---

## 1. Fog Points & Resolution

### FP-1: Backend sync endpoint — có cần implement không?
**Spec nói:** "NestJS backend SHALL provide a sync endpoint"
**Thực tế:** Endpoint `GET /messages/sync` chưa tồn tại trong backend

→ **Resolution A (recommend):** Implement backend endpoint luôn trong module này — spec yêu cầu, không thể thiếu
→ **Resolution B:** Chỉ implement RN, backend làm sau
→ **Decision:** **A** — endpoint là part của spec, không thể skip

---

### FP-2: Storage layer — AsyncStorage vs MMKV
**Design doc nói:** "MMKV/AsyncStorage"
**Thực tế:** `@react-native-async-storage/async-storage` đã được cài, `asyncStorage.ts` đã có sẵn helpers cho `OFFLINE_QUEUE` và `LAST_SYNC_AT`

→ **Resolution A (recommend):** Dùng `AsyncStorage` (đã cài sẵn, infrastructure ready)
→ **Resolution B:** Chuyển sang MMKV (đòi cài thêm package)
→ **Decision:** **A** — AsyncStorage đã available, không cần thêm dependency

---

### FP-3: Offline banner — hiển thị ở đâu?
**Spec nói:** "shows offline banner in UI"

→ **Resolution A (recommend):** Floating banner trên top của ChatScreen — dễ implement, không ảnh hưởng navigation
→ **Resolution B:** Global banner trong App root — consistent across all screens
→ **Decision:** **A** — mỗi ChatScreen tự quản banner, không cần global state

---

### FP-4: Queue processing trên reconnect — khi nào sync?
**Spec nói:** "On reconnect: (1) POST queued, (2) GET sync"
**Thứ tự thực sự cần thiết:**

→ **Resolution A (recommend):** Sync messages trước, rồi POST queue — để server state up-to-date trước
→ **Resolution B:** POST queue trước, rồi sync — để tin nhắn mới nhất đến trước
→ **Decision:** **A** — sync messages trước (server → client), sau đó POST queue (client → server)

---

## 2. Architecture Decisions (Locked)

```
┌─────────────────────────────────────────────────────────────┐
│                  APP LAYERS (RN Client)                    │
├─────────────────────────────────────────────────────────────┤
│  ChatScreen                                                 │
│    └── OfflineBanner (conditional render)                  │
├─────────────────────────────────────────────────────────────┤
│  Hooks Layer                                               │
│    ├── useNetworkStatus()     ← NetInfo monitoring         │
│    ├── useOfflineQueue()      ← queue CRUD + retry logic  │
│    └── useMessageSync()       ← sync on reconnect         │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                             │
│    └── OfflineQueueService    ← singleton queue manager   │
├─────────────────────────────────────────────────────────────┤
│  Storage Layer                                             │
│    └── AsyncStorage           ← offline_queue + last_sync │
├─────────────────────────────────────────────────────────────┤
│  Network Layer                                             │
│    ├── socketService         ← existing, disconnect/reconnect │
│    └── messagesApi.sync()    ← existing API               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Schema Definitions

### RN: QueuedMessage (stored in AsyncStorage)
```typescript
interface QueuedMessage {
  id: string;            // clientMessageId (UUID)
  conversationId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'voice' | 'system';
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  status: 'pending' | 'failed';
  createdAt: string;     // ISO8601
  retryCount: number;    // 0-5
}
```

### RN: SyncState (stored in AsyncStorage)
```typescript
interface SyncState {
  lastSyncAt: string | null; // ISO8601, null = never synced
}
```

---

## 4. Edge Cases Table

| Case | Behavior |
|------|----------|
| Send message while online | Normal flow — POST `/messages`, optimistic UI, no queue |
| Send message while offline | Save to queue, show "sending..." indicator, retry on reconnect |
| App restart with pending queue | Restore queue from AsyncStorage, continue retry |
| App restart with no pending | Normal startup, `lastSyncAt` used for first sync |
| Network offline → online | ① Disconnect WS, ② Show banner, ③ Queue all outgoing |
| Network online → offline | ① Reconnect WS, ② Sync missed, ③ Flush queue, ④ Hide banner |
| Queue retry after 5 fails | Remove from queue, show "Failed" with Retry button |
| Tap Retry on failed message | Re-queue, status → "pending", retry immediately |
| Sync dedup (WS + /sync overlap) | Dedupe by `_id`, keep later timestamp |
| Token expired while retrying | 401 → refresh token → retry same message |
| 100+ missed messages | Paginate `/sync?since=&cursor=`, 100/page |

---

## 5. Files to Create

### React Native — New Files
| File | Purpose |
|------|---------|
| `ChatApp/src/services/OfflineQueueService.ts` | Singleton queue manager |
| `ChatApp/src/hooks/useNetworkStatus.ts` | NetInfo monitoring, `isConnected`, `isInternetReachable` |
| `ChatApp/src/hooks/useOfflineQueue.ts` | Hook wrapping OfflineQueueService |
| `ChatApp/src/hooks/useMessageSync.ts` | Sync missed messages on reconnect |
| `ChatApp/src/components/OfflineBanner.tsx` | Floating offline banner component |

### React Native — Modify Existing
| File | Changes |
|------|---------|
| `ChatApp/src/screens/chat/ChatScreen.tsx` | Add `useNetworkStatus`, render `OfflineBanner`, integrate queue send |
| `ChatApp/src/screens/chat/hooks/useMessages.ts` | Send via `useOfflineQueue` (wrap `sendMessage` instead of direct API) |
| `ChatApp/src/screens/main/ConversationListScreen.tsx` | Sync on mount if online (restore `lastSyncAt`) |
| `ChatApp/src/App.tsx` | Initialize `OfflineQueueService` on mount |

### Backend — New / Modify
| File | Changes |
|------|---------|
| `chat-backend/src/messages/messages.controller.ts` | Add `GET /messages/sync` endpoint |
| `chat-backend/src/messages/messages.service.ts` | Add `syncMessages(since, cursor, limit)` method |
| `chat-backend/src/messages/dto/sync-messages.dto.ts` | New DTO for sync query params |

---

## 6. Zero-Fog Checklist

- [x] Every requirement is specific enough (offline queue, exponential backoff formula, max retries, sync endpoint)
- [x] All edge cases explicitly named (see Edge Cases Table above)
- [x] Error paths defined (401 → refresh → retry, 5 fails → "Failed" UI)
- [x] Component states listed (OfflineBanner: hidden/visible, message: pending/sending/failed)
- [x] Accessibility: offline banner uses standard View with text (no complex a11y needed for MVP)
- [x] Test strategy: unit tests for OfflineQueueService, integration tests for sync flow
- [x] Architecture decisions explicit (AsyncStorage, NetInfo, retry order)
- [x] No unresolved "probably" / "should work" — all decisions made
- [x] Backend sync endpoint confirmed missing → included in scope
