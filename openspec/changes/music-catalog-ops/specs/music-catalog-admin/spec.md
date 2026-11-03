## Purpose

Admin-only API surface for curating the Koola music catalog: a filtered/sorted/paginated listing with server-side stats, single-track reads with presigned playback, a catalog-scoped presigned upload that puts audio in the shared MinIO bucket under a `music-catalog/` prefix, a create path that only accepts audio that actually exists in storage and derives its duration from the stored bytes, allow-listed metadata edits, idempotent deactivate/restore, and a provenance export usable as a license-clearance record. The database stores storage keys only — never audio bytes. It reads and writes only the fields the catalog already has.

## ADDED Requirements

### Requirement: Catalog listing with server-side filtering and stats

The system SHALL expose `GET /admin/music-tracks` returning `{ data, total, page, limit }` where every filter and sort is applied server-side and rows carry `title`, `artist`, `durationMs`, `licenseType`, `isActive`, `usageCount`, `addedAt`, `audioKey`, and `previewKey`.

#### Scenario: Filter by lifecycle tab

- **WHEN** an admin calls `GET /admin/music-tracks?status=inactive`
- **THEN** the response SHALL contain only tracks with `isActive: false`; `status=active` SHALL return only `isActive: true`
- **WHEN** `status` is absent or `all`
- **THEN** both active and inactive tracks SHALL be returned

#### Scenario: Filter by license

- **WHEN** an admin calls `GET /admin/music-tracks?licenseType=cc-by`
- **THEN** only tracks with that license type SHALL be returned, and the filter SHALL combine with `status` and `q` as an AND condition

#### Scenario: Search by title or artist

- **WHEN** an admin calls `GET /admin/music-tracks?q=Scot`
- **THEN** the server SHALL match `title` and `artist` case-insensitively on the substring, so a partial word returns the tracks containing it
- **WHEN** `q` contains regex metacharacters (`.` `*` `(` `[`)
- **THEN** they SHALL be treated as literal characters and SHALL NOT change the query's meaning or raise a server error

#### Scenario: Allow-listed sorting

- **WHEN** an admin calls `GET /admin/music-tracks?sort=usageCount:desc` (or `addedAt|title|usageCount` × `asc|desc`)
- **THEN** results SHALL be ordered by that key and direction, and a `sort` value outside the allow-list SHALL be rejected with 400 rather than ignored

#### Scenario: Pagination bounds

- **WHEN** `limit` exceeds 100 or is below 1
- **THEN** the server SHALL reject with 400, and no response SHALL ever carry more than 100 rows

#### Scenario: Stats for tab counts

- **WHEN** an admin calls `GET /admin/music-tracks/stats`
- **THEN** the response SHALL return counts for `all`, `active`, `inactive`, and each `licenseType` value, computed over the same filter semantics as the list endpoint, and the route SHALL resolve to stats rather than being captured by `:id`

### Requirement: Single-track read with presigned playback

The system SHALL expose `GET /admin/music-tracks/:id` returning the full document including provenance fields and freshly presigned `audioUrl` and `previewUrl` valid for one hour, for any track regardless of active state.

#### Scenario: Inactive track remains readable for audit

- **WHEN** an admin reads a track with `isActive: false`
- **THEN** the full document and both presigned URLs SHALL be returned, so provenance can be inspected after deactivation

#### Scenario: Unknown track

- **WHEN** an admin reads an id that does not exist
- **THEN** the system SHALL return 404

#### Scenario: URLs are not cached

- **WHEN** the same track is read twice
- **THEN** each response SHALL carry URL valid for one hour, freshly signed per request; presigned URLs SHALL NOT be persisted in the database

### Requirement: Catalog audio upload is presigned into a dedicated folder

The system SHALL expose `POST /admin/music-tracks/upload-url` returning a presigned PUT URL for an object under the `music-catalog/` prefix of the shared media bucket, accepting only audio MIME types, and SHALL NOT create a `Media` record for catalog audio.

#### Scenario: Presign for a supported audio type

- **WHEN** an admin calls `POST /admin/music-tracks/upload-url` with `{ filename, mimeType: "audio/mpeg", size }`
- **THEN** the response SHALL contain `uploadUrl`, an `audioKey` beginning with `music-catalog/`, and `expiresAt`, and the URL SHALL accept a direct PUT of the bytes for the stated duration

#### Scenario: Shared bucket, separate folder

- **WHEN** any catalog audio is uploaded
- **THEN** the object SHALL live in the same bucket as message media under the `music-catalog/` prefix, and no new bucket SHALL be created

#### Scenario: Non-audio and oversize rejected before signing

- **WHEN** the request carries a `mimeType` outside `audio/mpeg|audio/wav|audio/ogg|audio/mp4|audio/aac`, or `size` above the 100 MB cap
- **THEN** the system SHALL return 400 and SHALL NOT issue a presigned URL

#### Scenario: Catalog audio is not message media

- **WHEN** a presigned upload is issued for catalog audio
- **THEN** no `Media` record SHALL be written, so the orphan-media cleanup jobs that act on `Media` rows SHALL NOT treat catalog audio as garbage

#### Scenario: Only keys are stored

- **WHEN** a track is created after upload
- **THEN** the database SHALL contain storage keys (`audioKey`, `previewKey`) and no binary payload, base64 string, or data URL SHALL be accepted in any request body

#### Scenario: Upload is admin-only

- **WHEN** a non-admin requests an upload URL
- **THEN** the system SHALL return 403

### Requirement: Create requires audio that exists in storage and derives its duration

The system SHALL create a track only when the supplied `audioKey` resolves to an object in storage, SHALL read that object to derive `durationMs` server-side, and SHALL refuse a `durationMs` supplied by the client.

#### Scenario: Create with a real object

- **WHEN** an admin uploads through the presign endpoint and then calls `POST /admin/music-tracks` with the returned key plus `title`, `artist`, `licenseType`, `licenseUrl`, and `sourceUrl`
- **THEN** the system SHALL verify the object exists, read its duration from its audio header, record `addedBy` and `addedAt`, write an audit entry, and return HTTP 201 with the derived `durationMs`

#### Scenario: Preview alias

- **WHEN** a track is created
- **THEN** `previewKey` SHALL be written equal to `audioKey`, so playback paths that prefer `previewKey` still resolve to a real object

#### Scenario: Reject a key with no object behind it

- **WHEN** an admin calls `POST /admin/music-tracks` with an `audioKey` that has no corresponding object in storage
- **THEN** the system SHALL return 400 and SHALL NOT create a catalog row or an audit entry

#### Scenario: Reject a file that is not audio

- **WHEN** the object behind `audioKey` cannot be parsed as audio
- **THEN** the system SHALL return 400 with a message naming the file as unreadable, and SHALL NOT create a catalog row

#### Scenario: Client-supplied duration refused

- **WHEN** a create body contains `durationMs`
- **THEN** the system SHALL reject the request with 400 rather than silently ignoring the field

#### Scenario: Required provenance enforced

- **WHEN** a create request omits `licenseType`, `licenseUrl`, or `sourceUrl`, or supplies a `licenseType` outside the enum
- **THEN** the system SHALL reject with 400 without writing to the database

#### Scenario: Attribution required for CC-BY

- **WHEN** an admin creates a `cc-by` track with an empty `attribution`
- **THEN** the system SHALL return 400 explaining that attribution is required for that license

### Requirement: Allow-listed metadata update and idempotent deactivate/restore

The system SHALL expose `PATCH /admin/music-tracks/:id` limited to `title`, `artist`, `tags`, `attribution`, and `isActive`, plus `DELETE /admin/music-tracks/:id` (deactivate) and `POST /admin/music-tracks/:id/restore` (reactivate); every state change SHALL be audited exactly once.

#### Scenario: Edit metadata

- **WHEN** an admin patches `title`, `artist`, `tags`, or `attribution`
- **THEN** only those fields SHALL change and an audit entry `update_music_track` SHALL be written

#### Scenario: Immutable fields are refused

- **WHEN** a patch body includes `audioKey`, `previewKey`, `durationMs`, `sourceUrl`, `licenseType`, `licenseUrl`, `addedBy`, or `addedAt`
- **THEN** the system SHALL reject the request with 400 rather than silently ignore the field

#### Scenario: Deactivate is soft and idempotent

- **WHEN** an admin calls `DELETE /admin/music-tracks/:id`
- **THEN** `isActive` SHALL become `false`, the audio object SHALL remain in storage, existing references SHALL keep resolving, and an audit entry `delete_music_track` SHALL be written
- **WHEN** the same call is repeated on an already-inactive track
- **THEN** the system SHALL return success without writing a second audit entry

#### Scenario: Restore

- **WHEN** an admin calls `POST /admin/music-tracks/:id/restore`
- **THEN** `isActive` SHALL become `true` and an audit entry `restore_music_track` SHALL be written; restoring an already-active track SHALL be a no-op with no second audit entry

#### Scenario: Non-admin blocked

- **WHEN** a non-admin calls any endpoint in this capability
- **THEN** the system SHALL return 403

### Requirement: Provenance export

The system SHALL expose `GET /admin/music-tracks/export` returning `{ data, total, truncated }` for every track — active and inactive — with `title`, `artist`, `durationMs`, `licenseType`, `licenseUrl`, `sourceUrl`, `attribution`, `addedBy`, `addedAt`, `isActive`, capped at 5000 rows with `truncated: true` when the cap is hit.

#### Scenario: Export includes inactive tracks

- **WHEN** an admin exports the catalog
- **THEN** rows for deactivated tracks SHALL be present, so the export can serve as a license-clearance record

#### Scenario: Export declares truncation

- **WHEN** the catalog exceeds the row cap
- **THEN** the response SHALL carry `truncated: true` beside the row count, instead of silently returning a short list

#### Scenario: Export is admin-only

- **WHEN** a non-admin calls the export endpoint
- **THEN** the system SHALL return 403
