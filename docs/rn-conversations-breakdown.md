# rn-conversations — Breakdown

## Fog Points & Resolutions

### Fog 1: Pull-to-refresh vs infinite scroll for conversation list
**Spec**: "paginated list, sorted by lastMessageAt descending" — does not specify UI pattern.
- **Resolution (A)**: Pull-to-refresh + "Load more" button at bottom. ✅ Recommended. Simple, reliable.
- **Resolution (B)**: Infinite scroll with FlatList `onEndReached`.
- **Resolution (A) chosen** — more explicit UX, avoids double-fetch edge cases.

### Fog 2: New conversation — FAB button vs header action
**Spec silent**: "create a conversation" is a backend action, not a UI spec.
- **Resolution**: Floating Action Button (FAB) in bottom-right of `ConversationListScreen`. Tap → shows action sheet: "New Group" → group creation modal. Direct messages are created implicitly when messaging from Contacts (rn-contacts).

### Fog 3: Group creation — modal vs dedicated screen
- **Resolution (A)**: Modal bottom sheet with name input + member picker. ✅ Recommended.
- **Resolution (B)**: Dedicated screen pushed onto stack.
- **Resolution (A) chosen** — less navigation depth, faster flow.

### Fog 4: Conversation list empty state
**Spec silent**: What to show when user has no conversations?
- **Resolution**: Show illustration + "Start a conversation" button that navigates to Contacts.

### Fog 5: Unread badge on tab — live update after tab shown
- **Resolution**: Use `useFocusEffect` to re-fetch conversation list when screen comes into focus. Socket `new_message` event should update the in-memory list optimistically.

### Fog 6: Chat screen — belongs to rn-chat, not rn-conversations
**Spec**: Chat screen is a destination from conversation list. Full chat implementation is rn-chat.
- **Resolution**: `ConversationListScreen` navigates to `ChatScreen` with `conversationId`. ChatScreen placeholder will be replaced in rn-chat.

## Architecture Decisions (locked)

- **ConversationListScreen**: FlatList with pull-to-refresh, "Load more" button, FAB for new group
- **Group creation**: Modal bottom sheet with name TextInput + member picker (TextInput for userId list for MVP)
- **Navigation**: `navigation.navigate('Chat', { conversationId })` on tap
- **State management**: Local `useState` with `useCallback` for handlers. No Redux/Zustand in MVP.
- **Optimistic updates**: Append new conversation to list on creation without re-fetch

## Conversation List Item

```
┌────────────────────────────────────────────────────┐
│ [Avatar]  Conversation Name               [Badge]   │
│           Last message preview...          12:34    │
└────────────────────────────────────────────────────┘
```

Fields: avatar, displayName (group.name or direct member name), lastMessagePreview, lastMessageAt, unreadCount

## Group Creation Modal

```
┌────────────────────────────────────────────────────┐
│ Create Group                              [X]       │
│ ────────────────────────────────────────────────── │
│ Group name                                         │
│ [________________________]                         │
│                                                    │
│ Members (enter user IDs, comma separated)           │
│ [________________________]                         │
│                                                    │
│                        [Create Group]              │
└────────────────────────────────────────────────────┘
```

## Files to Create

```
src/screens/main/
  ConversationListScreen.tsx    ← full implementation
  ChatScreen.tsx               ← full implementation (rn-chat stub)

src/components/
  ConversationListItem.tsx      ← single conversation row
  EmptyConversations.tsx       ← empty state
  GroupCreateModal.tsx         ← group creation bottom sheet
  LoadingFooter.tsx            ← "Load more" spinner
```

## Files to Modify

```
src/screens/main/ConversationListScreen.tsx   ← replace placeholder
src/screens/main/ChatScreen.tsx              ← replace placeholder
src/services/api/apiService.ts              ← add typed response for conversations
src/types/index.ts                          ← add ConversationListResponse type
```

## Edge Cases Table

| Scenario | Handling |
|----------|----------|
| No conversations | Show `EmptyConversations` with CTA |
| API error on load | Show error banner with retry button |
| Empty search result | Not applicable (no search in this module) |
| Conversation tap | Navigate to `Chat` with `conversationId` |
| New group created | Optimistically append to list, dismiss modal |
| Pull-to-refresh | Re-fetch from page 1, replace list |
| "Load more" | Fetch next page, append to list |
| Unread count > 99 | Show "99+" |
| Last message is image | Show "📷 Photo" instead of preview |

## Dependencies

- `@react-native-async-storage/async-storage`: already in package.json ✅
- `react-native-vector-icons`: already in package.json ✅
- All other dependencies already present ✅
