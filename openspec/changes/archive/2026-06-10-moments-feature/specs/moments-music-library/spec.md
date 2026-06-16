## ADDED Requirements

### Requirement: Music Track Schema with Provenance
The system SHALL persist a curated catalog of music tracks with provenance metadata sufficient to prove license clearance for any track at any time.

#### Scenario: Schema and indexes
- **WHEN** the MomentsModule initializes
- **THEN** the MusicTracks collection exists with fields `{ _id, title, artist, durationMs, audioKey, previewKey, licenseType, licenseUrl, sourceUrl, attribution, addedBy, addedAt, isActive, tags }` and indexes `{ isActive: 1, addedAt: -1 }`, `{ tags: 1 }`, `{ title: "text", artist: "text" }` for search

#### Scenario: Required provenance fields enforced
- **WHEN** a track is created without `licenseType` (one of `"cc0" | "cc-by" | "epidemic-sound" | "owned-by-koola"`) or `sourceUrl`
- **THEN** the schema rejects the document at validation

#### Scenario: Soft-delete preserves history
- **WHEN** a track is deactivated by admin
- **THEN** `isActive` is set to `false`; the document is NOT hard-deleted; existing stories continue to reference the trackId

### Requirement: Admin-Only Track Management
The system SHALL restrict track creation, editing, and deactivation to users with the admin role.

#### Scenario: Admin adds a track
- **WHEN** an admin calls `POST /moments/music-tracks` with valid metadata and an uploaded `audioKey`
- **THEN** system creates the MusicTrack document, returns HTTP 201

#### Scenario: Non-admin attempts to add a track
- **WHEN** a non-admin caller attempts the endpoint
- **THEN** system returns HTTP 403

#### Scenario: Admin deactivates a track
- **WHEN** admin calls `PATCH /moments/music-tracks/:trackId` with `{ isActive: false }`
- **THEN** system marks the track inactive; the picker no longer surfaces it; existing stories that reference it continue to render with audio (the audio file is retained in MinIO)

#### Scenario: Admin attempts to hard-delete a track
- **WHEN** admin calls `DELETE /moments/music-tracks/:trackId`
- **THEN** system soft-deletes (sets `isActive: false`); the audio file is NOT removed from MinIO

### Requirement: Music Track Search and Browse
The system SHALL provide search and browse endpoints for the composer's music picker.

#### Scenario: Browse trending tracks
- **WHEN** authenticated user calls `GET /moments/music-tracks?sort=trending&limit=20`
- **THEN** system returns up to 20 active tracks sorted by usage count (computed offline; falls back to `addedAt DESC` if no usage data); response contains `{ trackId, title, artist, durationMs, previewKey, licenseType, attribution }`

#### Scenario: Search by query
- **WHEN** user calls `GET /moments/music-tracks?q=Đà Lạt`
- **THEN** system runs a Mongo text search across `title` and `artist`, returns matching active tracks

#### Scenario: Filter by tag
- **WHEN** user calls `GET /moments/music-tracks?tag=acoustic`
- **THEN** system returns active tracks whose `tags` array contains "acoustic"

#### Scenario: Tracks include provenance in response
- **WHEN** any browse/search response is returned
- **THEN** each track includes `licenseType` and `attribution`; the mobile UI displays attribution where required (e.g., CC-BY tracks show the attribution string)

### Requirement: Story-Level Music Reference
The system SHALL allow a story to reference a music track with an optional start offset; the reference does not embed audio data.

#### Scenario: Create story with music
- **WHEN** user creates a story with `{ musicRef: { trackId: "<id>", startMs: 15000 } }`
- **THEN** system validates the trackId references an active track, persists the reference, and includes it in story reads

#### Scenario: Music reference for inactive track
- **WHEN** the referenced trackId points to an inactive track at story creation
- **THEN** system returns HTTP 400 with `"Music track is no longer available"`

#### Scenario: Music reference becomes inactive after story creation
- **WHEN** an admin deactivates a track AFTER stories were created
- **THEN** existing stories continue to play with audio (the audio file is retained); the picker stops surfacing the track for new stories

### Requirement: Compose-at-Playback Player
The mobile story player SHALL render a story by composing the user's video (or image) and the referenced music track as parallel streams synchronized at start time.

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

### Requirement: Music Picker UI
The composer SHALL include a music picker showing trending tracks, search, and per-track preview, with provenance attribution displayed.

#### Scenario: Picker opens with trending list
- **WHEN** user taps the music button in the composer
- **THEN** the picker opens to a "Đang thịnh hành" tab listing active tracks sorted by trending order, each row showing title, artist, duration, and a play preview button

#### Scenario: Preview a track
- **WHEN** user taps the preview button on a track
- **THEN** the picker plays the `previewKey` audio (15-30s preview clip) without selecting it

#### Scenario: Search in picker
- **WHEN** user types in the picker search field
- **THEN** the picker queries `GET /moments/music-tracks?q=<query>` and displays matching tracks

#### Scenario: Confirm track selection with start offset
- **WHEN** user selects a track and adjusts the start offset slider, then taps "Chọn"
- **THEN** the picker returns `{ trackId, startMs }` to the composer; the composer displays the track title and a "Đổi nhạc" button

#### Scenario: CC-BY attribution displayed in picker
- **WHEN** a track has `licenseType: "cc-by"` with non-empty `attribution`
- **THEN** the attribution text is displayed below the track title in the picker

#### Scenario: Empty catalog
- **WHEN** the catalog has no active tracks
- **THEN** the picker shows the empty state "Chưa có nhạc — bạn có thể đăng khoảnh khắc không có nhạc"

### Requirement: Provenance Audit Trail
The system SHALL retain provenance metadata even for deactivated tracks to support license audit at any time.

#### Scenario: Deactivated tracks remain queryable for audit
- **WHEN** an admin queries `GET /moments/music-tracks/:trackId` for any track (active or inactive)
- **THEN** system returns the full document including `licenseType`, `licenseUrl`, `sourceUrl`, `attribution`, `addedBy`, `addedAt`

#### Scenario: Bulk audit export
- **WHEN** an admin calls `GET /moments/music-tracks/audit?format=csv` (admin-only)
- **THEN** system streams a CSV of all tracks with all provenance fields
