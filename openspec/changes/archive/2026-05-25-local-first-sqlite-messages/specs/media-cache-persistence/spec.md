## MODIFIED Requirements

### Requirement: LRU Eviction

The mobile app SHALL prevent unbounded cache growth by evicting least-recently-used files once total cached size exceeds a configured cap. The cap SHALL be user-configurable from the app's Settings screen and SHALL default to 5 GB.

#### Scenario: Eviction triggers after a download exceeds the cap

- **GIVEN** total cached file size is at or above the configured cap (default 5 GB)
- **WHEN** `getOrDownload` completes a new successful download
- **THEN** `evictIfNeeded(cap)` SHALL run
- **AND** files SHALL be removed in ascending `lastAccess` order
- **AND** removal SHALL continue until total cached size drops below 80 % of the cap

#### Scenario: Each eviction removes both the on-disk file and its index entry

- **WHEN** the eviction loop selects a file for removal
- **THEN** the file SHALL be unlinked from disk
- **AND** its entry SHALL be removed from the in-memory map
- **AND** its entry SHALL be removed from the persisted MMKV payload

#### Scenario: lastAccess updates are debounced per key

- **WHEN** `getFromMemory(K)` returns a hit
- **THEN** the entry's `lastAccess` SHALL be scheduled for update
- **AND** at most one persisted write per key SHALL occur within any 5-second window

#### Scenario: User changes the cap from Settings

- **GIVEN** the user opens Settings → Storage and adjusts the cap to a new value V (within an allowed range, e.g. 1 GB to 20 GB)
- **WHEN** the change is committed
- **THEN** the new cap SHALL persist across launches
- **AND** the next eviction pass SHALL use V
- **AND** if total cached size already exceeds V, eviction SHALL run immediately to fall below 80 % of V

## ADDED Requirements

### Requirement: Configurable Media Cache Cap

The mobile app SHALL expose the media cache size cap as a user setting accessible from a Storage screen, with a defined default and bounds.

#### Scenario: Default cap on first install

- **GIVEN** the app is freshly installed
- **WHEN** the Storage screen is opened for the first time
- **THEN** the cap SHALL be 5 GB (configurable default; bounds 1 GB ≤ cap ≤ 20 GB)

#### Scenario: Storage screen displays usage

- **WHEN** the user opens the Storage screen
- **THEN** the screen SHALL display the current cap, the total bytes used, and a "Clear cache" action
- **AND** the values SHALL refresh on screen focus

### Requirement: Socket-Driven Media Preload

The mobile app SHALL preload media files referenced by incoming `new_message` socket events into the persistent cache, before the user scrolls to the corresponding message, so that media renders without a network call when the user reaches it.

#### Scenario: Image media is preloaded on receipt

- **GIVEN** ChatScreen for conversation C is in foreground
- **WHEN** a `new_message` event arrives carrying an image media key K not yet cached
- **THEN** the preloader SHALL enqueue a download for K with low priority
- **AND** the download SHALL respect the LRU cap and eviction rules
- **AND** the preload SHALL NOT block UI rendering of the message

#### Scenario: Background conversation also benefits when feasible

- **GIVEN** ChatScreen is NOT in foreground but the app is foreground
- **WHEN** a `new_message` event arrives for any conversation the user is a member of
- **THEN** the preloader MAY download small media (size < a configurable threshold, e.g. 2 MB) opportunistically
- **AND** large media SHALL only be preloaded for the active conversation

#### Scenario: Preload respects user's data-saver preference

- **GIVEN** the user has enabled a data-saver toggle (or is on a metered/cellular connection if exposed)
- **WHEN** a preload candidate appears
- **THEN** the preloader SHALL skip the download
- **AND** the file SHALL still be fetched on-demand when the user opens the message
