## Purpose

The admin web surfaces for the music catalog: a dense, URL-shareable `/music` list where an operator can hear any track without leaving the page, and a `/music/:id` detail route where they can hear it in full, upload a file instead of typing a storage key, fix its metadata, and retire or restore it — every control backed by a real endpoint.

## ADDED Requirements

### Requirement: Music list follows the admin list archetype

The `/music` route SHALL render the standard admin list structure (list header with count, status tabs, filter row, dense table, pagination) with search, filters, sort, page, and page size persisted in the URL, so a moderator can share a filtered view.

#### Scenario: Filter state survives reload and sharing

- **WHEN** an admin sets `?status=inactive&q=lofi&sort=usageCount:desc&page=2` and reloads
- **THEN** the page SHALL restore exactly that tab, search, sort, and page, and the copied URL SHALL open the same view for another admin

#### Scenario: Tab counts come from the server

- **WHEN** the list renders its tabs
- **THEN** each tab's count SHALL come from `GET /admin/music-tracks/stats`, not from counting the loaded page client-side

#### Scenario: Empty versus filtered-empty

- **WHEN** the catalog has no tracks at all
- **THEN** the page SHALL show an empty state with a "Thêm track" action
- **WHEN** filters are active and return nothing
- **THEN** the page SHALL show a different message offering to clear the filters

#### Scenario: Row opens the detail route

- **WHEN** an admin activates a row
- **THEN** the app SHALL navigate to `/music/:id` and the back control SHALL return to the list with the same filter state

#### Scenario: Technical values are translated

- **WHEN** the table renders a row
- **THEN** `licenseType` SHALL be shown as a Vietnamese label, duration as `m:ss`, and usage as a formatted number — no raw enum, millisecond, or storage-key value in the row

### Requirement: Any row can be auditioned without leaving the list

The list SHALL let an admin hear a track on demand, requesting playback URLs only for the row the admin asks to play.

#### Scenario: Play a row

- **WHEN** an admin activates a row's play control
- **THEN** the page SHALL fetch `GET /admin/music-tracks/:id` once and play the returned URL in a single shared audio element, showing which row is playing
- **AND** activating play on another row SHALL stop the previous one and replace the source rather than starting a second playback

#### Scenario: Rendering the list presigns nothing

- **WHEN** the list renders — including after paging, searching, or changing filters
- **THEN** no presigned-URL request SHALL be made until an admin plays a row

#### Scenario: Expired URL while playing

- **WHEN** playback fails because the presigned URL expired
- **THEN** the page SHALL re-request that single track once and resume, and a repeated failure SHALL surface an error instead of looping

### Requirement: Track detail supports playback, edit, and lifecycle actions

The `/music/:id` detail route SHALL let an admin play the track, preview the license document, edit the allow-listed metadata, deactivate, and restore. Replacing the audio of an existing track is out of scope for this change and the route SHALL NOT offer it.

#### Scenario: Play the track inline

- **WHEN** the detail page opens
- **THEN** it SHALL request a fresh presigned URL from `GET /admin/music-tracks/:id` (not reuse one held in list state) and render an audio player for the track
- **AND** until real 30s previews exist, the preview and full-track URLs point at the same object, and the page SHALL NOT present a separate "preview" player that would play identical audio

#### Scenario: Presigned URL expiry handled

- **WHEN** playback fails because the presigned URL expired or was rejected
- **THEN** the page SHALL re-request the track and offer a retry instead of failing silently

#### Scenario: Upload on create

- **WHEN** an admin creates a track from the page's "Thêm track" dialog
- **THEN** the admin SHALL pick an audio file, the client SHALL request a presigned PUT from `POST /admin/music-tracks/upload-url`, upload the bytes directly to MinIO, and create the track with the returned key — the form SHALL NOT offer a free-text storage-key field nor a duration field

#### Scenario: Duration is not asked for

- **WHEN** the create dialog renders
- **THEN** it SHALL NOT expose a `durationMs` input, because the server derives the duration from the uploaded file, and the row's duration SHALL appear after creation

#### Scenario: Upload progress and failure

- **WHEN** an upload is in progress
- **THEN** the create action SHALL be disabled and progress SHALL be visible
- **WHEN** the upload fails or the create call fails after upload
- **THEN** the track SHALL NOT be created, the error SHALL be shown with a retry, and no orphan catalog row SHALL be left behind

#### Scenario: Edit metadata

- **WHEN** an admin edits title, artist, tags, or attribution and saves
- **THEN** only changed fields SHALL be submitted, the save SHALL be busy-guarded against double submit, a toast SHALL confirm, and the page SHALL reload the track

#### Scenario: Immutable fields are not editable

- **WHEN** the detail page renders
- **THEN** the storage key, source URL, license type and license URL, added-by, and added-at SHALL be shown read-only (or behind "Chi tiết kỹ thuật"), never as inputs

#### Scenario: Deactivate is confirmed and reversible

- **WHEN** an admin deactivates a track
- **THEN** a confirmation SHALL state that the track leaves the user-facing catalog but stays in storage, and after success the page SHALL show the inactive state with a "Khôi phục" action

#### Scenario: Per-track activity

- **WHEN** the detail page renders
- **THEN** it SHALL show the audit entries for this track resolved to readable Vietnamese labels

### Requirement: Catalog UI never presents a dead control

Every control on `/music` and `/music/:id` SHALL perform a real action against a real endpoint; anything not yet implemented SHALL be absent rather than displayed as disabled or decorative.

#### Scenario: No placeholder buttons

- **WHEN** any button, link, or menu item is rendered on these routes
- **THEN** activating it SHALL produce a network request with an observable result or navigate to a real route

#### Scenario: Errors are surfaced

- **WHEN** a list load, detail load, or mutation fails
- **THEN** the page SHALL show an error state with a retry (list/detail) or a toast with the failure reason (mutation), and SHALL NOT swallow the error silently
