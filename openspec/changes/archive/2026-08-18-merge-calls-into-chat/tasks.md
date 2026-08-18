## 1. Backend — per-conversation call history filter

- [x] 1.1 Extend `chat-backend/src/call-logs/dto/query-call-logs.dto.ts` with optional `conversationId` (`@IsOptional() @IsMongoId()`) and import `IsMongoId`
- [x] 1.2 Update `chat-backend/src/call-logs/call-logs.service.ts` `getCallHistory(userId, page, limit, conversationId?)` to add `conversationId` to filter when present (`{ $and: [{ $or: [...] }, { conversationId }] }`)
- [x] 1.3 Update `chat-backend/src/call-logs/call-logs.controller.ts` to pass `query.conversationId` to service
- [x] 1.4 Add index on `conversationId` if not present in `call-log.schema.ts` (or verify existing compound index covers it)

## 2. Mobile navigation — remove Calls sub-tab

- [x] 2.1 Update `ChatApp/src/navigation/types.ts` — remove `Calls: undefined` from `ChatSubTabParamList`
- [x] 2.2 Update `ChatApp/src/screens/main/ChatHomeScreen.tsx` — remove `Calls` from `SUB_TAB_META`, remove `CallsScreen` import and `<TopTab.Screen name="Calls">`, shrink `SHELL_TAB_KEYS` 5→4, remove `callsUnread` from `unreadByRoute`
- [x] 2.3 Delete `ChatApp/src/screens/main/CallsScreen.tsx` (after extracting reusable call-back logic if needed)
- [x] 2.4 Ensure no remaining `navigate('Calls')` or `ChatSubTabParamList['Calls']` references remain (type-check)

## 3. Mobile — per-conversation call history sheet

- [x] 3.1 Create `ChatApp/src/components/ConversationCallHistorySheet.tsx` (BottomSheetModal) reusing CallsScreen row rendering (getStatusInfo, formatDuration, formatRelativeTimestamp, UserAvatar) with paginated fetch `GET /call-logs?conversationId=xxx&page&limit=20`, loading/footer/empty states, and call-back handler (webrtcService pattern) ← (verify: sheet fetches filtered logs, paginates, renders status/duration, call-back navigates to CallModal)
- [x] 3.2 Add `callLogsApi` helper in `ChatApp/src/services/api/apiService.ts` for `getHistory({ page, limit, conversationId? })` if not already present

## 4. Mobile — info screens entry points

- [x] 4.1 Update `ChatApp/src/screens/main/GroupInfoScreen.tsx` — add "Lịch sử cuộc gọi" row (icon `phone` + chevron) that opens `ConversationCallHistorySheet` with `conversationId`
- [x] 4.2 Update `ChatApp/src/screens/main/ProfileScreen.tsx` — resolve direct `conversationId` (via `conversationsApi.startDirectChat` or cached lookup) and add same "Lịch sử cuộc gọi" entry that opens the sheet (handle no-conversation-yet empty internally)

## 5. Mobile — quick-call on conversation list

- [x] 5.1 Update `ChatApp/src/components/ConversationListItem.tsx` — add trailing `KoolaIconButton` (36dp, `icon="call"`, `tone="primary" variant="soft"`) visible only for `type === 'direct'` with resolvable `otherUserId`; onPress resolves otherUserId via `resolveConversationHeader`/members lookup, checks `webrtcService.isConnected()`, then `webrtcService.initiateCall(otherUserId, conversationId, 'audio')` with settled/cleanup/timeout pattern from CallsScreen ← (verify: button only on direct, correct callee, offline guard, no navigation side-effect)
- [ ] 5.2 Wire `ConversationListScreen.tsx` if needed to pass navigation/refresh context for call initiation (or keep logic self-contained in item)

## 6. Tests and verification

- [ ] 6.1 Backend tests: extend `call-logs` service/controller tests for `conversationId` filter (valid, invalid, absent), pagination with filter, and unauth 401
- [x] 6.2 Mobile checks: `npx tsc --noEmit` in `ChatApp` and `chat-backend` zero errors, `npx jest` relevant suites green ← (verify: type-check clean, no `Calls` type references remain, call-logs filter covered) — ChatApp tsc clean, chat-backend call-logs clean
- [ ] 6.3 Manual smoke: 2-device audio/video call still works, per-conversation history shows filtered logs, quick-call from list initiates call, group rows have no call button
