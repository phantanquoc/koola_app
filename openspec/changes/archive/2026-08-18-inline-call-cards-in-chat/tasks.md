## 1. Hook for inline call logs

- [x] 1.1 Create `ChatApp/src/screens/chat/hooks/useInlineCallLogs.ts` — `useInlineCallLogs(conversationId)` fetching `callLogsApi.getHistory({ conversationId, page:1, limit:50 })` on mount/focus, exposing `callLogs`, `loading`, `refresh`, `hasMore`/`loadMore` if needed
- [x] 1.2 Add `callLogsApi.getHistory` usage if not yet exported (reuses prior change's helper) and ensure `CallLogEntry` type is importable from `apiService`

## 2. Call card component

- [x] 2.1 Create `ChatApp/src/screens/chat/components/CallMessageCard.tsx` — centered card (white, rounded 12, shadow/hairline, padding 14) with top line (status icon + "Bạn bị nhỡ" red / "Cuộc gọi đi/đến" + duration via `formatDuration` + timestamp via `formatRelativeTimestamp`), divider, and "GỌI LẠI" (primary, tappable) reusing sheet's `getStatusInfo` styling; props: `entry: CallLogEntry`, `currentUserId`, `conversationId`, `onCallAgain`
- [x] 2.2 Implement `handleCallAgain` inside card or via shared helper: resolve `otherUserId` (initiator/target flip), check `webrtcService.isConnected()` → Alert "Chưa kết nối", else `webrtcService.initiateCall` with settled/cleanup/15s timeout → `CallModal` (reuse sheet/quick-call pattern); group guard → toast "Gọi nhóm đang phát triển" if needed

## 3. ChatScreen integration — merge timeline

- [x] 3.1 Update `ChatApp/src/screens/chat/ChatScreen.tsx` — import `useInlineCallLogs` + `CallMessageCard`, call hook with `conversationId`, merge `messages` (IMessage) and `callLogs` into `timeline` sorted by `createdAt/startedAt` desc (newest-first for GiftedChat), where call items are distinguished by `_id: "call:<sessionId>"` and custom `__callEntry` marker
- [x] 3.2 Extend `renderMessage` to branch: if `currentMessage.__callEntry` then render `CallMessageCard` centered (no avatar/bubble), else render `MessageItem` as before; ensure `messageStyles` memo and comparator do not treat call cards as failed/pending; handle `failed` retry not needed for call cards ← (verify: inline cards appear interleaved correctly, "GỌI LẠI" initiates call, no regression to text/media/failed messages, GiftedChat still paginates)

## 4. Tests and verification

- [x] 4.1 `npx tsc --noEmit` in `ChatApp` zero errors for new files and `ChatScreen` merge; `npx jest` relevant suites green ← (verify: type-safe merge, no `any` leak, callLogs typing matches backend)
- [ ] 4.2 Manual smoke: 1-1 chat shows inline cards ("Bạn bị nhỡ" red, "Cuộc gọi đi 22p1s" with GỌI LẠI), tap GỌI LẠI starts audio/video call; group inline card handles guard; sheet still works; no WebRTC regression
