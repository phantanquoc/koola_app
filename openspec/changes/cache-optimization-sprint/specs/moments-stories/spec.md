## ADDED Requirements

### Requirement: Story Payloads Carry Stable Media Keys

The backend story read responses SHALL include the persisted `mediaKey` for the story's media, plus `thumbnailKey` and `musicKey` where stored, in addition to the existing presigned `mediaUrl`. The presigned `mediaUrl` SHALL be retained for backward compatibility. No existing field SHALL be removed.

#### Scenario: Story response includes mediaKey alongside presigned URL

- **GIVEN** a story with a persisted `mediaKey` is fetched by an authorized viewer
- **WHEN** the story read endpoint returns the story payload
- **THEN** the payload SHALL contain `mediaKey` equal to the persisted key
- **AND** SHALL still contain `mediaUrl` as a presigned GET URL
- **AND** SHALL contain `thumbnailKey` and `musicKey` when those references exist on the story

#### Scenario: Legacy story without a media key keeps working

- **GIVEN** a story record has no persisted `mediaKey`
- **WHEN** the story read endpoint returns the payload
- **THEN** `mediaKey` SHALL be absent or null
- **AND** `mediaUrl` SHALL still be a valid presigned URL so older clients render it unchanged

### Requirement: Story Viewer Resolves Media Through the Persistent Cache

The mobile Moments story viewer SHALL resolve story image and video media through the persistent media cache (`getOrDownload(mediaKey)`) when a `mediaKey` is present, so re-viewed stories load from disk and are available offline. When no `mediaKey` is present, the viewer SHALL fall back to the presigned `mediaUrl`.

#### Scenario: Cached story media loads from disk

- **GIVEN** the viewer opens a story whose `mediaKey` is already in the media cache
- **WHEN** the media renders
- **THEN** the image/video SHALL load from the cached `file://` URI without a network request

#### Scenario: Uncached story media downloads and caches

- **GIVEN** the viewer opens a story with a `mediaKey` not yet cached
- **WHEN** the media renders
- **THEN** the viewer SHALL download via `getOrDownload(mediaKey)` into the persistent cache
- **AND** a subsequent view of the same story SHALL load from disk

#### Scenario: Story without mediaKey falls back to presigned URL

- **GIVEN** the viewer opens a story with no `mediaKey`
- **WHEN** the media renders
- **THEN** the viewer SHALL use the presigned `mediaUrl` directly (existing behavior)
