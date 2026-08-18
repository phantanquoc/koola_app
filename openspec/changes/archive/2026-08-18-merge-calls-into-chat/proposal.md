## Why

The ChatHome sub-tab bar has 5 items including a standalone Calls tab that shows a global call history. Users expect calling to live inside each conversation like Zalo/Facebook — tap a conversation then call — not in a separate aggregated list. The global Calls tab duplicates what the per-conversation context already provides and wastes a top-level navigation slot.

## What Changes

- Remove `Calls` from `ChatSubTabParamList` and `ChatHomeScreen` sub-tab bar (5 → 4 tabs: Messages, Contacts, Moments, Xem trước).
- Delete `ChatApp/src/screens/main/CallsScreen.tsx` (or repurpose its logic into a per-conversation sheet).
- Add per-conversation call history: a `ConversationCallHistorySheet` BottomSheet opened from GroupInfoScreen/ProfileScreen (and optionally from ChatHeader overflow) that fetches `GET /call-logs?conversationId=xxx`.
- Add quick-call affordance in `ConversationListScreen`/`ConversationListItem`: a 36dp phone icon on direct (1:1) rows that initiates audio call without entering the chat.
- Extend `GET /call-logs` with optional `conversationId` filter (DTO + service + controller) so per-conversation history is server-filtered and paginated.
- Ensure WebRTC call lifecycle (audio/video, FCM, gateway) is untouched — `WebRTCService`, `webrtc.gateway`, `CallScreen` modal, and FCM push remain as-is.

## Capabilities

### New Capabilities
- `per-conversation-call-history`: Per-conversation call log viewing (filter by conversationId, paginated BottomSheet, empty/loading/error states, call-back action).

### Modified Capabilities
- `chat-home-navigation-chrome`: ChatHome sub-tab set changes from 5 to 4; Calls entry removed. Spec delta updates tab list and navigation expectations.
- `call-logs`: `GET /call-logs` gains optional `conversationId` query param with validation and server-side filtering; existing global listing remains.
- `conversation-management`: Conversation list rows gain an optional quick-call action for direct conversations.

## Impact

- **Mobile**: `navigation/types.ts`, `screens/main/ChatHomeScreen.tsx`, `screens/main/CallsScreen.tsx` (removed), `components/ConversationListItem.tsx`, `screens/main/ConversationListScreen.tsx`, `screens/main/GroupInfoScreen.tsx`, `screens/main/ProfileScreen.tsx`, new `components/ConversationCallHistorySheet.tsx`, `services/api/apiService.ts` (callLogsApi).
- **Backend**: `call-logs/dto/query-call-logs.dto.ts`, `call-logs/call-logs.service.ts`, `call-logs/call-logs.controller.ts`, tests.
- **Breaking**: None for API (new optional query param). Navigation breaking for any deep-link to `Calls` sub-tab — removed.
