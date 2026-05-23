## Context

The mobile app already has a working media pipeline: messages reference `mediaKey`s in MinIO, and `ChatApp/src/services/media/mediaCacheService.ts` provides a download-and-cache layer that all media-rendering components consume through three functions: `getFromMemory(mediaKey)` (sync URI lookup), `getOrDownload(mediaKey)` (async download with retry), and `invalidateKey(mediaKey)` (cleanup).

Today the cache lives in two layers:
- An in-memory `Map<string, string>` (`memoryCache`, module-scope) — synchronous lookup, but reset on every process restart.
- A flat directory `${BlobUtil.fs.dirs.CacheDir}/media-cache` with filename `cacheKeyFromMediaKey(mediaKey)` that replaces `/\\:?*"<>|` with `_` (irreversible).

Two consequences make the on-restart UX flash:
1. After a process restart the in-memory map is empty; `getFromMemory` returns `null` on first render so `MediaImage`/`VideoMessage` initialize with `imageReady: false` and render the Blurhash placeholder before any disk lookup happens.
2. The "warm-up" path that re-populates the map (`warmMemoryCache`) runs *after* `setMessages` in `useMessages.ts` (lines 91-101 and ~285-291), so the very first render frame still sees an empty map.

In addition, files under `CacheDir` can be evicted by the OS or by the user via "Clear cache" in system settings, so the cache may evaporate even between two consecutive launches.

The goal is to behave like Telegram/Zalo: anything previously seen reappears instantly, with no Blurhash flash, and the cache is durable across process and system events.

## Goals / Non-Goals

**Goals:**
- `getFromMemory(mediaKey)` returns a `file://` URI synchronously on the first render after a process restart, for any key downloaded in any prior session.
- The on-disk cache survives process restart, OS storage pressure, and system-level "Clear cache" actions (it should only be removed on uninstall, manual user clear, or LRU eviction).
- Cache size is bounded (1 GB cap) with predictable eviction.
- Concurrent requests for the same key collapse to a single network download.
- Public API of `mediaCacheService` (`getFromMemory`, `getOrDownload`, `invalidateKey`, `clearCache`, `warmMemoryCache`) is preserved so the eight consumer files do not need to change.

**Non-Goals:**
- Migrating the legacy cache at `${CacheDir}/media-cache` (the filename mapping is irreversible; users re-download once after the update).
- Exposing cache settings to the user (cap UI, manual clear, etc.) — out of scope; the cap is a hard-coded constant.
- Setting `NSURLIsExcludedFromBackupKey` for iCloud — accepted that cache files may be backed up.
- Changing upload-side temp directory (`mediaUploadService.ts`) — that is a separate concern.
- Range requests, progressive video playback, or server-side video thumbnailing.

## Decisions

### 1. MMKV-only as the index DB (no SQLite)

Cache size in practice is hundreds to a few thousand entries. JS `Array.sort` for LRU runs in a few ms at that scale, and MMKV's mmap load completes in under 5 ms even for thousands of entries. Adding SQLite to gain `ORDER BY lastAccess` is unnecessary cost: MMKV already qualifies as an embedded KV database (mmap-backed, atomic write).

**Alternatives considered**: `react-native-sqlite-storage` and `op-sqlite`. Both rejected — they double the native-dep footprint without delivering anything we cannot do in JS at this scale.

### 2. MMKV v3, not v2 or v4 (revised post-implementation)

**Originally specified v2**, then revised to v3 during implementation after a v2 build attempt failed against this project's New Architecture (Fabric + TurboModules) configuration. The revised reasoning:

- `react-native-mmkv@^3.x` requires React Native ≥ 0.74 and the New Architecture (TurboModules) — both already true in this project (RN 0.76.9, `newArchEnabled=true` in `android/gradle.properties`).
- v2's autolink path is *incompatible* with New Architecture in practice; the v2 install attempt was reverted (commit reset on 2026-05-23).
- v4 requires `react-native-nitro-modules` as an additional native dependency. v3 uses TurboModules natively without Nitro — fewer native pieces to install for the same outcome.
- v3 reads remain synchronous (mmap-backed), so the "synchronous-first-frame" goal is preserved.

Pinned to `^3.3.3`. The original v2 reasoning in earlier drafts is preserved here for historical context but should not guide future work.

### 3. Cache directory: `DocumentDir/MediaCache`

| Option | Pros | Cons |
|---|---|---|
| `CacheDir` (current) | Simple | OS may clear under storage pressure or via "Clear cache" — fails the persistence goal |
| `LibraryDir` (iOS) / `getFilesDir()` (Android) | Persistent, hidden from user, official "app private data" location | Requires `NSURLIsExcludedFromBackupKey` to keep iCloud quota sane; more configuration surface |
| `DocumentDir` ★ chosen | Persistent, OS will not clear, simple | Allowed in iCloud backup (acceptable at 1 GB); on iOS may appear in Files app *only* if the app sets `UISupportsDocumentBrowser` — KOOLA does not, so files remain hidden |

`BlobUtil.fs.dirs.DocumentDir` is the cross-platform handle.

### 4. Path-mirror disk layout, not hashed filenames

Backend already emits `mediaKey` of the form `uploads/<userId>/<uuid>.<ext>` — already path-safe. Mirroring directly (`${DocumentDir}/MediaCache/uploads/<userId>/<uuid>.<ext>`) keeps the mapping reversible: a future cleanup script or debug session can read a file path and reconstruct the mediaKey. Sanitization is limited to FS-illegal characters (`:?*"<>|`) — `/` is intentionally preserved.

**Alternative considered**: SHA-1 of the mediaKey. Rejected because it loses reversibility for negligible gain.

### 5. Skip migration of the legacy cache

The legacy filename `cacheKeyFromMediaKey(mediaKey)` replaces `/` with `_`, which is not invertible (multiple distinct mediaKeys can produce the same filename). Migrating would require either guessing a mapping or reading every legacy file's contents to recompute identity — both impractical. Decision: leave the legacy directory untouched (the OS will eventually clear it). Users re-download each item once after the update; subsequent launches are permanently persistent.

### 6. Eviction triggered after each download, not on a timer

After every successful download, `evictIfNeeded(1 GB)` runs as fire-and-forget. Eviction is idempotent (re-checks total size before each unlink) so concurrent triggers from parallel downloads are harmless. This is simpler than maintaining a timer or background task and bounds evictions to the moments cache actually grows.

### 7. Cap = 1 GB, eviction floor = 80 % (≈ 800 MB)

1 GB roughly matches Telegram's default. Evicting all the way down to the cap would cause oscillation when the user is steadily near the limit; targeting 80 % gives breathing room. Both values are constants in `mediaIndexService.ts` and are easy to expose via Settings later.

### 8. `lastAccess` write debounce: 5 s per key

Every `getFromMemory` hit updates `lastAccess`. Without debounce, scrolling a list of 50 cached images could write to MMKV 50 times in one frame. A 5-second per-key debounce keeps the write rate to a few per minute even during sustained scrolling, while still preserving useful LRU resolution.

### 9. Verify file existence on `getOrDownload` hits, not on `getFromMemory` hits

`getFromMemory` must remain synchronous, so it cannot `fs.exists`. If an index entry is stale (file removed by manual user action), the rendered `<Image>` will fail and `MediaImage`'s existing `onError` path will trigger `invalidateKey` and a retry. `getOrDownload`, which is already async, performs `fs.exists` after an index hit and re-downloads if the file is missing. This is the cheapest stale-entry recovery that does not compromise the synchronous read path.

### 10. Boot integration: eager module-scope load

`mediaIndexService.load()` runs at module-import time inside the service file itself (top-level statement). The MMKV constructor and JSON parse complete in well under one millisecond at typical sizes, and module imports resolve before any JSX renders, so `getFromMemory` is guaranteed ready by the first render. As a belt-and-suspenders, `App.tsx` will also call `mediaIndexService.load()` once during startup (the function is idempotent).

### 11. In-flight Promise dedupe

`getOrDownload` keeps a `Map<mediaKey, Promise<string|null>>` of pending downloads. When component A and component B both request the same uncached mediaKey in the same frame, B receives A's pending promise instead of starting a second HTTP request. The map entry is cleared on settle (resolve or reject).

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| MMKV native autolink fails on Android (Hermes vs JSC, manifest merge) | `react-native-mmkv@3.x` autolinks via TurboModules on the project's New Architecture configuration. Tasks include a Gradle clean + assembleDebug step to surface autolink issues immediately; both passed during implementation (BUILD SUCCESSFUL on Pixel_8 emulator). |
| MMKV instance ID collision with another store added later | Use the explicit ID `media-index` and document it in the service file. |
| Two components racing to download the same key | Solved by the in-flight Promise dedupe map (§11). |
| Eviction races with active rendering — file deleted while `<Image>` is using it | `MediaImage` already has an `onError` path that calls `invalidateKey` and retries via `getOrDownload`. Eviction also prefers least-recently-used files, which by definition are not currently rendered. Acceptable rare race. |
| MMKV index file corruption | `load()` wraps `JSON.parse` in try/catch and falls back to an empty in-memory map. The cache rebuilds organically as files are re-downloaded. |
| Partial download leaving a junk file | `BlobUtil.config({ path }).fetch` writes through `path` and the existing code already verifies `stat.size > 0` before returning. On any non-200 status the partial file is unlinked. |
| Disk fills while DocumentDir is durable (cache no longer auto-purged by OS) | LRU eviction at 1 GB caps growth. If the device is critically low on storage, the OS still surfaces low-storage UI; the app cannot itself be terminated for storage pressure but cache cap prevents unbounded growth. |
| Users with very large existing legacy caches at `CacheDir/media-cache` accumulate dead bytes | The legacy folder is left for the OS to reclaim under storage pressure. A future chore can add a one-time delete; out of scope for this change. |

## Migration Plan

1. Ship the change. On first launch after update:
   - `mediaIndexService.load()` finds an empty MMKV store → starts with empty in-memory map.
   - Old cache files at `${CacheDir}/media-cache/...` remain on disk but are no longer referenced.
2. As the user opens conversations, `getOrDownload` re-fetches each previously-seen file, writes it to `${DocumentDir}/MediaCache/...`, and registers it in the index.
3. The OS reclaims the abandoned `CacheDir` files under normal cache-pressure rules.
4. Once a file is in the new cache, it persists across all future restarts until evicted by LRU or by `invalidateKey` / `clearCache`.

**Rollback**: revert the commits and run `npm install`. The legacy `mediaCacheService.ts` will resume using `${CacheDir}/media-cache`. The new persistent files in `${DocumentDir}/MediaCache` are abandoned but harmless; a follow-up cleanup can delete them.

## Open Questions

- **Should the OS-private location be `LibraryDir` instead of `DocumentDir` on iOS?** Decision deferred. `DocumentDir` is simpler now; if iCloud-backup quota becomes a concern we can move to `LibraryDir/Caches` (which is iOS's "preferred persistent cache") plus `NSURLIsExcludedFromBackupKey` in a follow-up. Both directories are persistent — `LibraryDir/Caches` is closer to "OS persistent cache" semantics.
- **Should `evictIfNeeded` log evictions to the analytics pipeline?** Out of scope for v1; a `console.warn` is sufficient.
