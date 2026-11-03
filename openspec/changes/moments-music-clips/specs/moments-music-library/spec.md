# Spec Delta

## MODIFIED Requirements

### Requirement: Story-Level Music Reference

The system SHALL allow a story to reference a music track with a start offset and a segment length; the reference stores no audio data. `musicRef` SHALL be `{ trackId, startMs, lengthMs }`.

#### Scenario: Create story with music

- **WHEN** user creates a story with `{ musicRef: { trackId: "<id>", startMs: 15000, lengthMs: 10000 } }`
- **THEN** system validates the trackId references an active track, validates the segment fits the track, persists the reference, and includes it in story reads

#### Scenario: Segment longer than the story bound is rejected

- **WHEN** a story creation sends `lengthMs` greater than 10000
- **THEN** the system SHALL return 400 naming the 10-second limit, and SHALL NOT create the story

#### Scenario: Segment past the end of the track is rejected

- **WHEN** `startMs + lengthMs` exceeds the track's `durationMs` beyond a 500 ms rounding tolerance
- **THEN** the system SHALL return 400 and SHALL NOT create the story

#### Scenario: Zero or negative length is rejected

- **WHEN** `lengthMs` is `0` or negative
- **THEN** the system SHALL return 400; removing music is expressed as `musicRef: null`, not as a zero-length segment

#### Scenario: Legacy reference without a length reads as 10 seconds

- **WHEN** a stored story's `musicRef` has `startMs` but no `lengthMs`
- **THEN** the read response SHALL present `lengthMs: 10000`, so existing stories keep their music under the new bound

#### Scenario: Music reference for inactive track

- **WHEN** the referenced trackId points to an inactive track at story creation
- **THEN** system returns HTTP 400 with `"Music track is no longer available"`

#### Scenario: Music reference becomes inactive after story creation

- **WHEN** an admin deactivates a track AFTER stories were created
- **THEN** existing stories continue to play with audio (the audio file is retained); the picker stops surfacing the track for new stories

### Requirement: Compose-at-Playback Player

The mobile story player SHALL render a story by composing the user's media and the referenced music track as parallel streams synchronized at start time. The music SHALL play only `[startMs, startMs + lengthMs)` and SHALL NOT loop; when the segment ends, the story media's own audio SHALL become audible again. The audio source SHALL be the track's presigned `audioUrl`; catalog audio SHALL NOT be routed through the message-media cache proxy.

#### Scenario: Image story with music

- **WHEN** the player opens an image story with `musicRef`
- **THEN** the player displays the image for 10 seconds, plays the music starting at `startMs`, stops it after `lengthMs`, then auto-advances; the audio pauses on swipe-down dismiss and there is no original audio to resume

#### Scenario: Video story with music

- **WHEN** the player opens a video story with `musicRef`
- **THEN** the player runs `react-native-video` muted for the user's video and a parallel hidden audio player on the music track seeked to `startMs`; both respond to the same paused state

#### Scenario: Segment stops and original audio resumes

- **WHEN** the player opens a 14-second video story whose `musicRef` is `{ startMs: 0, lengthMs: 10000 }`
- **THEN** the music plays for the first 10 seconds with the video muted, and at 10 seconds the music stops and the video's own audio is unmuted for the remaining 4 seconds

#### Scenario: Music does not loop

- **WHEN** a story's media is longer than the music segment
- **THEN** the music stops at the end of the segment and does not restart or repeat for the remainder of the story

#### Scenario: Music audio resolved from cache on repeat play

- **WHEN** the player opens a story or post whose catalog music was played before on this device
- **THEN** it SHALL play from the local `file://` copy keyed by `music:<trackId>` without any network request

#### Scenario: First play caches under a stable key

- **WHEN** the player plays catalog music for the first time on a device
- **THEN** it SHALL download the presigned `audioUrl`, store it under `music:<trackId>`, and count it toward the device cache's audio category
- **AND** a later presign of the same object SHALL NOT create a second cache entry, because the cache key is the track id rather than the signed URL

#### Scenario: Catalog music does not use the message-media proxy

- **WHEN** the player resolves catalog music
- **THEN** it SHALL NOT call `/media/download/:key` for that track, since catalog audio has no `Media` row and that route would 404; no music-related `Non-200` cache log SHALL be produced

#### Scenario: Music track unavailable at playback

- **WHEN** the player attempts to load the music audio and the presigned/network request fails
- **THEN** the player drops the audio track silently and continues playing the story without music, and SHALL NOT leave the story media muted

#### Scenario: Pause and resume

- **WHEN** the user holds-to-pause on the story
- **THEN** both the story media and the audio pause; on release the image progress timer resumes from the remaining time (not from zero) and audio resumes without restarting the segment

#### Scenario: Story without music

- **WHEN** the story has no `musicRef`
- **THEN** the player plays the video with its native audio (if any) or the image with no audio, and no audio player is mounted

#### Scenario: Music attribution pill rendered when a story has music

- **WHEN** the viewer renders a story whose `musicRef` resolves to an active track
- **THEN** the music attribution pill ("🎵 Title · Artist") is rendered; for stories without a resolvable track the pill is not shown

### Requirement: Music Picker UI

The composer SHALL include a music picker showing trending tracks, search, and per-track preview, with provenance attribution displayed. The "Thêm nhạc" entry-point opens the picker; the user SHALL be able to choose any segment of a track by scrubbing the whole track, bounded by the surface's maximum segment length, and selecting a track sets `musicRef = { trackId, startMs, lengthMs }` on the story or post. The backend browse/search and single-track read endpoints SHALL return presigned playback URLs so the picker can preview audio and the viewer can play it back.

#### Scenario: Composer shows the music picker entry

- **WHEN** the composer is in the preview step
- **THEN** the "Thêm nhạc" row is rendered and tapping it opens the `MusicPicker` modal

#### Scenario: Selecting a track sets musicRef on the story

- **WHEN** the user selects a track and confirms a segment
- **THEN** the composer holds `musicRef = { trackId, startMs, lengthMs }` and includes it in the creation request body; clearing the selection sends no `musicRef`

#### Scenario: Single-track read returns presigned playback URLs

- **WHEN** a client calls `GET /moments/music-tracks/:id`
- **THEN** the response includes presigned `audioUrl` (the full track) and `previewUrl`, valid ~1 hour, in addition to the track metadata

#### Scenario: Browse/search responses carry a presigned preview URL

- **WHEN** a client calls `GET /moments/music-tracks` (browse or search)
- **THEN** each track in the response includes a presigned `previewUrl` (falling back to the full audio object when no dedicated preview key exists) so the picker can preview without exposing raw MinIO keys

#### Scenario: Backend endpoints remain available

- **WHEN** an admin client calls `GET /moments/music-tracks`, `POST /moments/music-tracks`, or related endpoints
- **THEN** the endpoints continue to function as previously specified

#### Scenario: Preview plays the whole track

- **WHEN** the user taps a track's preview control before choosing a segment
- **THEN** the player SHALL stream the track from the beginning so the user can hear what they are choosing from

#### Scenario: Scrub to choose the segment

- **WHEN** the user selects a track and drags the start slider
- **THEN** the slider range SHALL span the whole track (`0 … durationMs - lengthMs`), the chosen window SHALL be shown as `start – end (length)`, and starting the preview SHALL play that window and stop at its end

#### Scenario: Segment length is capped per surface

- **WHEN** the picker is opened from the story composer
- **THEN** the segment length SHALL be 10 seconds
- **WHEN** the picker is opened from the post composer
- **THEN** the segment length SHALL be 28 seconds
