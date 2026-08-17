## Why

The app already caches chat media durably (DocumentDir/MediaCache, LRU cap, MMKV index hydrated at boot) and reads messages local-first from SQLite, but seven gaps make it burn mobile data and lag behind Zalo/Telegram: the SQLite database grows without bound (messages never pruned, outbox `done` rows never deleted — ~55k rows/year carrying `payload_json`, confirmed HIGH in `docs/performance-audit-2026-08.md` §4.4 — and no vacuum), Moments stories and music stream presigned MinIO URLs fresh on every view (never entering the media cache), fullscreen video waits for the entire file to download before first frame (10–30 s spinner on 4G), upload temp files accumulate, the media preloader ignores metered networks, and the Storage settings screen shows only a total with no per-type breakdown.

## What Changes

- **NEW** on-device storage maintenance: message pruning (keep 90 days, never fewer than 200 messages per conversation), outbox `done`-row reaper (delete rows older than 24 h), and idle `PRAGMA incremental_vacuum` scheduled at most once per day via `InteractionManager` with a `account_state.last_vacuum_at` marker, so `koola.db` stops growing without bound.
- **NEW** backend story responses expose `mediaKey` (already persisted in `story.schema.ts`), plus `thumbnailKey`/`musicKey` where present, **additive** alongside the existing presigned `mediaUrl` (no breaking change).
- **MODIFIED** Moments viewer and music picker to resolve media through `mediaCacheService.getOrDownload(mediaKey)` (same pipeline as chat media, so stories/music are cached durably and re-viewed offline), falling back to the presigned `mediaUrl` when no `mediaKey` exists (legacy stories).
- **MODIFIED** `VideoPlayerModal` to play progressively on cache miss: stream from the existing presigned GET endpoint `GET /media/:mediaKey` (no auth header needed, which `react-native-video` v6 cannot send) with `bufferConfig`, while a background `getOrDownload` warms the persistent cache for the next play. Cache hit keeps the current `file://` path unchanged.
- **MODIFIED** `mediaUploadService` to unlink its `CacheDir/upload_*` temp file in a `finally` block after upload success or failure.
- **MODIFIED** media preloader to skip preload when data saver is enabled AND the active connection is expensive/metered (`NetInfo.isConnectionExpensive`), honouring the existing MMKV `data_saver` setting.
- **MODIFIED** StorageSettings screen to show a per-type size breakdown (images, video, audio/music, SQLite database) computed from `mediaIndexService.iterate()` grouped by mime prefix with file-extension fallback, plus DB size from `PRAGMA page_count * page_size`.

## Capabilities

### New Capabilities
- `sqlite-storage-maintenance`: bounded on-device database growth — message pruning policy, outbox done-row reaper, and idle incremental vacuum scheduling.

### Modified Capabilities
- `media-cache-persistence`: cache pipeline extended to story media and music; preloader respects metered connections when data saver is on; storage settings expose per-type breakdown.
- `media-message-display`: fullscreen video player supports progressive playback from a presigned URL on cache miss with background cache warming.
- `moments-stories`: story payloads carry stable media keys; viewer resolves story image/video through the persistent media cache with presigned-URL fallback.
- `moments-music-library`: music preview and playback audio resolve through the persistent media cache instead of streaming presigned URLs on every play.
- `message-store-sqlite`: local message store applies a retention policy (90 days, floor of 200 messages per conversation) so the database stays bounded.
- `message-outbox`: completed outbox rows are reaped after 24 h instead of accumulating forever.

## Impact

**Mobile (`ChatApp/`):**
- `src/services/db/`: `messageRepository.ts` (prune), `outboxRepository.ts` (reaper), `dbInit.ts` / `connection.ts` (vacuum pragma + maintenance entry point), new maintenance scheduler module.
- `src/services/media/`: `mediaPreloader.ts` (metered gate), `mediaUploadService.ts` (temp unlink), `mediaIndexService.ts` / `mediaCacheService.ts` (breakdown helpers, story/music reuse).
- `src/components/VideoPlayerModal.tsx` (progressive path), `src/components/moments/MusicPicker.tsx`, `src/screens/moments/MomentViewerScreen.tsx` (cache-backed media), `src/screens/main/StorageSettingsScreen.tsx` (breakdown UI).

**Backend (`chat-backend/`):**
- `src/moments/moments.service.ts` (+ DTOs): include `mediaKey`/`thumbnailKey`/`musicKey` in story response payloads, additive; presigned `mediaUrl` retained for backward compatibility.
- `GET /media/:mediaKey` presigned endpoint is consumed as-is (no change expected).

**Out of scope:**
- Native image decode cache (FastImage / nitro-image) and FTS local search — deferred P3 work.
- No REST contract changes beyond additive story fields; upload flow unchanged except temp cleanup.

**Checks:** ChatApp `tsc` 0 err / `eslint` 0 err / jest no regression (~878 baseline); backend build 0 err / jest no regression (262 baseline).
