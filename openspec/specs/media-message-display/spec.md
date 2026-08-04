# media-message-display Specification

## Purpose
TBD - created by archiving change fix-media-messages. Update Purpose after archive.
## Requirements
### Requirement: Image messages resolve mediaKey to presigned URL
The MediaImage component SHALL resolve a MinIO mediaKey to a presigned GET URL via `GET /api/media/:mediaKey` each time it renders. While resolving, it SHALL display a placeholder with a loading spinner. On success, it SHALL display the image. On failure, it SHALL display a broken-image icon.

#### Scenario: Image loads successfully
- **WHEN** a message with type `image` and a non-empty `mediaUrl` (mediaKey) is rendered
- **THEN** the MediaImage component resolves the mediaKey to a presigned URL and displays the image

#### Scenario: Image is loading
- **WHEN** the presigned URL resolution is in progress
- **THEN** the component displays a gray placeholder with an ActivityIndicator spinner

#### Scenario: Image resolution fails
- **WHEN** the presigned URL resolution fails (network error, 404, expired key)
- **THEN** the component displays a broken-image icon (text fallback)

#### Scenario: Empty or null mediaKey
- **WHEN** a message has type `image` but mediaUrl is empty or null
- **THEN** no image is rendered, only the text content is shown

### Requirement: File messages display filename and download button
The FileAttachment component SHALL display the filename, a file icon, the file size (human-readable), and a "Download" button. When the user taps the download button, the component SHALL resolve the mediaKey to a presigned URL and open it via `Linking.openURL`.

#### Scenario: File message rendered
- **WHEN** a message with type `file` is rendered
- **THEN** the component displays a file icon, the filename (from message content), human-readable file size, and a download button

#### Scenario: User taps download
- **WHEN** the user taps the download button on a file message
- **THEN** the component resolves the mediaKey to a presigned URL and opens it in the device browser via `Linking.openURL`

#### Scenario: Download resolution fails
- **WHEN** the presigned URL resolution fails on download tap
- **THEN** an Alert is shown with the message "Không thể tải tệp"

### Requirement: toGiftedMessage passes media metadata as custom props
The `toGiftedMessage` function SHALL pass `mediaKey`, `mediaMimeType`, `mediaSize`, and the original `content` as custom properties on the IMessage object. It SHALL NOT set the `image` prop to a raw mediaKey.

#### Scenario: Image message conversion
- **WHEN** a backend Message with type `image` and mediaUrl `uploads/user/abc.jpg` is converted
- **THEN** the IMessage has `mediaKey: "uploads/user/abc.jpg"`, `mediaMimeType`, `mediaSize` set, and `image` is undefined

#### Scenario: File message conversion
- **WHEN** a backend Message with type `file` is converted
- **THEN** the IMessage has `mediaKey`, `mediaMimeType`, `mediaSize` set, `image` is undefined, and `text` contains the filename

#### Scenario: Text message conversion unchanged
- **WHEN** a backend Message with type `text` is converted
- **THEN** the IMessage has no `mediaKey` and behaves as before

### Requirement: Optimistic media messages show placeholder
When a media message is being uploaded, the optimistic message SHALL display a placeholder with a loading spinner instead of attempting to show the media.

#### Scenario: Image upload in progress
- **WHEN** the user sends an image and upload is in progress
- **THEN** the optimistic message appears with a placeholder + spinner in place of the image

#### Scenario: Upload completes
- **WHEN** the upload succeeds and the server confirms the message
- **THEN** the optimistic message is replaced with the real message, and the image resolves normally via MediaImage

### Requirement: ChatScreen wires custom renderers
ChatScreen SHALL provide `renderMessageImage` using MediaImage for image messages and `renderCustomView` using FileAttachment for file messages.

#### Scenario: Image message in chat
- **WHEN** a message with mediaKey and type image appears in the chat
- **THEN** GiftedChat uses renderMessageImage to display it via MediaImage component

#### Scenario: File message in chat
- **WHEN** a message with mediaKey and type file appears in the chat
- **THEN** GiftedChat uses renderCustomView to display it via FileAttachment component

### Requirement: Resolved images reveal without replaying the fade

An image whose local file is already resolved in the in-memory media cache at the moment the row mounts SHALL be revealed immediately, at full opacity, with no fade transition and without waiting for a fresh native load callback. Only an image that must be downloaded (or whose local URI is not yet in the memory cache) SHALL fade in on first reveal.

The fade for newly downloaded images SHALL use the shared motion tokens — duration `koolaDurations.normal` (180ms) and easing `koolaEasing.decelerate` — keeping it within the design-system budget for micro-interactions. When the user has enabled the system reduce-motion setting, as reported by `prefersReducedMotion()`, the fade SHALL be skipped and the image revealed immediately.

Rationale: message rows are recycled continuously while scrolling. Replaying a fade for content that is already on disk both wastes a native render round-trip per recycled row and reads to the user as the image "re-loading".

#### Scenario: Cached image appears immediately on row recycle

- **WHEN** a message row containing an image mounts and that image's local URI is already present in the in-memory media cache
- **THEN** the image renders at full opacity on its first committed frame, with no fade and no intermediate transparent state

#### Scenario: Newly downloaded image fades in once

- **WHEN** a message row containing an image mounts and that image is not yet in the in-memory media cache, and the download subsequently completes
- **THEN** the image fades from transparent to full opacity exactly once, over 180ms, using the decelerate easing curve

#### Scenario: Scrolling back to an already-faded image does not fade again

- **WHEN** an image has already been revealed, the row is recycled out of the viewport, and the user scrolls back so the same row mounts again
- **THEN** the image appears immediately at full opacity, because its URI is now resolved in the memory cache

#### Scenario: Reduce-motion skips the fade entirely

- **WHEN** the system reduce-motion preference is enabled and any image is revealed, whether cache-resolved or freshly downloaded
- **THEN** the image is shown at full opacity with no opacity transition

### Requirement: Image resolution effect does not retrigger itself

The effect that resolves an image's media key SHALL NOT be re-entered as a consequence of its own writes. Cached image dimensions recorded by the effect SHALL NOT participate in the effect's re-run condition, so resolving one image runs the resolution path once rather than twice.

Rationale: dimension data was both written by the effect and referenced in its re-run condition, so every image resolution caused a redundant teardown and re-run during scroll.

#### Scenario: Resolving an image runs the resolution path once

- **WHEN** an image message row mounts with a media key that requires resolution, and the resolution completes and records the image's dimensions
- **THEN** the resolution path executes once for that media key, and recording the dimensions does not cause it to execute again

#### Scenario: Cached dimensions are still applied

- **WHEN** an image's dimensions were recorded during an earlier mount and the same image is rendered again
- **THEN** the row is laid out using those recorded dimensions, with no layout shift when the image appears

