## MODIFIED Requirements

### Requirement: Compose-at-Playback Player
The mobile story player SHALL render a story by composing the user's video (or image) and the referenced music track as parallel streams synchronized at start time. When a story carries a `musicRef`, the viewer mounts a hidden audio-only `react-native-video` instance that plays the track's audio, seeks to `startMs` on load, and pauses/resumes in lockstep with the story; the viewer renders the music attribution pill for that story. The audio source SHALL be resolved through the persistent media cache (`getOrDownload(musicKey)`) when a `musicKey` is available, falling back to the track's presigned `audioUrl` when no key is present or the cached file is unavailable.

#### Scenario: Image story with music
- **WHEN** the player opens an image story with `musicRef`
- **THEN** the player displays the image for 5 seconds (default image duration), plays the music audio starting at `startMs`, then auto-advances; the audio pauses on swipe-down dismiss

#### Scenario: Video story with music
- **WHEN** the player opens a video story with `musicRef`
- **THEN** the player runs `react-native-video` muted for the user's video and a parallel hidden audio player on the music track seeked to `startMs`; both respond to the same paused state

#### Scenario: Music audio resolved from cache on repeat play
- **WHEN** the player opens a story whose `musicRef` `musicKey` is already in the media cache
- **THEN** the hidden audio player SHALL use the cached `file://` URI without a network request
- **AND** a first play with an uncached `musicKey` SHALL download into the persistent cache so repeats are instant

#### Scenario: Music track unavailable at playback
- **WHEN** the player attempts to load the music audio and both the cache lookup and the presigned/network fallback fail
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

## ADDED Requirements

### Requirement: Music Picker Previews Resolve Through the Cache

The Moments music picker SHALL resolve track preview audio through the persistent media cache when a stable `musicKey`/preview key is available, so repeated previews do not re-stream the presigned URL each time.

#### Scenario: Cached preview plays from disk

- **GIVEN** a track's preview key is already in the media cache
- **WHEN** the user previews the track in the picker
- **THEN** the preview SHALL play from the cached `file://` URI without a network request

#### Scenario: Uncached preview downloads and caches

- **GIVEN** a track's preview key is not yet cached
- **WHEN** the user previews the track
- **THEN** the picker SHALL download via `getOrDownload` into the persistent cache
- **AND** a subsequent preview of the same track SHALL load from disk
