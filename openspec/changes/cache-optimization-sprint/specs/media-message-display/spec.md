## ADDED Requirements

### Requirement: Fullscreen Video Plays Progressively on Cache Miss

The fullscreen video player SHALL begin playback while the media is still downloading when the file is not yet in the persistent cache, instead of waiting for a complete download. When the file is already cached, the player SHALL use the cached local file unchanged.

#### Scenario: Cached video plays from local file

- **GIVEN** the video `mediaKey` is present in the media index and the file exists on disk
- **WHEN** the user opens the fullscreen player
- **THEN** the player SHALL mount the video with the `file://` URI from the cache
- **AND** playback SHALL start without any network download

#### Scenario: Uncached video streams progressively from a presigned URL

- **GIVEN** the video `mediaKey` is not in the cache
- **WHEN** the user opens the fullscreen player
- **THEN** the player SHALL obtain a presigned GET URL for the `mediaKey` (no custom auth header required)
- **AND** SHALL mount the video against that URL with buffering configured so playback begins at the player's buffer threshold before the full file is downloaded

#### Scenario: Background warm populates the cache for repeat plays

- **GIVEN** the player opened an uncached video via the progressive presigned path
- **WHEN** playback starts
- **THEN** a background `getOrDownload(mediaKey)` SHALL run fire-and-forget to write the file into the persistent cache
- **AND** a subsequent open of the same video SHALL hit the cached `file://` path

#### Scenario: Progressive stream failure falls back to full download

- **GIVEN** the presigned progressive stream errors before or during playback
- **WHEN** the player detects the error
- **THEN** the player SHALL fall back to the existing full-download-then-play path
- **AND** SHALL surface the existing error/retry UI if the fallback also fails
