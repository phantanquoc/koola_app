## ADDED Requirements

### Requirement: Pick video from gallery
The system SHALL allow an authenticated user to select a video from their device gallery within an active chat conversation.

#### Scenario: Open attachment picker and choose video
- **WHEN** user taps the attachment icon in ChatScreen and selects the "Video" option
- **THEN** the device gallery opens filtered to video files; upon selection the app receives the local URI, MIME type, file size, and duration

#### Scenario: User cancels gallery selection
- **WHEN** user opens the gallery picker and dismisses it without selecting a video
- **THEN** no upload is initiated and the chat input remains unchanged

#### Scenario: Selected video exceeds 200MB
- **WHEN** user selects a video whose file size is greater than 200,000,000 bytes
- **THEN** the app displays an alert "Video quá lớn. Vui lòng chọn video dưới 200MB" and does not proceed to compression or upload

### Requirement: Compress video before upload
The system SHALL compress a selected video on-device before uploading to reduce transfer size and time.

#### Scenario: Successful compression
- **WHEN** user selects a valid video under 200MB
- **THEN** the app runs on-device video compression, displays a progress indicator during compression, and proceeds to upload the compressed file upon completion

#### Scenario: Compression fails
- **WHEN** an error occurs during on-device video compression
- **THEN** the app dismisses the progress indicator and displays an alert offering the user the option to retry

#### Scenario: User cancels compression in progress
- **WHEN** user taps Cancel while the compression progress indicator is visible
- **THEN** compression is aborted, no upload is started, and the chat input state is reset

### Requirement: Upload and send video message
The system SHALL upload the compressed video to object storage via a presigned URL and send a video message to the conversation.

#### Scenario: Successful video upload and send
- **WHEN** compressed video is ready and network is available
- **THEN** app requests a presigned URL with `messageType: "video"` and `fileSize` of the compressed file, uploads the file to the presigned URL, and calls POST /conversations/:id/messages with `{ type: "video", mediaUrl, mediaMimeType, mediaSize, mediaDuration }`

#### Scenario: Upload fails due to network error
- **WHEN** the PUT request to the presigned URL fails
- **THEN** app displays an alert with a retry option; if the device is offline the message is queued in the offline queue for retry when connectivity is restored

#### Scenario: Unsupported video format
- **WHEN** user selects a video with a MIME type that is not mp4, mov, or webm (e.g. `video/x-msvideo`)
- **THEN** the app displays an alert "Định dạng video không được hỗ trợ. Vui lòng chọn mp4, mov, hoặc webm." and does not proceed

### Requirement: Display video message inline
The system SHALL render video messages in the chat message list with a thumbnail, play icon overlay, and auto-play muted behavior when visible.

#### Scenario: Video message renders thumbnail and play icon
- **WHEN** a video message appears in the chat FlatList
- **THEN** the VideoMessage component displays a video poster frame (or placeholder if unavailable) with a centered play icon overlay

#### Scenario: Auto-play muted when scrolled into view
- **WHEN** a VideoMessage component enters the visible viewport (tracked via onViewableItemsChanged)
- **THEN** the video begins playing automatically with audio muted and loops silently

#### Scenario: Pause when scrolled out of view
- **WHEN** a VideoMessage component scrolls out of the visible viewport
- **THEN** the video playback pauses

#### Scenario: Video playback fails inline
- **WHEN** the video URL is unreachable or the file is corrupt during inline playback
- **THEN** the VideoMessage component displays an error state with a reload icon; tapping the reload icon retries playback

### Requirement: Fullscreen video player
The system SHALL provide a fullscreen modal video player when a user taps an inline video message.

#### Scenario: Open fullscreen player
- **WHEN** user taps a VideoMessage in the chat list
- **THEN** VideoPlayerModal opens in fullscreen with the video paused at the beginning, showing play/pause button, seek bar, volume toggle, and a close button

#### Scenario: Play and pause in fullscreen
- **WHEN** user taps the play button in VideoPlayerModal
- **THEN** video begins playing with audio; tapping pause stops playback at the current position

#### Scenario: Seek in fullscreen
- **WHEN** user drags the seek bar in VideoPlayerModal
- **THEN** video jumps to the selected position and resumes from that point if it was playing

#### Scenario: Close fullscreen player
- **WHEN** user taps the close button in VideoPlayerModal
- **THEN** the modal dismisses and returns to the chat message list

#### Scenario: Fullscreen playback fails
- **WHEN** video cannot be loaded in VideoPlayerModal (network error, missing URL)
- **THEN** modal displays an error message and a retry button; tapping retry re-initiates the video load
