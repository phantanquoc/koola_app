## MODIFIED Requirements

### Requirement: Music Picker UI
The composer SHALL include a music picker showing trending tracks, search, and per-track preview, with provenance attribution displayed. In the v1 stabilization release, the music picker entry-point is hidden in the composer UI while the audio playback layer is unwired; every story created via the composer has `musicRef = null`. The picker component itself, the backend endpoints (`/moments/music-tracks/*`), and the story-level `musicRef` schema field remain unchanged so the entry-point can be restored without a backend migration.

#### Scenario: Composer hides music picker entry in v1
- **WHEN** the composer is in the preview step
- **THEN** the "Thêm nhạc" row is NOT rendered and the music picker modal cannot be opened from the composer

#### Scenario: Picker component file is preserved
- **WHEN** the composer is built for v1
- **THEN** the `MusicPicker` component file remains in the codebase (no deletion) and the component is exported so a future change can re-enable the entry-point

#### Scenario: Stories created in v1 have no musicRef
- **WHEN** a user creates a story via the composer in v1
- **THEN** the request body to `POST /moments/stories` has `musicRef = undefined` (the field is omitted)

#### Scenario: Backend endpoints remain available
- **WHEN** an admin client calls `GET /moments/music-tracks`, `POST /moments/music-tracks`, or related endpoints
- **THEN** the endpoints continue to function as previously specified; only the mobile composer UI is suppressed

### Requirement: Compose-at-Playback Player
The mobile story player SHALL render a story by composing the user's video (or image) and the referenced music track as parallel streams synchronized at start time. In v1, since the composer cannot attach `musicRef`, all stories rendered by the player are non-music stories; the music attribution pill is hidden in the viewer.

#### Scenario: Image story with music
- **WHEN** the player opens an image story with `musicRef`
- **THEN** the player displays the image for 5 seconds (default image duration), starts the music audio at `startMs`, plays for 5 seconds, then auto-advances; the audio is muted on swipe-down dismiss

#### Scenario: Video story with music
- **WHEN** the player opens a video story with `musicRef`
- **THEN** the player runs `react-native-video` in muted mode for the user's video and a parallel audio player on the music track starting at `startMs`; both start at the same wall-clock anchor

#### Scenario: Music track unavailable at playback
- **WHEN** the player attempts to load the music audio and the network or MinIO returns an error
- **THEN** the player drops the audio track silently and continues playing the video without music; a warning is logged client-side

#### Scenario: Pause and resume
- **WHEN** user holds-to-pause on the story
- **THEN** both video and audio pause at the same offset; on release, both resume synchronized

#### Scenario: Story without music
- **WHEN** the story has no `musicRef`
- **THEN** the player plays the video with its native audio (if any) or the image with no audio

#### Scenario: Music attribution pill hidden in v1
- **WHEN** the viewer renders any story in v1
- **THEN** the music attribution pill ("🎵 Title · Artist") is NOT rendered, even if a story payload received via real-time events still carries `musicRef` (legacy data)
