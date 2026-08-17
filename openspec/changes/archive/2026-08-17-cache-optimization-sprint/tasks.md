## 1. SQLite Storage Maintenance (P0)

- [x] 1.1 Add `messageRepository.pruneOldMessages({ maxAgeDays: 90, minPerConversation: 200 })`: within the existing transaction wrapper, delete messages with `created_at < now - 90d` while keeping each conversation's 200 most recent rows (use a per-conversation subquery/window; verify it does not touch conversations under the floor). ← (verify: unit test — conv with 250 msgs spanning 120 days keeps exactly the 200 newest and drops the 50 oldest; conv with 150 msgs keeps all 150; runs inside transaction)
- [x] 1.2 Add `outboxRepository.deleteDoneOlderThan(ms = 24h)`: delete rows where `state='done' AND updated_at < now - ms`; never touch pending/in_flight/dead_letter. ← (verify: unit test — done row aged 25h deleted, done row aged 1h retained, dead_letter row aged 30d retained)
- [x] 1.3 Create `ChatApp/src/services/db/storageMaintenance.ts`: `runMaintenance()` dispatches via `InteractionManager.runAfterInteractions`, guards on `AppState === 'active'`, calls prune → reap → conditional vacuum; aborts cleanly if app backgrounds mid-pass. Wire it to fire on app foreground and once after login (debounced so it cannot run twice in the same session needlessly). ← (verify: maintenance does not block first chat render; calling twice in one session is idempotent)
- [x] 1.4 Implement idle incremental vacuum in the maintenance pass: read/write `account_state.last_vacuum_at`; skip if last run < 24h; otherwise run `PRAGMA incremental_vacuum(N)` with N bounded (e.g. a few thousand pages) and update the marker; swallow+log errors. ← (verify: vacuum skipped when marker is fresh; runs and updates marker when stale; thrown error is logged and does not stop prune/reap)
- [x] 1.5 Unit tests for storageMaintenance orchestration (mock repositories + db): ordering prune→reap→vacuum, AppState guard, once-per-day gate, error isolation. ← (verify: every ADDED scenario in sqlite-storage-maintenance, message-store-sqlite retention, and message-outbox reaper specs passes)

## 2. Backend Story Media Keys (P1)

- [x] 2.1 In `chat-backend/src/moments/moments.service.ts`, include `mediaKey` (from the persisted story doc) plus `thumbnailKey`/`musicKey` where present in story read response payloads, alongside the existing presigned `mediaUrl`. Update the response DTO/interface to declare the new optional fields. Keep `mediaUrl` unchanged (additive, non-breaking). ← (verify: backend jest — story response contains mediaKey equal to stored key and still contains mediaUrl; story with no key returns null/absent mediaKey but valid mediaUrl; tsc/build 0 err)
- [x] 2.2 Confirm `GET /media/:mediaKey` presigned endpoint returns a streamable URL usable by the player (no code change expected); add/adjust a test asserting it returns a presigned GET URL for an authorized member. ← (verify: endpoint returns 200 with a presigned URL for a conversation member, 403 for non-member)

## 3. Moments Viewer + Music Cache (P1/P2)

- [x] 3.1 In `MomentViewerScreen.tsx`, resolve story image/video via `getOrDownload(mediaKey)` when `currentStory.mediaKey` exists, falling back to the presigned `mediaUrl` when absent; keep the existing `<Video>`/`<Image>` render and error handling. ← (verify: cached story loads from file:// with no network; uncached story downloads+caches then second view is instant; story without mediaKey uses presigned URL as before)
- [x] 3.2 In `MusicPicker.tsx` and the moment audio player, resolve preview/audio through `getOrDownload(musicKey|previewKey)` with presigned fallback, so repeats play from disk. ← (verify: cached preview plays offline; uncached preview downloads+caches; missing key falls back to presigned audioUrl; music-unavailable scenario still drops audio silently)

## 4. Progressive Video Playback (P1)

- [x] 4.1 In `VideoPlayerModal.tsx`, on open check `getFromMemory(mediaKey)`: on hit mount `<Video source={{uri: file://}}>` (unchanged fast path). On miss, fetch the presigned GET URL (`GET /media/:mediaKey`) and mount `<Video source={{uri: presignedUrl}} bufferConfig={...}>` so playback starts at the buffer threshold; fire-and-forget `getOrDownload(mediaKey)` in parallel to warm the cache. On presigned-stream error, fall back to the existing full-download-then-play path and existing error/retry UI. ← (verify: cached video plays from disk instantly; uncached video begins playing before full download; background warm makes the next open a cache hit; stream failure falls back to full download; existing close/error/unmount teardown still releases the surface)

## 5. Upload Temp Cleanup (P2)

- [x] 5.1 In `mediaUploadService.ts`, wrap the upload flow so the `CacheDir/upload_*` temp file is unlinked in a `finally` block on both success and failure (best-effort, logged). ← (verify: after a successful upload the temp file no longer exists; after a failed/thrown upload the temp file is still removed; no temp files accumulate across repeated uploads)

## 6. Preloader Metered Gate (P2)

- [x] 6.1 In `mediaPreloader.ts`, subscribe to `NetInfo` state and gate `handleNewMessage`: skip enqueue when `isDataSaverEnabled() && netState.isConnectionExpensive`; when data saver is off, keep current behavior on all networks. Unsubscribe on unwire/logout. ← (verify: data saver on + metered → no enqueue; data saver on + unmetered → enqueue; data saver off + metered → enqueue; network switch updates the decision live without restart; every scenario in the media-cache-persistence preloader spec passes)

## 7. Storage Settings Breakdown (P2)

- [x] 7.1 Add `mediaIndexService.breakdown()`: iterate the in-memory map, group entries into image/video/audio by `mime` prefix with file-extension fallback (`.jpg/.png/.webp`→image, `.mp4/.mov/.webm`→video, `.mp3/.m4a/.wav`→audio), summing `size`; return category totals. ← (verify: unit test — mixed entries categorized correctly including extension-only legacy entries; unknown extensions bucketed to other/zero)
- [x] 7.2 Add a DB-size helper reading `PRAGMA page_count * PRAGMA page_size` via the synchronous op-sqlite shim (guard for DB-not-open → 0). 
- [x] 7.3 In `StorageSettingsScreen.tsx`, render labeled rows for image / video / audio / SQLite database sizes beneath the existing used-vs-cap meter; refresh on focus and after clear-cache. ← (verify: screen shows four category sizes that sum consistently with the total; values update after clearing cache; renders without crash when DB closed/index empty)

## 8. Verification & Quality Gates

- [x] 8.1 ChatApp: `tsc` 0 errors, `eslint` 0 errors, jest green with no regression vs ~878 baseline. Add tests from 1.5, 6.1, 7.1. ← (verify: tsc/eslint clean; jest count >= baseline and all new tests pass) — DONE 2026-08-17: tsc 0 err, eslint 0 errors (311 pre-existing warnings), jest 1016 pass (baseline 878)
- [x] 8.2 chat-backend: build/tsc 0 errors, jest green with no regression vs 262 baseline; tests from 2.1/2.2. ← (verify: build clean; jest >= baseline) — DONE 2026-08-17: nest build 0 err, jest 303 pass (baseline 262); 3 pre-existing tsc errors in scripts/accounts.spec unrelated to this change
- [x] 8.3 Run `detect_changes` (or equivalent scope check) before commit to confirm only the named files/areas changed. ← (verify: diff limited to the files listed in proposal Impact; no out-of-scope edits) — DONE 2026-08-17: git diff scope check — all changed files within proposal Impact (AuthContext.tsx justified by task 1.3 login wiring)
