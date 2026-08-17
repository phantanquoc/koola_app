## ADDED Requirements

### Requirement: Preloader Respects Metered Connections Under Data Saver

The media preloader SHALL skip background preload of incoming image/video media when the data saver setting is enabled AND the active network connection is expensive or metered. When data saver is disabled, preload behavior across all networks SHALL remain unchanged.

#### Scenario: Preload skipped on metered connection with data saver on

- **GIVEN** the user has data saver enabled in settings
- **AND** `NetInfo` reports the active connection as expensive/metered (`isConnectionExpensive === true`)
- **WHEN** a `new_message` socket event arrives carrying an image or video `mediaKey` not yet cached
- **THEN** the preloader SHALL NOT enqueue a download for that key

#### Scenario: Preload proceeds on unmetered connection with data saver on

- **GIVEN** the user has data saver enabled
- **AND** the active connection is not expensive (`isConnectionExpensive === false`)
- **WHEN** a `new_message` event arrives with an uncached image/video `mediaKey`
- **THEN** the preloader SHALL enqueue the download as today

#### Scenario: Data saver off keeps current behavior on all networks

- **GIVEN** the user has data saver disabled
- **WHEN** a `new_message` event arrives with an uncached image/video `mediaKey`
- **THEN** the preloader SHALL enqueue the download regardless of whether the connection is metered

#### Scenario: Network state changes are observed live

- **GIVEN** the preloader is wired after login
- **WHEN** the device switches between metered and unmetered networks
- **THEN** the preloader's gate decision SHALL reflect the current `NetInfo` state without requiring an app restart

### Requirement: Per-Type Storage Breakdown

The storage settings surface SHALL present a per-category breakdown of cache usage so the user can see how much space images, video, audio/music, and the SQLite database each consume, in addition to the existing total-used vs cap meter.

#### Scenario: Breakdown groups cached media by category

- **GIVEN** the media index contains entries with mime types and/or file extensions
- **WHEN** the storage settings screen renders
- **THEN** it SHALL display separate sizes for image, video, and audio categories
- **AND** categorization SHALL use the entry `mime` prefix (`image/`, `video/`, `audio/`) when present
- **AND** when `mime` is absent, categorization SHALL fall back to the file extension (`.jpg/.png/.webp` → image, `.mp4/.mov/.webm` → video, `.mp3/.m4a/.wav` → audio)

#### Scenario: SQLite database size is reported separately

- **WHEN** the storage settings screen renders
- **THEN** it SHALL display the on-device SQLite database size computed from `PRAGMA page_count * PRAGMA page_size`
- **AND** this value SHALL be shown as a distinct row from the managed media cache total

#### Scenario: Breakdown reflects current index state

- **GIVEN** the user clears the cache or eviction runs
- **WHEN** the storage settings screen re-renders
- **THEN** the per-category totals SHALL update to match the current in-memory index
