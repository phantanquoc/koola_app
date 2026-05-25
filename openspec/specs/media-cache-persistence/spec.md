# media-cache-persistence Specification

## Purpose

Provides a persistent, MMKV-backed media cache index for the mobile app. Ensures that media files downloaded in any prior session are available synchronously on the first render frame after a process restart, eliminating Blurhash placeholder flashes for previously-seen content. The cache lives under `DocumentDir/MediaCache` (OS-durable, not cleared by system "Clear cache"), is bounded by a 1 GB LRU cap, and deduplicates concurrent downloads for the same key.

This capability owns the cache infrastructure that `media-message-display` consumes via `mediaCacheService`.

> **Storage backend:** the index uses `react-native-mmkv@^3.3.3`, which reads synchronously from mmap-backed files. v3 was selected over v2 because v2's bridge install path is incompatible with React Native New Architecture (Fabric + TurboModules), which is enabled in this project. v4 was rejected because it adds a `react-native-nitro-modules` peer dependency without changing the read semantics relevant to this capability. The in-memory `indexMap` mirror is hydrated synchronously at module-import time so `getFromMemory()` returns hits on the very first render frame after a process restart.

## Requirements

### Requirement: Persistent Media Cache Index

The mobile app SHALL maintain a persistent index of cached media files that survives process restarts and operating-system cache pressure.

#### Scenario: Index loads at app boot before any chat screen renders

- **WHEN** the React Native app starts
- **THEN** `mediaIndexService.load()` SHALL populate the in-memory index map before the first chat screen renders its first frame
- **AND** the load operation SHALL complete in under 50 milliseconds for indexes containing up to 5,000 entries

#### Scenario: getFromMemory returns synchronously after a process restart

- **GIVEN** a media file with mediaKey K was successfully downloaded in any prior session
- **AND** the user has killed and relaunched the app
- **WHEN** a component calls `getFromMemory(K)` during the first render frame after launch
- **THEN** the call SHALL return a `file://...` URI without performing any asynchronous I/O
- **AND** the returned URI SHALL point to a file inside the persistent cache directory

#### Scenario: Index entries survive process restart

- **GIVEN** a media file with mediaKey K was downloaded in a previous session and an index entry was written
- **WHEN** the user kills and relaunches the app
- **THEN** the entry for K SHALL be retrievable via `mediaIndexService.get(K)`
- **AND** the entry SHALL contain `path`, `size`, `addedAt`, and `lastAccess` fields

#### Scenario: Corrupted index data does not crash the app

- **GIVEN** the MMKV entry that backs the media index contains malformed JSON
- **WHEN** `mediaIndexService.load()` is called at boot
- **THEN** the in-memory map SHALL be initialized empty
- **AND** the app SHALL NOT throw or crash
- **AND** the cache SHALL rebuild organically as files are re-downloaded

### Requirement: Persistent Storage Location

The mobile app SHALL store cached media in a directory that the operating system does not automatically clear under storage pressure or system "Clear cache" actions.

#### Scenario: New downloads land under DocumentDir/MediaCache

- **WHEN** `getOrDownload(mediaKey)` successfully downloads a file
- **THEN** the file SHALL be written under `${BlobUtil.fs.dirs.DocumentDir}/MediaCache/...`
- **AND** the file SHALL NOT be written anywhere under `${BlobUtil.fs.dirs.CacheDir}/`

#### Scenario: Disk path mirrors the mediaKey structure

- **GIVEN** a mediaKey of the form `uploads/<userId>/<uuid>.<ext>`
- **WHEN** the file is cached on disk
- **THEN** the local path SHALL be `${DocumentDir}/MediaCache/uploads/<userId>/<uuid>.<ext>`
- **AND** the only character substitutions performed SHALL be on FS-illegal characters (`:`, `?`, `*`, `"`, `<`, `>`, `|`)
- **AND** the path separator `/` SHALL be preserved

#### Scenario: Parent directories are created recursively before write

- **GIVEN** the target file path includes intermediate directories that do not yet exist
- **WHEN** `getOrDownload` writes the file
- **THEN** all parent directories SHALL be created automatically
- **AND** the write SHALL succeed without an `ENOENT` error

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

### Requirement: Concurrent Download Deduplication

The mobile app SHALL ensure that simultaneous requests for the same uncached mediaKey trigger only one network download.

#### Scenario: Two components request the same uncached key in the same frame

- **GIVEN** mediaKey K is not present in the index
- **WHEN** components A and B both call `getOrDownload(K)` within the same frame
- **THEN** only one HTTP download SHALL be issued
- **AND** both calls SHALL resolve to the same `file://...` URI
- **AND** both calls SHALL fail together if the underlying download fails

#### Scenario: Pending entry is cleared on settle

- **GIVEN** an in-flight download for mediaKey K is registered
- **WHEN** the download promise resolves or rejects
- **THEN** the entry for K SHALL be removed from the in-flight map before the next call
- **AND** subsequent `getOrDownload(K)` calls SHALL be free to start a new download if needed

### Requirement: Stale Entry Self-Healing

The mobile app SHALL recover gracefully when an index entry references a file that no longer exists on disk.

#### Scenario: getOrDownload detects a missing file behind an index hit

- **GIVEN** `mediaIndexService.get(K)` returns an entry pointing to a path
- **AND** the file at that path no longer exists on disk
- **WHEN** `getOrDownload(K)` is called
- **THEN** the entry for K SHALL be removed from the index
- **AND** the file SHALL be re-downloaded
- **AND** a new index entry SHALL be written on success

#### Scenario: Image render hits a stale entry

- **GIVEN** `getFromMemory(K)` returned a `file://` URI from a stale index entry
- **WHEN** the `<Image>` component fails to load that URI and triggers `onError`
- **THEN** `invalidateKey(K)` SHALL remove the entry and any disk artifact
- **AND** the component's existing retry path SHALL re-fetch via `getOrDownload(K)`

### Requirement: Public API Stability

The mobile app SHALL preserve the existing public API of `mediaCacheService` so that consumer components continue to work without modification.

#### Scenario: Existing exports remain available

- **WHEN** any existing consumer (`MediaImage`, `VideoMessage`, `UserAvatar`, `VideoPlayerModal`, `ConversationListScreen`, `mediaUploadService`, `FileAttachment`, `useMessages`) imports from `mediaCacheService`
- **THEN** the exported names `getFromMemory`, `getOrDownload`, `invalidateKey`, `clearCache`, and `warmMemoryCache` SHALL continue to exist
- **AND** their function signatures SHALL be backward compatible

#### Scenario: warmMemoryCache becomes a safe no-op

- **WHEN** `warmMemoryCache(keys)` is called by any caller
- **THEN** the call SHALL resolve without error
- **AND** it SHALL NOT perform any disk I/O
- **AND** the function SHALL exist solely to preserve the import contract until callers stop importing it

### Requirement: Configurable Media Cache Cap

The mobile app SHALL expose the media cache size cap as a user setting accessible from a Storage screen, with a defined default and bounds.

#### Scenario: Default cap on first install

- **GIVEN** the app is freshly installed
- **WHEN** the Storage screen is opened for the first time
- **THEN** the cap SHALL be 5 GB (configurable default; bounds 1 GB <= cap <= 20 GB)

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
