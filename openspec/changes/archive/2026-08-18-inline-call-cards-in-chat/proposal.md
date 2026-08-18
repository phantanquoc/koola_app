## Why

After `merge-calls-into-chat`, call history lives only in per-conversation BottomSheets (GroupInfo/Profile). Inside ChatScreen — where Zalo shows call cards inline ("Cuộc gọi video đi 22 phút 1 giây — GỌI LẠI", "Bạn bị nhỡ", etc.) — the timeline shows only text. Users expect calls to appear as cards interleaved with messages, exactly like Zalo in the screenshot.

## What Changes

- Keep existing per-conversation BottomSheets (+ quick-call on list) from `merge-calls-into-chat`.
- Add inline call cards inside `ChatScreen` timeline: fetch `GET /call-logs?conversationId` and merge with `visibleMessages` by timestamp (newest-first, matching GiftedChat), rendered as a centered card with call direction/status, duration, timestamp, and "GỌI LẠI" button.
- New `CallMessageCard` component (reuses `getStatusInfo`/`formatDuration`/`formatRelativeTimestamp` from the sheet) that calls `webrtcService.initiateCall` with the same settled/cleanup/timeout pattern as the sheet/quick-call.
- New `useInlineCallLogs(conversationId)` hook owning fetch/pagination/refresh; no backend changes (filter already added in prior change).

## Capabilities

### New Capabilities
- `inline-call-cards`: Inline call history cards inside ChatScreen, merged chronologically with messages, with call-back action.

### Modified Capabilities
- `per-conversation-call-history`: Requirement extended — history is now visible both inline (ChatScreen) and via sheet (GroupInfo/Profile); sheet remains but is no longer the only surface.

## Impact

- **Mobile**: `ChatApp/src/screens/chat/ChatScreen.tsx` (merge & render), new `ChatApp/src/screens/chat/components/CallMessageCard.tsx`, new `ChatApp/src/screens/chat/hooks/useInlineCallLogs.ts`, uses existing `callLogsApi.getHistory`.
- **Backend**: None (reuses `GET /call-logs?conversationId` from prior change).
- **WebRTC**: Not touched (only consumer `webrtcService.initiateCall`).
