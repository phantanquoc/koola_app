# Design

## Context

See proposal.md — Why and Scope Boundary.

What the admin music surface looks like today:

- Music handlers live inline in `chat-backend/src/admin/admin-moderation.controller.ts` (~lines 1300–1420): `GET /music-tracks` hardcodes `{ isActive: true }`, `sort({ addedAt: -1 })`, and has no filters; `POST` writes `dto.audioKey` straight through with no storage check; `PATCH` spreads the whole DTO with `$set`; `DELETE` sets `isActive: false` and always audits.
- The controller is one class holding five domains (conversations, messages, stories, reports, music) with no music-specific spec file.
- Admin web `MusicCatalogPage.tsx` (313 lines) is on the `admin-web/DESIGN.md` §9 known-debt list: `PageHeader` instead of `ListHeader`, `useState` filters, manual `load()` in effects, no detail route, and a free-text `audioKey` field.
- Shared storage: `media/minio-client.ts` exports `minioClient`, `getMinioPublicClient()`, `BUCKET` (`chat-media`). Objects already live under prefixes `uploads/<userId>/` and `thumbnails/<userId>/`; seeded music uses a bare `music/` prefix. No bucket-level config changes are needed to add a prefix.
- **The shared `/media/upload` path cannot be reused for catalog audio.** It writes a `Media` row with `messageId: null`; `MediaCleanupService` marks every `messageId: null` row deleted after 24h and `MediaCronService` then deletes the object from MinIO after 30 days. A track's audio is never attached to a message, so going through `/media/upload` would silently destroy the catalog a month later.
- `music-metadata` is not installed; `ffmpeg` is not in `infra-local/backend/Dockerfile` (`node:20-alpine`, no extra `apk add`).
- Everything in this change reads and writes fields that `MusicTrack` already has: `title, artist, durationMs, audioKey, previewKey, licenseType, licenseUrl, sourceUrl, attribution, addedBy, addedAt, isActive, usageCount, tags`.

## Goals / Non-Goals

**Goals:**

- Close the "row whose audio does not exist" hole.
- Store audio in the shared MinIO bucket under a music-only prefix; keep MongoDB timing-safe by storing keys only.
- Let an admin hear a track from the list and from the detail page — this is the review acceptance criterion.
- Every catalog operation reachable and shareable from the admin UI, with no fake controls.
- A license-clearance export.
- Audit each real state change exactly once.

**Non-Goals (binding — these belong to other owners):**

- Any schema field, index, or migration.
- `chat-backend/src/moments/**` or `ChatApp/**`.
- Ingestion, fingerprinting, trending windows, `musicRef` on stories/posts, and the 10s/28s segment rule — all in `moments-music-clips`. Preview clipping is not deferred, it is rejected: the segment is a playback bound, never a file.
- Adding `ffmpeg` or any media binary. Duration comes from `music-metadata`; a real 30s preview clip is deferred.
- Changing `chat-backend/src/media/**` or the `/media/*` contract.
- Removing or deprecating the legacy `/moments/music-tracks*` writes.

## Decisions

### D1. A dedicated `chat-backend/src/admin/music/` slice, not a bigger moderation controller

Move the five music handlers out of `admin-moderation.controller.ts` into a new `AdminMusicController` + `AdminMusicService`, registered in `admin.module.ts` alongside the other admin controllers. Route prefix stays `/admin/music-tracks` because `admin-web/AGENTS.md` rule 7 and the existing audit vocabulary are built around it.

Rationale: stats, export, storage signing, and duration parsing have nothing to do with message moderation, and the current class is 1400 lines. Alternative — keep extending the moderation controller — rejected; it has no music test file today, which is exactly how the verified-create hole survived.

### D2. Route order: static segments before `:id`

`GET /admin/music-tracks/stats` and `GET /admin/music-tracks/export` MUST be declared before `GET /admin/music-tracks/:id`. This is the same trap that hit `conversations/export` in `admin-conversations-redesign`. A jest test asserts `GET /music-tracks/stats` returns a stats object (not 404), so a later refactor that reorders handlers fails loudly.

### D2b. `q` is a case-insensitive regex, not `$text`

`MusicTrack` carries a text index (`title`, `artist`, `default_language: 'none'`), but `$text` matches whole words: `q=Scot` finds nothing while an admin staring at "Scott Buckley" expects a hit. The admin API already searches with `escapeRegExp` + `RegExp(q, 'i')` in `searchMessages`, so the catalog list does the same, on `$or: [{title}, {artist}]`. Cost is a collection scan bounded by catalog size (10 rows today); if the catalog reaches a size where that hurts, the upgrade is a normalised lowercase field or Atlas Search — not a `$text` index that silently ignores partial words.

### D3. Create verifies storage, derives duration, and writes `previewKey = audioKey`

`AdminMusicService.create`:

1. `statObject(BUCKET, audioKey)` — missing → 400 `"Audio chưa được tải lên — hãy upload file trước"`, no row, no audit. MinIO unreachable → 503 `"Không kiểm tra được kho lưu trữ — thử lại sau"`; the two cases are distinguishable by status and message.
2. `getObject(BUCKET, audioKey)` into a buffer (size already known from step 1, capped at 100 MB) → `audio-metadata.readDurationMs(buffer, mimeType)` → milliseconds. Parse failure → 400 `"Không đọc được file âm thanh"`, no row.
3. Write the row with `previewKey: audioKey`.

Why `statObject` and not a `media` collection lookup: the catalog no longer writes a media row at all (D3b), and `statObject` proves the bytes are there in one round-trip on a low-frequency admin action.

Why not `ffmpeg`: clipping a preview needs a binary the image does not have, **and cutting is not what the product wants**. Review settled the rule: everyone hears the whole track; the 10s (story) / 28s (post) limit is a segment played by the client, implemented in `moments-music-clips` as `musicRef.lengthMs`. Writing `previewKey = audioKey` keeps `previewKey` non-null (it is `required: true`) and both existing fallbacks (`t.previewKey ?? t.audioKey`, `t.previewKey ? presign(...) : audioUrl`) transparently play the full object. Cost: a preview stream is the whole file — which is the accepted behaviour, not a debt.

One consequence to keep visible: the seeded `music/previews/*-30s.mp3` keys in `seed-music-tracks.ts` are stale names for objects that were never uploaded. New tracks get `previewKey = audioKey`; the seed is corrected or replaced when the 10 rows are re-uploaded.

Timing safety: `statObject` gives the size before reading, and the parser runs on a buffer capped at the same 100 MB limit, so an oversized or hostile file is refused before it can exhaust memory. The two failure modes the review flagged (APEv2 allocation, ID3v2 size) are both fixed in 11.x — see D3c for why the version matters.

### D3b. Catalog audio gets its own presign, not `/media/upload`

New `POST /admin/music-tracks/upload-url` → `{ uploadUrl, audioKey, expiresAt }`, signing a 15-minute PUT for key `music-catalog/<uuid>.<ext>` in the existing `chat-media` bucket. No `Media` row is written.

The trap this avoids: `/media/upload` creates a `Media` doc with `messageId: null`, and two daily crons act on exactly that shape — `MediaCleanupService.cleanupOrphanUploads` flips `deleted: true` after 24h, `MediaCronService.cleanupOrphanedMedia` removes the object from MinIO after 30 days. Reusing it means the catalog's audio disappears a month after upload while the DB row still claims a playable track. Adding `conversationId`/`messageId` hacks to dodge the cron would be worse: it would make catalog audio look like message media to the cleanup path.

Implementation: `admin/music/music-storage.service.ts` wraps `getMinioPublicClient().presignedPutObject` + `minioClient.statObject` + `minioClient.getObject`, so the admin slice owns its storage lifecycle and `chat-backend/src/media/**` stays untouched.

Extension allow-list `mp3|wav|ogg|m4a|aac` and MIME `audio/mpeg|audio/wav|audio/ogg|audio/mp4|audio/aac`; anything else → 400 before signing. Magic-byte verification is not repeated here — the object is fetched and parsed by `music-metadata` on create, which fails closed on a non-audio file, and the file never leaves the bucket. Cap 100 MB, same as the shared endpoint.

### D3c. `music-metadata@11.16.1`, isolated behind a one-function wrapper

Every published version is ESM-only from v8 upward. Three facts, each measured rather than assumed:

| Kiểm tra | Kết quả |
|---|---|
| `npm audit` | v7–v10: 1 high + 1 moderate — APEv2 uncontrolled allocation, ID3v2 size unvalidated, **ASF/MP4 parser infinite loop (synchronous, uncatchable)**. v11.16.1: 0 |
| `require('music-metadata')` on `node:20-alpine` | **Works** (Node 20.19+ `require(esm)`), returns `parseBuffer` |
| Same inside `jest` 30 + `ts-jest` (CJS transform) | **Fails** — `Must use import to load ES Module`; and `await import()` fails with `A dynamic import callback was invoked without --experimental-vm-modules` |

So: **v11.16.1**, not v7. A DoS that hangs the event loop is not acceptable even on an admin-only path — one malformed upload would freeze every socket in the process.

The cost of v11 is that jest cannot load it. That is paid once, by confining it to `admin/music/audio-metadata.ts`:

```ts
// The only file that imports music-metadata. Everything else mocks this module.
export async function readDurationMs(buf: Buffer, mimeType: string): Promise<number> {
  const mm = await import('music-metadata');  // ESM-only dep, dynamic from CJS
  const meta = await mm.parseBuffer(buf, { mimeType });
  if (!meta.format.duration) throw new Error('Không đọc được thời lượng');
  return Math.round(meta.format.duration * 1000);
}
```

Verified end to end: compiled with this repo's `tsconfig` and run on `node:20-alpine` against a generated WAV → returned `3000` ms for a 3-second file. In jest, `jest.mock('./audio-metadata')` makes every service spec pass because the module is never resolved.

Because jest cannot execute it, **the wrapper's real behaviour is verified by a runnable script, not a unit test** — see task 3.5. Every other spec mocks the wrapper and must not try to parse real audio.

Common-tag extraction (`common.artist`, `common.title`) is deliberately **not** pre-filled into the form — the admin types provenance by hand, and a tag-guessed artist would land in the license export as if it were verified. A comment in the wrapper records this so it is not "helpfully" re-enabled.

### D4. PATCH is an explicit allow-list, not a spread

The current `$set: dto` accepts anything the DTO validator allows, including `audioKey` and license fields — which silently rewrites legal provenance. The new `UpdateMusicTrackDto` exposes only `title`, `artist`, `tags`, `attribution`, `isActive`; the service additionally rejects a body containing any of `audioKey`, `fingerprint` (if present), `sourceUrl`, `licenseType`, `licenseUrl`, `addedBy`, `addedAt` with 400 rather than dropping it silently — a caller that tries should learn, not guess.

`isActive` is editable through PATCH for the restore case, but the dedicated `POST /:id/restore` and `DELETE /:id` are the paths the UI uses, so the audit vocabulary stays meaningful.

### D5. Idempotent lifecycle mutations

`DELETE`: read current state first; if already inactive, return 200 without writing an audit row. `POST /:id/restore`: mirrored. Both follow the same `matchedCount`-style reasoning documented in `pullPin` (`conversations.service.ts`): a mutation that changed nothing must not claim to have changed something.

### D6. Export returns `{ data, total, truncated }`, cap 5000, always includes inactive

The admin API returns JSON; the browser turns it into the CSV file. This follows the two admin exports that already exist (`GET /admin/conversations/export`, `GET /admin/conversations/:id/export` both return `{ data, total, truncated }`, and `ConversationsPage` builds the blob with a BOM so Excel reads Vietnamese correctly).

Rejected alternative — streaming `text/csv` from Nest (`moments.controller.ts#auditMusicTracks` does this): that endpoint sits on the public `moments` controller and is consumed by a different client; making the admin path stream would mean the web app could no longer reuse `apiClient` (Bearer refresh, 403 redirect) for the download. Consistency with the admin contract wins, and the CSV shaping code already exists to copy.

Cap at 5000 rows; when the catalog exceeds the cap, `truncated: true` — an export that silently drops rows is worse than no export for a clearance record.

### D7. Presigned URLs are fetched per play, never per render

`GET /admin/music-tracks/:id` presigns on every call. The list response deliberately does **not** carry presigned URLs: a 20-row page would fire 40 presigns to render a table nobody plays from.

Audition from the list is a separate, explicit act: the row's play button calls `GET /admin/music-tracks/:id` once and hands the URL to a single shared `<audio>` element. Clicking another row replaces the source (one audio element, one playing track, ~one presign per click). The detail page fetches on mount and re-fetches once when playback errors (expiry), the same retry shape `ConversationDetail` uses.

`GET /:id` is therefore used by both surfaces and stays the single source of presigned playback URLs — no second endpoint, no batch presign.

**The `/media/download/*` proxy cannot serve catalog audio.** `MediaService.getObjectStream` starts with `mediaModel.findOne({ mediaKey })` and 404s when there is no `Media` row — which is exactly the state catalog audio is in by design (D3b). Presigned GET is the only playback path. Nobody should "fix" a playback failure by pointing the player at the proxy.

**Dev prerequisite, not a code concern:** the presigned GET host comes from `MINIO_PUBLIC_HOST`, which must be reachable *from the browser*. `chat-backend/.env` currently sets `MINIO_PUBLIC_HOST=192.168.2.100`; on this machine `localhost:9000` refuses and that LAN address times out. Playback in the admin UI will not work in dev until that value points at an address the browser can reach (`localhost:9000` for a same-machine browser). Task 6.2 begins by fixing this, because otherwise "nghe thử được trên web" — the acceptance criterion — cannot be demonstrated.

### D8. Admin web: rebuild on the existing kit

`MusicCatalogPage.tsx` gets the §9 treatment:

- `useUrlFilters({ status: 'active', q: '', license: '', sort: 'addedAt:desc', page: '1', pageSize: '20' })`
- `useAdminList(['music', ...params], '/admin/music-tracks', mapped)` and a `useMusicStats()` hook invalidated by every mutation
- `ListHeader` + `StatusTabs` + `FilterPopover` + `ColumnHeader` + `Pagination` + `StateBlock`/`EmptyState`
- Row click → `navigate('/music/' + id, { state: { from: pathname + search } })`
- A leading play column (`MusicRowPlayer`) — the audition affordance; it does not navigate.

`MusicDetail` copies the `detail-card` skeleton from `UserDetail`/`ConversationDetail`: header (title, artist, badges) → audio player → editable fields with busy-guarded save → read-only provenance → per-track audit → bottombar (deactivate/restore).

`mediaAdminApi.uploadCatalogAudio` is a sibling of `uploadImage` in `commerceApi.ts`, but posts to `/admin/music-tracks/upload-url`: `accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac"`, 100 MB client guard, returns the key only after the PUT succeeds.

### D9. Audit vocabulary

Add `restore_music_track` to `ADMIN_AUDIT_ACTIONS` with a Vietnamese label in `admin-web/src/components/audit-labels.ts`. `create/update/delete_music_track` keep their existing names and `music_track` target type. No new target types.

## Risks / Trade-offs

- **`statObject` + the parse make create depend on MinIO and on the file actually being audio** → create fails where today it would "succeed" into a broken row. Accepted, that is the point. Both failures return 400 with distinct messages and write nothing.
- **The fetch-on-create costs one full object read** → up to 100 MB per create, held in memory long enough to parse. That is the same ceiling the shared media endpoint already enforces and create is a low-frequency admin act. If it ever hurts, the upgrade is a `Range` read of the first ~256 KB (MP3/OGG headers sit at the front) — not needed for a catalog of short tracks.
- **`previewKey = audioKey` means the picker streams the full file as "preview"** → fine for short catalogue tracks, wasteful for a 10-minute file. The upgrade path is `ffmpeg` preview clipping, already tracked as the deferred item.
- **`music-metadata@11.16.1` is ESM-only, so jest cannot import it** → paid once by confining the dependency to one wrapper module; everything else mocks the wrapper. Upgrading the backend to ESM would remove the constraint, not a requirement for this change.
- **v7 would have been simpler but ships a high-severity DoS** — three separate parsers hang or over-allocate on malformed input; one is a synchronous infinite loop. Accepted the jest friction instead. Re-check on every dependency bump: `npm audit` on this package is part of the checklist.
- **`PATCH` narrows an existing contract** → any caller patching `durationMs` or `previewKey` today breaks with 400. Grep shows only `MusicCatalogPage.tsx` calls it, and it is rewritten in this change.
- **Create no longer accepts `durationMs` from the client** → a client that sends it now gets 400 under `forbidNonWhitelisted`. Only the admin web creates tracks.
- **List still returns no presigned URLs** → noted so nobody "helpfully" adds them later and turns a list page into dozens of presigns.
- **Cap of 5000 on export** → a larger catalog needs paging, which the export explicitly announces rather than hides.
- **Rebuilding the page risks losing behaviour** → the current page's only behaviour is CRUD; the design keeps all five actions (create/edit/deactivate) and adds detail, restore, filters, export, upload. Verified against the live page in task 8.2.
- **Verification cost with no real audio in dev** → the seeded `music/*` objects may be absent from MinIO, so the live pass uploads one small MP3 through the real flow. Noted in task 8.2 so "no audio file handy" does not silently skip the upload path.

## Migration Plan

No data migration. Deploy order:

1. Backend: `music-metadata@11.16.1` added, new controller + service + storage service + audio wrapper registered; music handlers removed from the moderation controller in the same commit so the paths are never served twice.
2. Admin web: rebuilt page + detail route (the old page cannot coexist, it is replaced).
3. Rollback: revert the commit — the only persisted change is `isActive` flags, audit rows, and any objects written under `music-catalog/`, all reversible (objects are garbage, the UI never lists a track without a DB row).

## Open Questions

None blocking. Two deferred, both needing `ffmpeg`:

- Deriving a real 30s `previewKey` clip on upload instead of aliasing the full object.
- Backfilling `durationMs` for the 10 seeded tracks whose objects may not exist in MinIO at all.
