# rn-conversations — Design

## ConversationListScreen

### Layout

```
SafeAreaView
├── Header: "Chats" title
├── FlatList<Conversation>
│   ├── ConversationListItem (keyed by _id)
│   └── LoadingFooter (when hasMore && !loading)
├── RefreshControl (pull-to-refresh)
└── FAB (bottom-right, absolute positioned)
```

### State

```typescript
interface ConversationListState {
  conversations: Conversation[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}
```

### Behavior

| Action | Behavior |
|--------|----------|
| Mount | Fetch page 1 |
| Pull down | Fetch page 1, replace list |
| Tap "Load more" | Fetch next page, append |
| Tap conversation | `navigation.navigate('Chat', { conversationId })` |
| Tap FAB | Open `GroupCreateModal` |
| Socket `presence_update` | Update member's `isOnline` in list |
| Socket `new_message` | Update `lastMessage` + `unreadCount` optimistically |
| Group created | `optimisticallyAddConversation()`, dismiss modal |

### ConversationListItem

```
Row: flexDirection: row, alignItems: center, padding: 12
├── Avatar: 48x48 circle, first letter or image
├── Content: flex: 1, marginLeft: 12
│   ├── Row: name + timestamp (right-aligned)
│   └── Row: lastMessagePreview (truncated), ellipsize: tail
└── UnreadBadge: right side, red circle, count or "99+"
```

## GroupCreateModal

```
Modal (visible: boolean, onClose, onCreated)
├── TextInput: group name (required)
├── TextInput: member IDs (comma-separated, for MVP)
└── Button: "Create Group" → conversationsApi.create() → onCreated()
```

## ChatScreen (placeholder for rn-chat)

```
View
├── Header: conversation name + back button
├── FlatList (placeholder: "Messages go here")
└── InputBar (placeholder: "rn-chat implements this")
```

## API Response Types

```typescript
interface ConversationListResponse {
  conversations: Conversation[];
  hasMore: boolean;
  total: number;
}

interface Conversation {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar?: string;
  members: User[];
  lastMessage?: Message;
  lastMessageAt?: string;
  unreadCount: number;
}
```

## Socket Events (for future rn-chat)

This module sets up the socket listeners for conversation-level events:
- `new_message` → update `lastMessage` + increment `unreadCount` if not in viewport
- `presence_update` → update member `isOnline` in conversation list
- `message_read` → update message status (handled in rn-chat)
