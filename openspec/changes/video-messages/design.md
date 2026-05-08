## Context

The app (React Native + NestJS) already has a working media pipeline: users pick images or files, a presigned URL is fetched from the backend, the file is uploaded directly to MinIO, and the resulting URL is sent as a message. The `MessageType` enum currently has `TEXT`, `IMAGE`, and `FILE`. The frontend has `ImageMessage` and `FileAttachment` components for display.

Video differs from images and files in three ways: files can be large (requiring a higher size cap and compression before upload), they require a playback UI with inline preview and fullscreen mode, and the mobile rendering library (`react-native-video`) has native linking requirements.

## Goals / Non-Goals

**Goals:**
- Extend the existing presigned-URL upload pipeline to handle video without re-architecting it
- Auto-compress videos on-device before upload to keep transfer times acceptable
- Show an inline thumbnail with play-on-tap in the message list
- Provide a fullscreen player with basic controls

**Non-Goals:**
- Camera recording (gallery pick only)
- Video streaming or HLS; the app downloads and plays from the presigned URL
- Custom video transcoding on the backend
- Video editing or trimming
- Android Scoped Storage permission management beyond what the picker handles

## Decisions

### 1. Reuse presigned-URL upload pipeline unchanged

The existing flow (`requestPresignedUrl → PUT to MinIO → sendMessage`) works for any binary file. Rather than building a dedicated video endpoint, video messages follow the same flow. Only the DTO validation and enum values change on the backend.

Alternative considered: a backend-side compression/transcoding job (e.g. ffmpeg worker). Rejected because it adds significant infra complexity and latency; on-device compression with `react-native-compressor` is faster and free.

### 2. `react-native-video` for playback, `react-native-compressor` for compression

`react-native-video` is the de facto standard React Native video player with active maintenance and Expo/bare workflow support. `react-native-compressor` provides a simple `Video.compress()` API wrapping platform-native encoders (MediaCodec on Android, AVFoundation on iOS), producing smaller MP4 output without requiring a native ffmpeg build.

Alternative considered: `expo-video` (Expo module). Rejected because the project is a bare React Native app and mixing Expo modules adds overhead without clear benefit.

### 3. Inline auto-play muted, tap for fullscreen

Following the pattern established by WhatsApp and Telegram: short videos auto-play silently in the list (loop, muted), and a tap opens a modal player. This is implemented with `react-native-video`'s `paused` prop driven by `onViewableItemsChanged` in the FlatList.

Alternative considered: static thumbnail only (user must tap to play anything). Rejected because auto-play muted is a strong UX expectation on mobile.

### 4. Compression before upload, with progress feedback

`react-native-compressor` runs synchronously in the JS thread via a native module and returns a local URI. The handler chain is: `pickVideo → compressVideo (show progress) → requestPresignedUrl → uploadToS3 → sendMessage`. If compression fails the user is alerted and can retry from the pick step.

### 5. Size validation on client and server

The client rejects videos over 200MB before even starting compression (fast fail). The backend DTO also enforces 200MB so malicious or misconfigured clients cannot push oversized objects.

### 6. `mediaDuration` stored as optional integer (seconds)

Duration is extracted by `react-native-image-picker` metadata or `react-native-compressor` output and sent alongside the message. It is an optional field; missing duration does not break playback.

## Risks / Trade-offs

- **Compression time on low-end Android devices** → The compressor runs a native encoder so it is off the JS thread; show a modal progress indicator to prevent the user from navigating away. Allow cancellation.
- **`react-native-video` native linking** → Requires running `pod install` on iOS and a Gradle sync on Android. The tasks doc must include these steps. Missing auto-link is the #1 source of runtime crashes with this library.
- **Very large video files may exhaust device memory during compression** → The compressor streams via native APIs so memory pressure is lower than reading the full buffer into JS, but files near 200MB can still cause issues on low-RAM devices. Document the 200MB limit clearly in the UI error message.
- **MinIO presigned URL expiry during slow upload** → Presigned URLs currently expire in 15 minutes (existing config). A 200MB video on a slow connection can take longer. Mitigation: the existing retry-on-failure in `useOfflineQueue` will re-request a presigned URL on retry, so the worst case is one failed attempt before the queue retries correctly.
- **`video/*` MIME type detection on Android** → Some Android versions report `.mov` files as `video/quicktime` or even `application/octet-stream`. The `getMessageTypeFromMime()` function should treat any `video/` prefix as video type, but also check file extension as fallback.

## Open Questions

- Should the video thumbnail be generated on-device (using `react-native-compressor`'s `generateVideoThumbnail`) and uploaded as a separate image, or should `react-native-video` render a poster frame at runtime from the video URL? Runtime poster frame is simpler but requires the video to be partially downloaded before anything shows. Recommendation: generate thumbnail on-device and upload it, storing URL as `mediaThumb` on the message — but this is optional for v1 and can be deferred.
- What is the target compressed bitrate / resolution? `react-native-compressor` defaults are typically 1080p at ~4Mbps. A lower preset (720p, ~2Mbps) would be safer for upload speed. Leave configurable via a constant so it can be tuned without a code change.
