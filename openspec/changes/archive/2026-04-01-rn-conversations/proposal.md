# rn-conversations — Proposal

## Summary
Full implementation of `ConversationListScreen` (pull-to-refresh, paginated list, group creation modal) and `ChatScreen` (message list placeholder) for the React Native chat app.

## Motivation
This module delivers the primary entry point of the app — the conversation list. Users see this screen immediately after logging in. It includes real-time conversation updates via socket events and group creation capability.

## Scope

### In scope
- `ConversationListScreen`: FlatList with pull-to-refresh, FAB, "Load more", navigation to Chat
- `ChatScreen`: Full screen placeholder — actual message list implemented in rn-chat
- Components: `ConversationListItem`, `EmptyConversations`, `GroupCreateModal`, `LoadingFooter`
- Group creation via bottom sheet modal
- Optimistic updates for new conversations
- Socket integration for real-time presence updates

### Out of scope
- Full message list UI (rn-chat module)
- Message sending/receiving (rn-chat module)
- Typing indicators (rn-chat module)
- Push notifications (rn-push module)

## Deliverables
- `src/screens/main/ConversationListScreen.tsx` — full implementation
- `src/screens/main/ChatScreen.tsx` — full implementation (placeholder stub for rn-chat)
- `src/components/` — all reusable components
- Typed API responses in `apiService.ts`
