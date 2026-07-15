## Why

In dark mode, incoming chat bubbles can blend into the conversation canvas, and outbound messages can display duplicate delivery indicators from two rendering paths. Users cannot reliably scan speaker boundaries or understand message state, even though the underlying delivery data is already available.

## What Changes

- Guarantee visible separation between incoming bubbles and the chat canvas in both themes.
- Render exactly one delivery-state indicator for each outbound message.
- Preserve the existing pending, sent, read, failed, retry, offline queue, and outbox semantics.
- Standardize timestamp and state placement so status information does not appear detached from its message.
- Add visual regression coverage for light/dark, inbound/outbound, pending/read/failed, text, and media messages.

## Capabilities

### New Capabilities
- `chat-message-presentation`: Covers mobile message bubble separation, metadata placement, and single-source delivery feedback.

### Modified Capabilities

None.

## Impact

- `ChatScreen`, GiftedChat bubble/render hooks, message presentation components, and theme chat-bubble tokens.
- Read-only mapping of existing message state into presentation.
- No changes to send APIs, socket events, SQLite message storage, offline queue, outbox retry, or read-receipt semantics.
