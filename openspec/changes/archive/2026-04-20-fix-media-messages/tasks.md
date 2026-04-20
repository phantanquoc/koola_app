## 1. Update message conversion

- [x] 1.1 Update `toGiftedMessage()` in `useMessages.ts` to pass `mediaKey`, `mediaMimeType`, `mediaSize` as custom IMessage props instead of setting `image` to raw mediaKey
- [x] 1.2 Update `sendMediaMessage()` optimistic message to set a `pending` flag for media instead of setting `image` to mediaKey

## 2. Create MediaImage component

- [x] 2.1 Create `ChatApp/src/components/MediaImage.tsx` — resolves mediaKey → presigned URL via `resolveAvatarUrl`, shows placeholder+spinner while loading, broken-image icon on error, Image on success
- [x] 2.2 Handle edge case: empty/null mediaKey renders nothing ← (verify: component handles all states — loading, success, error, empty)

## 3. Create FileAttachment component

- [x] 3.1 Create `ChatApp/src/components/FileAttachment.tsx` — displays file icon, filename, human-readable size, and download button
- [x] 3.2 On download tap: resolve mediaKey → presigned URL, open via `Linking.openURL`. Show Alert on failure ← (verify: download flow works, error Alert shown on failure)

## 4. Wire renderers in ChatScreen

- [x] 4.1 Add `renderMessageImage` callback using MediaImage component for messages with mediaKey
- [x] 4.2 Add `renderCustomView` callback using FileAttachment component for messages with type `file`
- [x] 4.3 Pass `renderMessageImage` and `renderCustomView` to GiftedChat ← (verify: image messages show resolved images, file messages show download UI, optimistic messages show placeholder+spinner, text messages unchanged)
