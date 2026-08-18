## Context

ChatHome uses `createMaterialTopTabNavigator` with 5 sub-tabs (Messages, Contacts, Moments, Calls, Xem trước). Calls is a global history list (`GET /call-logs`) rendered by `CallsScreen`. Real call initiation already lives in `ChatScreen/ChatHeader` via `useCallInitiation` → `webrtcService.initiateCall`. The request is to make Calls contextual to each conversation (Zalo/FB model) and reclaim the sub-tab slot.

Constraints: audio/video calling must not regress. WebRTC signaling (`/webrtc` namespace), `WebRTCService` state machine, `CallScreen`/`IncomingCallScreen` modals, and FCM offline push must remain untouched.

## Goals / Non-Goals

**Goals:**
- Remove Calls from `ChatSubTabParamList` and `ChatHomeScreen` (5→4 tabs).
- Provide per-conversation call history filtered by `conversationId` via `GET /call-logs?conversationId=xxx`.
- Add quick-call button on direct conversation rows.
- Expose per-conversation history via BottomSheet from GroupInfo/Profile (and optionally ChatHeader).
- Delete `CallsScreen.tsx`.

**Non-Goals:**
- No changes to WebRTC signaling, peer connection, ICE, or FCM push.
- No group-call implementation (existing "Gọi nhóm đang phát triển" toast preserved).
- No system-message injection for call events in this change (follow-up if desired).
- No bottom-tab changes.

## Decisions

### D1 — Remove Calls from ChatHome (not hide)
**Decision:** Delete entry from `ChatSubTabParamList`, `SUB_TAB_META`, `TopTab.Screen`, `SHELL_TAB_KEYS`, and unread map.
**Rationale:** A hidden tab still participates in swipe and state; deletion is the only way to reclaim layout and remove deep-link surface.
**Alternative:** `tabBar: () => null` or `swipeEnabled: false` — rejected, leaves dead code and gesture ambiguity.

### D2 — Backend filter param
**Decision:** Add optional `conversationId?: string` to `QueryCallLogsDto` (`@IsOptional @IsMongoId`), filter in `callLogsService.getCallHistory` via `{ $and: [orFilter, { conversationId }] }` when present.
**Rationale:** Server-filtered pagination is correct; client-filter would break paging and waste bandwidth. Optional param keeps backward compat.
**Alternative:** New endpoint `GET /conversations/:id/call-logs` — rejected, duplicates pagination logic and auth checks.

### D3 — Per-conversation sheet component
**Decision:** New `ConversationCallHistorySheet.tsx` (BottomSheetModal) reusing `CallsScreen` rendering (status icon/color/label, duration, relative time, call-back). Props: `conversationId`, `isVisible`, `onClose`. Calls `callLogsApi.getHistory({ conversationId, page, limit })`.
**Rationale:** BottomSheet matches existing `PinListBottomSheet`/`AddMemberModal` pattern; keeps history contextual without a full screen.
**Alternative:** Full screen in ChatTabStack — rejected, heavier navigation and tab-dock suppression.

### D4 — Quick-call on list rows
**Decision:** `ConversationListItem` gains trailing `KoolaIconButton icon="call" size 36` visible only when `conversation.type === 'direct'` and `otherUserId` resolvable. Handler resolves `otherUserId` same as `resolveConversationHeader`, checks `webrtcService.isConnected()`, then follows `useCallInitiation` pattern (or delegates to shared helper).
**Rationale:** Mirrors Zalo row affordance; 36dp matches header icon density without crowding timestamp/unread.
**Alternative:** Swipe-to-call — rejected, requires gesture handler and conflicts with scroll.

### D5 — CallScreen/WebRTC untouched
**Decision:** No edits to `WebRTCService`, `webrtc.gateway`, `CallScreen`, `IncomingCallScreen`, or FCM services.
**Rationale:** These are high-risk, hard-to-reproduce paths. Call correctness is proven on device; any change risks audio-one-way or missed-offer bugs.

## Risks / Trade-offs

- **Stale Calls deep-link** → Mitigation: remove type entry so `navigate('Calls')` fails at compile time; no runtime deep-link exists.
- **Group conversations have no single callee** → Mitigation: hide quick-call button for `type === 'group'`; sheet still shows group call logs if any exist.
- **Existing global history users lose aggregated view** → Mitigation: per-conversation sheets cover the Zalo model; aggregated view can be restored via a future "Recent calls" entry if needed (out of scope).
- **Pagination with filter returns fewer items per page** → Mitigation: server filter keeps `total` accurate; sheet implements same `onEndReached` as before.

## Migration Plan

1. Backend: add `conversationId` to DTO/service/controller; deploy (backward compat).
2. Mobile: remove Calls sub-tab, add sheet + quick-call, delete `CallsScreen`.
3. Verify: `tsc --noEmit` both ends, `jest` (call-logs, webrtc), manual 2-device audio/video calls + per-conversation history.
4. Rollback: revert DTO/service filter and restore `CallsScreen` + nav entries; no DB migration.

## Open Questions

- Should missed-call badges appear on `ConversationListItem` (red name like CallsScreen)? Deferred — existing `unreadCount` already highlights.
