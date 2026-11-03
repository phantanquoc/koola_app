# Proposal

## Why

`/music` is one of the last admin pages still on a hand-rolled layout, and its data path is unsafe: an admin types a MinIO key into a form, nothing verifies the object exists, and the list can only show active tracks newest-first. The result today is a 10-row catalog where every track has `usageCount = 0`, no moderator can find a track by anything but scrolling, and there is no way to produce a license-clearance record.

## What Changes

- **Admin list rebuilt** to the standard admin list archetype: server-side search (title/artist), lifecycle tabs (all/active/inactive) with counts from a stats endpoint, license filter, allow-listed sort, page-size selection, and CSV export of the full catalog including inactive tracks.
- **New admin endpoints** under the existing `/admin/music-tracks` prefix: `GET /stats`, `GET /export`, `GET /:id` (detail with freshly presigned playback URLs), `POST /:id/restore`, `POST /upload-url` (presigned PUT into the `music-catalog/` folder), and an allow-listed `PATCH` that refuses immutable fields.
- **Audio lives in MinIO, the database stores only the key** — the same project bucket (`chat-media`), a dedicated `music-catalog/` prefix. No binary, no base64, no data URL ever reaches MongoDB; the only catalog record is the `MusicTrack` row whose `audioKey` points at the object.
- **Dedicated presign, not the shared `/media/upload`** — the media endpoint writes a `Media` row with `messageId: null`, which `MediaCleanupService` marks deleted after 24h and `MediaCronService` deletes from MinIO after 30 days. Catalog audio has no message behind it and would be silently destroyed. The music slice therefore signs its own PUT and writes no `Media` row.
- **Create verifies storage and reads the audio** — `POST /admin/music-tracks` stat's the `audioKey`, parses the object with `music-metadata` to derive `durationMs` server-side, and rejects a key with nothing behind it. **BREAKING (admin client contract)** a made-up key no longer creates a row, and `durationMs` is no longer accepted from the client.
- **No preview cut on upload** — `previewKey` is written equal to `audioKey`. This is the intended end state, not a shortcut: review requires that admins and users hear the **whole** track when choosing, with the 10s (story) / 28s (post) bound applied as a playback segment by `moments-music-clips` — never as a separate file. `ffmpeg` is therefore not needed at all.
- **Deactivate becomes idempotent and reversible** — repeated `DELETE` writes no second audit entry, and `POST /:id/restore` brings a track back.
- **`/music/:id` detail route** — play the track from a fresh presigned URL, edit metadata with busy-guarded save, preview the license document, deactivate/restore, and read the per-track audit trail. The list additionally plays any row **on demand** (one presign per click, never per render) so a moderator can audition the catalog without leaving the page.

## Scope Boundary (binding)

This change touches **only** `chat-backend/src/admin/**` and `admin-web/**`.

Explicitly **out of scope**, deferred to separate changes owned by other people:

- Any change to the `MusicTrack` schema, indexes, or a data migration. (`previewKey` is `required` today, so create writes `previewKey = audioKey`; that is a value, not a schema change.)
- `chat-backend/src/moments/**` (picker reads, search, story/post `musicRef`, trending).
- `ChatApp/**` (mobile composer, picker paging, post music) — the mobile test-device pass is the manager's, after this change ships.
- Catalog ingestion (provider import, audio fingerprint dedupe, UGC original sounds). **Preview derivation is not deferred — it is not wanted**: the segment bound lives in `moments-music-clips` as `musicRef.lengthMs`, and every surface plays the full object.
- The 10s/28s segment rule, post music, and `IMAGE_DURATION_MS` — owned by `moments-music-clips`, which touches `moments/**` and `ChatApp/**`. Listed here so nobody assumes they were dropped.
- Changing the shared `/media/*` contract or `MediaService` behaviour. The new presign lives in the admin music slice so message media keeps its orphan-cleanup lifecycle untouched.
- The legacy `/moments/music-tracks*` write endpoints are left untouched (no 410, no removal).

## Acceptances From Review (chốt với quản lý)

| Điểm | Cách thực hiện trong change này |
|---|---|
| Dùng thư viện đề xuất (không chạy `ffmpeg`) | `music-metadata@11.16.1` đọc `durationMs` từ object đã upload. Bản 7–10 vẫn CJS nhưng `npm audit` báo high: một parser treo vô hạn (đồng bộ, không catch được) → không dùng. Bản 11 là ESM-only nên chỉ được import trong **một** file wrapper `admin/music/audio-metadata.ts`, phần còn lại mock wrapper đó |
| Nhạc lưu ở MinIO, DB chỉ lưu key | Object vào bucket sẵn có `chat-media`, prefix `music-catalog/`; Mongo chỉ có `audioKey`/`previewKey`, không byte nào vào DB |
| Dùng chung MinIO, tách folder riêng | Prefix `music-catalog/` nằm cạnh `uploads/`, `thumbnails/` trong cùng bucket — không bucket mới, không hạ tầng mới |
| Đẩy list lên web, nghe thử được trên web | `/music` có nút nghe từng dòng (presign theo click), `/music/:id` có player đầy đủ cho cả bản đầy đủ lẫn preview |
| Test thiết bị do quản lý làm sau | Không có task mobile trong change; backend giữ nguyên shape `/moments/music-tracks*` để app cũ không vỡ |

## Capabilities

### New Capabilities

- `music-catalog-admin`: admin-only catalog API — filtered/sorted/paginated listing with server-side stats, single-track read with presigned playback, catalog-scoped presigned upload into `music-catalog/`, verified create that derives duration from the stored object, allow-listed metadata update, idempotent deactivate/restore, provenance export.
- `music-catalog-workbench`: the admin web surfaces — `/music` list per the admin list archetype with on-demand audition, and `/music/:id` detail route with playback, upload-on-create, metadata edit, deactivate/restore, per-track audit.

### Modified Capabilities

- `admin-moments-moderation`: the music-track CRUD described there is superseded by `music-catalog-admin` (new list/detail/stats/export/restore endpoints, verified create, allow-listed patch). Story takedown and audience lists are unchanged.

## Impact

- **Backend (admin only)** — new `chat-backend/src/admin/music/` (`admin-music.controller.ts`, `admin-music.service.ts`, `music-storage.service.ts`, `audio-metadata.ts`, DTOs), music handlers removed from `admin-moderation.controller.ts`, `admin.module.ts` registration, `admin/schemas/admin-audit-log.schema.ts` (`restore_music_track`), `admin-web/src/components/audit-labels.ts` labels, one new dependency `music-metadata@11.16.1`.
- **Frontend (admin only)** — `admin-web/src/pages/MusicCatalogPage.tsx` rebuilt, new `pages/MusicDetailPage.tsx` + `components/MusicDetail.tsx` + `components/MusicRowPlayer.tsx`, `App.tsx` route, `mediaAdminApi.uploadCatalogAudio` in `commerceApi.ts`.
- **Data** — reads and writes existing `musictracks` fields only. No migration, no new collection, no new index. New MinIO prefix `music-catalog/` inside the existing `chat-media` bucket.
- **Untouched** — `ChatApp/**`, `chat-backend/src/moments/**`, `chat-backend/src/media/**` (the shared upload/orphan-cleanup lifecycle), Docker image (no `ffmpeg`), and any mobile-facing response shape.
- **Docs** — `admin-web/AGENTS.md` `/music` row + API catalogue; drop the `MusicCatalogPage` entry from `admin-web/DESIGN.md` §9 known-debt list.
- **Tests** — backend jest for the new endpoints (guards, 404s, idempotency, immutable-field rejection, export cap); admin-web vitest for URL↔params, upload-then-create, detail playback/edit/deactivate/restore.
