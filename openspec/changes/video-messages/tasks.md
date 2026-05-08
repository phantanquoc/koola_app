## 1. Backend Schema & Validation

- [x] 1.1 Add `VIDEO = 'video'` to `MessageType` enum in `chat-backend/src/messages/message.schema.ts`
- [x] 1.2 Add optional `mediaDuration` field (Number, no min/max) to the Message Mongoose schema in `message.schema.ts`
- [x] 1.3 Update `chat-backend/src/media/dto/request-presigned-url.dto.ts` — raise `@Max` from 100MB (104857600) to 200MB (209715200) and add `'video/mp4'`, `'video/quicktime'`, `'video/webm'` to the allowed MIME types list
- [x] 1.4 Update `chat-backend/src/messages/dto/send-message.dto.ts` — accept `type: 'video'` in the `MessageType` enum validation and add optional `mediaDuration` property (`@IsOptional() @IsInt() @Min(0)`) ← (verify: POST /conversations/:id/messages with type "video" and mediaDuration returns 201; mediaSize > 209715200 returns 400 "File exceeds 200MB limit")

## 2. Frontend Type Definitions

- [x] 2.1 Add `'video'` to the `MessageType` union in `ChatApp/src/types/index.ts`
- [x] 2.2 Add optional `mediaDuration?: number` field to the `Message` type/interface in `ChatApp/src/types/index.ts` ← (verify: TypeScript compiles without errors referencing new type fields)

## 3. Install & Link New Dependencies

- [x] 3.1 Install `react-native-video` and `react-native-compressor` — run `npm install react-native-video react-native-compressor` inside `ChatApp/`
- [ ] 3.2 Run `pod install` inside `ChatApp/ios/` to link native modules for iOS
- [ ] 3.3 Verify Android Gradle sync picks up the native modules (run `./gradlew dependencies` in `ChatApp/android/` or open in Android Studio and sync) ← (verify: app builds on both platforms without unresolved native module errors; import of Video from react-native-video compiles)

## 4. Media Upload Service — Video Helpers

- [x] 4.1 Add `pickVideo()` function to `ChatApp/src/services/media/mediaUploadService.ts` using `launchImageLibrary` from `react-native-image-picker` with `mediaType: 'video'` and `includeExtra: true`; return `{ uri, mimeType, fileSize, duration }` or `null` on cancel
- [x] 4.2 Add size guard in `pickVideo()`: if `fileSize > 209715200` throw or return an error code `'TOO_LARGE'`
- [x] 4.3 Add format guard in `pickVideo()`: if MIME type is not `video/mp4`, `video/quicktime`, or `video/webm`, check file extension as fallback; if still unsupported return error code `'UNSUPPORTED_FORMAT'`
- [x] 4.4 Add `compressVideo(uri: string, onProgress: (pct: number) => void): Promise<string>` using `Video.compress()` from `react-native-compressor`; configure target resolution to 720p / ~2Mbps bitrate constant
- [x] 4.5 Update `getMessageTypeFromMime()` in `mediaUploadService.ts` — return `'video'` for any MIME type starting with `video/` ← (verify: pickVideo returns null on cancel; returns TOO_LARGE for oversized input; compressVideo resolves to a local URI; getMessageTypeFromMime('video/mp4') === 'video')

## 5. ChatScreen — Attachment Menu & Handler

- [x] 5.1 Add "Video" option to the attachment `Alert.alert` menu in `ChatApp/src/screens/chat/ChatScreen.tsx`
- [x] 5.2 Add `handlePickVideo` async handler: call `pickVideo()` → on `TOO_LARGE` show alert "Video quá lớn. Vui lòng chọn video dưới 200MB" → on `UNSUPPORTED_FORMAT` show alert → else call `compressVideo()` with a progress modal → on compression success call `uploadMedia()` then `sendMessage()` with `type: 'video'` and `mediaDuration`
- [x] 5.3 Add compression progress modal UI (ActivityIndicator + percentage label + Cancel button) controlled by local state in ChatScreen
- [x] 5.4 Handle compression cancellation: abort the compressor call and reset state ← (verify: tapping "Video" in attachment menu opens gallery; selecting >200MB file shows correct alert; selecting valid file triggers compression progress UI; successful flow sends a message with type "video")

## 6. VideoMessage Component

- [x] 6.1 Create `ChatApp/src/components/VideoMessage.tsx` — props: `message: Message`, `isVisible: boolean`
- [x] 6.2 Render a `<Video>` component (react-native-video) with `paused={!isVisible}`, `muted={true}`, `repeat={true}`, `resizeMode="cover"`, fixed thumbnail dimensions
- [x] 6.3 Render a centered play icon overlay (semi-transparent circle with triangle icon) on top of the video
- [x] 6.4 Show `ActivityIndicator` while video is buffering (`onBuffer` callback from react-native-video)
- [x] 6.5 Handle `onError` from react-native-video: display error state with a reload icon; tapping icon resets the `key` prop to force remount
- [x] 6.6 Accept and call an `onPress` prop to open the fullscreen player ← (verify: VideoMessage renders without crash; play icon is visible; buffering spinner appears when network is slow; error state renders on bad URL; onPress fires on tap)

## 7. Wire Auto-Play via FlatList viewability

- [x] 7.1 In `ChatApp/src/screens/chat/ChatScreen.tsx` (or the component that owns the message FlatList), add a `viewabilityConfig` with `itemVisiblePercentThreshold: 50`
- [x] 7.2 Track the set of currently visible message IDs via `onViewableItemsChanged` ref
- [x] 7.3 Pass `isVisible={visibleIds.has(message._id)}` to each `VideoMessage` render ← (verify: video auto-plays when scrolled into view and pauses when scrolled out; multiple videos in list do not all play simultaneously)

## 8. VideoPlayerModal Component

- [x] 8.1 Create `ChatApp/src/components/VideoPlayerModal.tsx` — props: `visible: boolean`, `uri: string`, `onClose: () => void`
- [x] 8.2 Render a `Modal` (React Native core) with `animationType="slide"` covering full screen with black background
- [x] 8.3 Render a `<Video>` with controls disabled (`controls={false}`), wired to local `paused` and `currentTime` state
- [x] 8.4 Implement play/pause toggle button
- [x] 8.5 Implement a seek bar using `<Slider>` (from `@react-native-community/slider`) wired to `onProgress` and `seek()` on the Video ref
- [x] 8.6 Implement volume/mute toggle button
- [x] 8.7 Implement close button that calls `onClose` and pauses/resets playback state
- [x] 8.8 Handle `onError` in VideoPlayerModal: display error overlay with retry button that resets video key ← (verify: modal opens fullscreen on tap; play/pause works; seek moves playback position; close dismisses modal; error state shows on bad URL with working retry)

## 9. Integrate VideoMessage into Message Renderer

- [x] 9.1 Locate the message type switch/conditional in `ChatApp/src/screens/chat/ChatScreen.tsx` (or a dedicated `MessageItem` component) that renders `ImageMessage` / `FileAttachment` based on `message.type`
- [x] 9.2 Add a `case 'video':` branch that renders `<VideoMessage message={message} isVisible={...} onPress={() => openPlayer(message)} />`
- [x] 9.3 Add state `playerMessage: Message | null` and render `<VideoPlayerModal visible={!!playerMessage} uri={playerMessage?.mediaUrl} onClose={() => setPlayerMessage(null)} />` ← (verify: incoming video messages render the VideoMessage component; tapping opens VideoPlayerModal with the correct URL; closing modal returns to chat)

## 10. Offline Queue Compatibility

- [x] 10.1 Confirm that `useOfflineQueue` in `ChatApp/src/hooks/useOfflineQueue.ts` treats queued video send operations the same as image/file (no message-type-specific branching that would exclude `'video'`); add type to allowed list if needed ← (verify: sending video while offline queues the operation; when connectivity restores the video message is sent successfully)

## 11. End-to-End Smoke Test

- [ ] 11.1 Build and run the app on Android; pick a short mp4 from gallery, confirm compression progress appears, confirm video message appears in chat list with thumbnail and play icon
- [ ] 11.2 Tap the inline video; confirm fullscreen player opens, plays with audio, seek bar works, close returns to chat
- [ ] 11.3 Build and run the app on iOS; repeat steps 11.1 and 11.2
- [ ] 11.4 Test error paths on both platforms: select file >200MB (alert shown), select unsupported format (alert shown), open player with unreachable URL (error state with retry shown) ← (verify: all scenarios from specs/video-sending/spec.md pass on both platforms; no runtime crashes; no memory warnings for files under 100MB)
