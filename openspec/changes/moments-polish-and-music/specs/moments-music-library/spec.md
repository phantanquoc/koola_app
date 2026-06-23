## MODIFIED Requirements

### Requirement: Compose-at-Playback Player
The mobile story player SHALL render a story by composing the user's video (or image) and the referenced music track as parallel streams synchronized at start time. When a story carries a `musicRef`, the viewer mounts a hidden audio-only `react-native-video` instance that plays the track's presigned `audioUrl`, seeks to `startMs` on load, and pauses/resumes in lockstep with the story; the viewer renders the music attribution pill for that story.

#### Scenario: Image story with music
- **WHEN** the player opens an image story with `musicRef`
- **THEN** the player displays the image for 5 seconds (default image duration), plays the music audio starting at `startMs`, then auto-advances; the audio pauses on swipe-down dismiss

#### Scenario: Video story with music
- **WHEN** the player opens a video story with `musicRef`
- **THEN** the player runs `react-native-video` muted for the user's video and a parallel hidden audio player on the music track seeked to `startMs`; both respond to the same paused state

#### Scenario: Music track unavailable at playback
- **WHEN** the player attempts to load the music audio and the network or MinIO returns an error
- **THEN** the player drops the audio track silently and continues playing the story without music

#### Scenario: Pause and resume
- **WHEN** the user holds-to-pause on the story
- **THEN** both the story media and the audio pause; on release the image progress timer resumes from the remaining time (not from zero) and audio resumes

#### Scenario: Story without music
- **WHEN** the story has no `musicRef`
- **THEN** the player plays the video with its native audio (if any) or the image with no audio, and no audio player is mounted

#### Scenario: Music attribution pill rendered when a story has music
- **WHEN** the viewer renders a story whose `musicRef` resolves to an active track
- **THEN** the music attribution pill ("🎵 Title · Artist") is rendered; for stories without a resolvable track the pill is not shown

### Requirement: Music Picker UI
The composer SHALL include a music picker showing trending tracks, search, and per-track preview, with provenance attribution displayed. The "Thêm nhạc" entry-point opens the picker; selecting a track sets the story's `musicRef = { trackId, startMs }`, which is sent on `POST /moments/stories`. The backend browse/search and single-track read endpoints SHALL return presigned playback URLs so the picker can preview audio and the viewer can play it back.

#### Scenario: Composer shows the music picker entry
- **WHEN** the composer is in the preview step
- **THEN** the "Thêm nhạc" row is rendered and tapping it opens the `MusicPicker` modal

#### Scenario: Selecting a track sets musicRef on the story
- **WHEN** the user selects a track and confirms a start offset in the picker
- **THEN** the composer holds `musicRef = { trackId, startMs }` and includes it in the `POST /moments/stories` request body; clearing the selection sends no `musicRef`

#### Scenario: Single-track read returns presigned playback URLs
- **WHEN** a client calls `GET /moments/music-tracks/:id`
- **THEN** the response includes presigned `audioUrl` (the full track) and `previewUrl`, valid ~1 hour, in addition to the track metadata

#### Scenario: Browse/search responses carry a presigned preview URL
- **WHEN** a client calls `GET /moments/music-tracks` (browse or search)
- **THEN** each track in the response includes a presigned `previewUrl` (falling back to the full audio object when no dedicated preview key exists) so the picker can preview without exposing raw MinIO keys

#### Scenario: Backend endpoints remain available
- **WHEN** an admin client calls `GET /moments/music-tracks`, `POST /moments/music-tracks`, or related endpoints
- **THEN** the endpoints continue to function as previously specified
