## Why

When the user kills the app and reopens it, then enters a previously-visited conversation, images and videos that were already downloaded still flash one frame of Blurhash placeholder before the actual `<Image>` appears, even though the file is already on disk. This breaks the perceived "Telegram/Zalo" experience where seen content reappears instantly.

Three causes combine: the in-memory URI map (`mediaCacheService.ts:10`) resets on every process restart so `getFromMemory` returns null on first render; `warmMemoryCache` runs *after* `setMessages` so React renders the placeholder before the cache can be primed; and `getOrDownload` always goes through at least two async filesystem awaits before calling `setUri`. Additionally, the cache lives under `BlobUtil.fs.dirs.CacheDir`, which the OS is permitted to clear under storage pressure or when the user taps "Clear cache" — so the cache can disappear silently while the app is still installed.

## What Changes

- Introduce a persistent index DB (MMKV) that stores cache metadata: `mediaKey → { path, size, mime?, addedAt, lastAccess }`.
- **BREAKING (cache only, no API change)**: relocate the on-disk cache from `${CacheDir}/media-cache` to `${DocumentDir}/MediaCache` so the OS does not auto-clear it.
- Replace the irreversible `cacheKeyFromMediaKey` filename-flattening with a path-mirror layout: a mediaKey `uploads/<userId>/<uuid>.<ext>` becomes `${DocumentDir}/MediaCache/uploads/<userId>/<uuid>.<ext>` (only FS-illegal characters `:?*"<>|` are sanitized; `/` is preserved so paths remain reversible).
- Load the index synchronously into memory at app boot (MMKV mmap, < 5 ms for thousands of entries) so `getFromMemory(mediaKey)` is a synchronous hit on the very first render after a process restart.
- Drop `warmMemoryCache` — looping `fs.exists` per key is no longer needed because the in-memory index is already populated at boot.
- Add an in-flight Promise dedupe map inside `getOrDownload` so concurrent requests for the same key collapse into a single network download.
- Add LRU eviction with a 1 GB cap: when total cached size exceeds the cap, evict files in ascending `lastAccess` order until the total drops below 80 % of the cap (~800 MB). Eviction triggers fire-and-forget after each successful download.
- Skip migration of the legacy cache at `${CacheDir}/media-cache` — it uses an irreversible filename mapping. Users re-download each file once after the update, after which everything is permanently persistent.

## Capabilities

### New Capabilities
- `media-cache-persistence`: persistent on-disk media cache with an MMKV-backed index, a stable disk layout under `DocumentDir`, synchronous boot-time lookup, in-flight download deduplication, and LRU eviction. This capability owns the cache infrastructure that `media-message-display` consumes.

### Modified Capabilities
<!-- None. The public API of mediaCacheService (`getFromMemory`, `getOrDownload`, `invalidateKey`, `clearCache`, `warmMemoryCache`) is preserved, so consumer specs (e.g., `media-message-display`) need no requirement changes. -->

## Impact

**Affected code (ChatApp only — no backend changes):**
- New: `ChatApp/src/services/media/mediaIndexService.ts`
- Modified: `ChatApp/src/services/media/mediaCacheService.ts`
- Modified: `ChatApp/src/screens/chat/hooks/useMessages.ts` (drops `warmMemoryCache` calls)
- Modified: one of `ChatApp/App.tsx` or `ChatApp/src/contexts/AuthContext.tsx` (boot integration; chosen during apply)
- Native autolink: `ChatApp/android/`, `ChatApp/ios/Podfile.lock` (if `ios/` exists)
- Package manifests: `ChatApp/package.json`, `ChatApp/package-lock.json`

**Dependencies:**
- New: `react-native-mmkv@^2.12.2` (NOT v3.x — v3 requires Nitro Modules / New Architecture which is not currently verified in this project)

**Out of scope:**
- Migrating the legacy `CacheDir/media-cache` contents.
- A user-facing Settings screen to configure the cache cap (cap is hard-coded for v1).
- Setting `NSURLIsExcludedFromBackupKey` for iCloud (cache files are allowed in backup at this size).
- Touching `mediaUploadService.ts` temp-upload directory (still uses CacheDir; that is the upload side, not the persistent cache).
- Server-side video thumbnails; renaming the `mediaUrl` field on the backend; HTTP Range / progressive playback.

**Not affected (API preserved):**
- `MediaImage.tsx`, `VideoMessage.tsx`, `UserAvatar.tsx`, `VideoPlayerModal.tsx`, `ConversationListScreen.tsx`, `mediaUploadService.ts`, `FileAttachment.tsx` — all keep calling `getFromMemory` / `getOrDownload` / `invalidateKey` unchanged.
- `chat-backend/` — no backend changes whatsoever.
- Other in-progress changes (`mobile-ui-system`, `video-messages`, `call-system-reliability`, `backend-hardening-sprint`, `voice-video-call-production`, `infra-setup`).
