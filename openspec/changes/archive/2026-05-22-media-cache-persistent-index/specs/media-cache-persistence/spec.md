## ADDED Requirements

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

- **GIVEN** the MMKV storage entry that backs the media index contains malformed JSON
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

The mobile app SHALL prevent unbounded cache growth by evicting least-recently-used files once total cached size exceeds a configured cap.

#### Scenario: Eviction triggers after a download exceeds the cap

- **GIVEN** total cached file size is at or above the 1 GB cap
- **WHEN** `getOrDownload` completes a new successful download
- **THEN** `evictIfNeeded(1 GB)` SHALL run
- **AND** files SHALL be removed in ascending `lastAccess` order
- **AND** removal SHALL continue until total cached size drops below 80 % of the cap (~800 MB)

#### Scenario: Each eviction removes both the on-disk file and its index entry

- **WHEN** the eviction loop selects a file for removal
- **THEN** the file SHALL be unlinked from disk
- **AND** its entry SHALL be removed from the in-memory map
- **AND** its entry SHALL be removed from MMKV

#### Scenario: lastAccess updates are debounced per key

- **WHEN** `getFromMemory(K)` returns a hit
- **THEN** the entry's `lastAccess` SHALL be scheduled for update
- **AND** at most one MMKV write per key SHALL occur within any 5-second window

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
