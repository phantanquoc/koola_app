# rn-conversations — Tasks

## Types

- [x] 1.1 Add `ConversationListResponse` interface to `src/types/index.ts`
- [x] 1.2 Add typed response for `conversationsApi.list()` in `src/services/api/apiService.ts`

## Components

- [x] 2.1 `src/components/ConversationListItem.tsx` — avatar, name, preview, badge, timestamp
- [x] 2.2 `src/components/EmptyConversations.tsx` — icon, CTA button
- [x] 2.3 `src/components/LoadingFooter.tsx` — "Load more" button + spinner
- [x] 2.4 `src/components/GroupCreateModal.tsx` — name + member IDs inputs, create button

## ConversationListScreen

- [x] 3.1 State: `conversations[]`, `page`, `hasMore`, `loading`, `refreshing`, `error`
- [x] 3.2 `fetchConversations(reset?: boolean)` — fetch page, append or replace
- [x] 3.3 `handleRefresh()` — pull-to-refresh
- [x] 3.4 `handleLoadMore()` — pagination
- [x] 3.5 `handleConversationPress()` — navigate to Chat
- [x] 3.6 `handleGroupCreated()` — optimistically add, dismiss modal
- [x] 3.7 Socket `presence_update` handler — update `isOnline`
- [x] 3.8 Socket `new_message` handler — update `lastMessage` + unread
- [x] 3.9 `useFocusEffect` — re-fetch on screen focus
- [x] 3.10 Cleanup: `socketService.off()` on unmount
- [x] 3.11 Layout: SafeAreaView, FlatList, FAB, PullToRefresh, error banner

## ChatScreen (placeholder)

- [x] 4.1 Header with back button and conversation ID display
- [x] 4.2 Placeholder FlatList with "Messages implemented in rn-chat"
- [x] 4.3 InputBar placeholder with "Type a message..."

## Navigation

- [x] 5.1 Fix navigation types: stack screens use `NativeStackScreenProps`

## Verification

- [x] 6.1 `npx tsc --noEmit` passes ✅
- [x] 6.2 All components render correctly
- [x] 6.3 Conversation list paginates correctly
- [x] 6.4 Group creation flow works end-to-end
