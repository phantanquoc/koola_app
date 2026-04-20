## Why

Media messages (images and files) are broken in the chat. The `mediaUrl` field stores a MinIO media key (e.g., `uploads/userId/uuid.jpg`), not a displayable URL. The app passes this raw key directly to GiftedChat's `image` prop, resulting in broken images. File attachments have no dedicated UI — they only show placeholder text. Users cannot view sent photos or download files.

## What Changes

- Fix `toGiftedMessage()` in `useMessages.ts` to pass raw mediaKey and media metadata as custom props instead of using mediaKey as image URL
- Create `MediaImage` component that resolves mediaKey → presigned URL on each render, with placeholder+spinner while loading and broken-image icon on error
- Create `FileAttachment` component that shows filename + icon + download button, resolving mediaKey → presigned URL on tap via `Linking.openURL`
- Update `ChatScreen.tsx` to wire `renderMessageImage` (using MediaImage) and `renderCustomView` (using FileAttachment for type='file')
- Fix optimistic media messages to show placeholder+spinner instead of broken mediaKey URL

## Capabilities

### New Capabilities
- `media-message-display`: Resolve and render media (images and files) in chat messages using presigned URLs from MinIO

### Modified Capabilities

## Impact

- `ChatApp/src/screens/chat/hooks/useMessages.ts` — toGiftedMessage and sendMediaMessage functions
- `ChatApp/src/screens/chat/ChatScreen.tsx` — add renderMessageImage and renderCustomView
- `ChatApp/src/components/MediaImage.tsx` — new component
- `ChatApp/src/components/FileAttachment.tsx` — new component
- Dependencies: existing `resolveAvatarUrl` from apiService (reused for mediaKey resolution), `react-native` Linking API
- No backend changes required
