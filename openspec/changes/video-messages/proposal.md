## Why

The chat app supports sending images and files but not video, leaving users unable to share video content natively. As video is a primary communication medium on mobile, adding gallery-based video sending closes a significant feature gap and brings the app to parity with mainstream chat apps.

## What Changes

- Add `video` message type to backend `MessageType` enum
- Raise media upload size cap from 100MB to 200MB to accommodate video files
- Add optional `mediaDuration` metadata field to the Message schema
- Add `video` to the `MessageType` union in frontend types
- Add `pickVideo()` and `compressVideo()` helpers to the media upload service
- Add video option to the chat attachment picker in `ChatScreen`
- Create `VideoMessage` component: thumbnail with play icon, auto-play muted on scroll-into-view, tap to fullscreen
- Create `VideoPlayerModal` component: fullscreen player with play/pause, seek, volume, and close controls
- Update mime-type detection to route `video/*` to the `video` message type

## Capabilities

### New Capabilities

- `video-sending`: Allows users to pick a video from their device gallery, auto-compress it, upload it, send it as a video message, and play it back inline or fullscreen within a chat conversation

### Modified Capabilities

- `messaging`: Max media file size increases from 100MB to 200MB, and the allowed message types expand to include `"video"`. Existing image/file scenarios are unchanged.

## Impact

**Backend**
- `src/messages/message.schema.ts` - new enum value
- `src/media/dto/request-presigned-url.dto.ts` - size cap raised to 200MB
- `src/messages/dto/send-message.dto.ts` - must accept `type: "video"` and optional `mediaDuration`

**Frontend**
- `src/types/index.ts` - MessageType union
- `src/services/media/mediaUploadService.ts` - video pick + compress + mime routing
- `src/screens/chat/ChatScreen.tsx` - attachment menu + handler
- New: `src/components/VideoMessage.tsx`
- New: `src/components/VideoPlayerModal.tsx`

**New dependencies**
- `react-native-video` (playback)
- `react-native-compressor` (video compression)

**No breaking changes** - existing image and file messages are unaffected.
