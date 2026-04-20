## Context

Chat messages store media references as MinIO object keys (e.g., `uploads/userId/uuid.jpg`) in the `mediaUrl` field. To display or download media, the client must resolve these keys to time-limited presigned URLs via `GET /api/media/:mediaKey`. Currently, `toGiftedMessage()` passes the raw key directly to GiftedChat's `image` prop, which expects a valid URL. File-type messages have no dedicated rendering — they display only placeholder text.

The existing `resolveAvatarUrl()` function in `apiService.ts` already handles mediaKey → presigned URL resolution and can be reused.

## Goals / Non-Goals

**Goals:**
- Images in messages display correctly by resolving mediaKey → presigned URL
- File attachments show filename, icon, and a download button
- Optimistic media messages show placeholder + spinner during upload
- Error states handled: broken-image icon for failed image loads, Alert for failed downloads

**Non-Goals:**
- Caching presigned URLs (resolve fresh each render for simplicity)
- Inline preview for non-image files (PDF, video, audio)
- Image full-screen viewer / zoom
- Backend changes

## Decisions

**1. Resolve strategy: per-render resolution via existing `resolveAvatarUrl`**
- Rationale: Simplest approach. The function already exists and handles all edge cases (http URLs pass through, mediaKeys get resolved). Presigned URLs expire after 1 hour, so re-resolving on render avoids stale URLs.
- Alternative considered: Batch resolution when loading messages — more complex, premature optimization for current usage.

**2. Custom IMessage props for media metadata**
- Extend GiftedChat's IMessage with `mediaKey`, `mediaMimeType`, `mediaSize`, `mediaFilename` custom props.
- `toGiftedMessage()` populates these from backend Message fields.
- Rendering components use these props instead of relying on GiftedChat's native `image` field.

**3. Two new components: MediaImage and FileAttachment**
- `MediaImage`: Handles image resolution + display with loading/error states. Used via `renderMessageImage`.
- `FileAttachment`: Shows file info + download button. Used via `renderCustomView` for messages with `type === 'file'`.
- Rationale: Separation of concerns. Each component handles its own resolution and state.

**4. Optimistic media messages: placeholder + spinner**
- During upload, the optimistic message shows a placeholder with ActivityIndicator, not a local file preview.
- Rationale: User chose this approach. Simpler than managing local URI → server URL transition.

## Risks / Trade-offs

- **Many API calls**: Each image message triggers a `GET /media/:key` call on render. For conversations with many images, this could be noticeable. → Acceptable for MVP; add caching later if needed.
- **Presigned URL race**: If resolution is slow, user may see placeholder briefly on every scroll. → ActivityIndicator provides visual feedback.
- **MinIO port accessibility**: Phone must have `adb reverse tcp:9000 tcp:9000` for presigned URLs to work in dev. → Dev-only concern, not a production issue.
