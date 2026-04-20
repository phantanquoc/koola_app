## Why

Chat messages currently lack standard messaging features users expect: reactions, forwarding, flexible deletion, and pinning. Users cannot react to messages with emoji, cannot forward messages to other conversations, can only delete messages globally (no "delete for me" option), and cannot pin important messages. Additionally, file downloads open the browser instead of saving directly to the device.

## What Changes

- **Message reactions**: Long press context menu with 6 fixed emoji (👍❤️😆😮😢😠), toggle on/off, displayed under message bubble with count, real-time via Socket.IO
- **Delete for me / Delete for everyone**: "Delete for me" hides message only for the deleter (no time limit). "Delete for everyone" keeps existing soft-delete behavior (sender only, 24h limit)
- **Forward messages**: Forward text/image/file messages to one or multiple conversations, with "[Chuyển tiếp]" prefix indicator
- **Pin messages**: Any member can pin, unlimited pins per conversation, banner at top of chat scrolls to pinned message (cycle through multiple pins on tap)
- **Direct file download**: FileAttachment downloads directly to device Downloads folder using react-native-blob-util, shows Toast confirmation

## Capabilities

### New Capabilities
- `message-reactions`: Add/remove emoji reactions to messages with real-time sync
- `message-context-menu`: Long press bottom sheet with reactions, share, delete, pin actions
- `delete-for-me`: Hide messages for individual users without affecting others
- `forward-message`: Forward messages to one or multiple conversations
- `pin-message`: Pin/unpin messages in conversations with banner UI
- `direct-file-download`: Download files directly to device storage

### Modified Capabilities

## Impact

- `chat-backend/src/messages/message.schema.ts` — add `reactions[]` and `deletedFor[]` fields
- `chat-backend/src/messages/messages.service.ts` — new methods for reactions, delete-for-me, forward
- `chat-backend/src/conversations/conversation.schema.ts` — add `pinnedMessages[]` field
- `chat-backend/src/conversations/conversations.service.ts` — pin/unpin methods
- `chat-backend/src/gateway/chat.gateway.ts` — new socket events for reactions, pin
- `ChatApp/src/screens/chat/ChatScreen.tsx` — long press handler, context menu, pin banner
- `ChatApp/src/screens/chat/hooks/useMessages.ts` — filter deletedFor, handle reactions
- `ChatApp/src/components/FileAttachment.tsx` — use react-native-blob-util for download
- New components: MessageContextMenu, ReactionDisplay, PinBanner, ForwardModal
- Dependencies: react-native-blob-util (already installed), @gorhom/bottom-sheet or custom bottom sheet
