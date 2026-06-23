# moments-music-library Specification

## Purpose
TBD - created by archiving change moments-feature. Update Purpose after archive.
## Requirements
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

### Requirement: Provenance Audit Trail
The system SHALL retain provenance metadata even for deactivated tracks to support license audit at any time.

#### Scenario: Deactivated tracks remain queryable for audit
- **WHEN** an admin queries `GET /moments/music-tracks/:trackId` for any track (active or inactive)
- **THEN** system returns the full document including `licenseType`, `licenseUrl`, `sourceUrl`, `attribution`, `addedBy`, `addedAt`

#### Scenario: Bulk audit export
- **WHEN** an admin calls `GET /moments/music-tracks/audit?format=csv` (admin-only)
- **THEN** system streams a CSV of all tracks with all provenance fields

