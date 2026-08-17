## Context

The mobile app's caching and local-storage layers are already well-structured: chat media downloads land in `${DocumentDir}/MediaCache` under an MMKV-backed LRU index (`mediaIndexService`, default 5 GB cap, hydrated synchronously at boot so `getFromMemory` is a first-frame hit), and messages/conversations live in a local-first SQLite store (`koola.db`, op-sqlite JSI, WAL mode, `synchronous=NORMAL`, `busy_timeout=5000` set in `connection.ts`). The gaps this change closes were traced with the context engine (not GitNexus, per user preference 2026-08-15):

- **Unbounded DB growth**: `messageRepository` only ever deletes by single id (delete-message, optimistic reconcile) — there is no time/retention prune. `outboxRepository.markDone` flips `state='done'` but never deletes the row; only `wipeAll` (logout) removes rows. No vacuum pragma. `docs/performance-audit-2026-08.md` §4.4 quantifies ~55k outbox rows/year carrying `payload_json`.
- **Moments bypass the cache**: `MomentViewerScreen.tsx:425,438` renders `currentStory.mediaUrl` directly — a presigned MinIO URL minted server-side (`moments.service.ts:274`, 1 h TTL). It is not a `mediaKey`, so it cannot enter `getOrDownload`. The story schema already persists `mediaKey` (`story.schema.ts:50`); the service simply never surfaces it.
- **Video blocks on full download**: `VideoPlayerModal.tsx:83` awaits `getOrDownload(uri)` for the whole file before mounting `<Video>`. `react-native-video` v6 cannot attach the `Authorization` header the `/media/download` proxy requires, but the presigned GET endpoint `GET /media/:mediaKey` (`media.controller.ts:145`, 1 h, no auth header) is streamable directly.
- **Music re-streams**: `MusicPicker.tsx` / moment audio play presigned URLs per view.
- **Upload temp leak**: `mediaUploadService.ts:212` writes `CacheDir/upload_*` with no `unlink`.
- **Preloader ignores metered**: `mediaPreloader.ts handleNewMessage` checks only `isDataSaverEnabled()`; its doc comment claims a NetInfo check that the code does not perform.
- **No breakdown UI**: `StorageSettingsScreen.tsx` shows total used vs cap only.

Constraints: op-sqlite's shim in this repo routes `execute()` to synchronous `raw.executeSync()`, so any heavy SQL (full `VACUUM`, large scans) blocks the JS thread and must be bounded/scheduled off the hot path. The preloader runs its own semaphore(2) separate from the main download semaphore(3).

## Goals / Non-Goals

**Goals:**
- Bound `koola.db` size over time: messages pruned by retention, completed outbox rows reaped, freed pages reclaimed via incremental vacuum without blocking the UI.
- Route story image/video and music through the same durable media cache as chat media so re-views are instant and offline-capable.
- Make fullscreen video start playing while still downloading (progressive) instead of after a full download.
- Stop leaking upload temp files and stop preloading on expensive connections when data saver is on.
- Give the user a per-type storage breakdown in the existing Settings screen.

**Non-Goals:**
- Native bitmap decode cache (FastImage / nitro-image) — separate P3 effort requiring a native dependency and rebuild.
- FTS local search — deferred; its spec is archived but unimplemented and is out of scope here.
- Any breaking REST change. Story field additions are additive; the presigned `mediaUrl` stays for backward compatibility.
- Rewriting the media upload pipeline beyond adding temp-file cleanup.

## Decisions

### Decision 1: Retention-based message pruning with a per-conversation floor

**Choice:** A maintenance pass deletes messages older than 90 days, but never reduces any conversation below its most recent 200 messages. Implemented as a single SQL using a window/rank or a two-step (count recent, delete `created_at < cutoff AND id NOT IN (recent 200)`), run inside the existing transaction wrapper, scheduled idle.

**Why:** Pure time-prune would empty slow-but-valued conversations; pure row-cap would delete old messages from active threads. The 90-day + 200-floor combination matches Zalo-class behavior and keeps the "scroll back a bit" UX intact while bounding growth. 90 days/200 are constants near the repository, easy to tune later.

**Alternatives considered:**
- Global row cap (keep last N rows across all conversations) — rejected: destroys history in low-traffic conversations.
- Size-based cap (prune until DB < X MB) — rejected: requires measuring DB mid-flight and oscillates; time+floor is deterministic and cheap.

### Decision 2: Outbox done-row reaper at 24 h

**Choice:** `outboxRepository.deleteDoneOlderThan(ms)` deletes rows with `state='done' AND updated_at < now - 24h`. Run in the same idle maintenance pass as pruning.

**Why:** `done` rows exist only for debugging/reconciliation and have no read-path consumer; 24 h retains them long enough to diagnose a flaky send then frees the space. This directly resolves perf-audit §4.4.

**Alternatives considered:**
- Delete `done` immediately on `markDone` — rejected: loses the ability to inspect a just-completed row and changes `markDone` semantics across 6 call sites.
- Keep forever — rejected: the documented root cause of unbounded growth.

### Decision 3: Idle incremental vacuum, scheduled once per day

**Choice:** Set no `auto_vacuum` at DB creation (cannot be enabled retroactively on an existing WAL DB without a full rewrite). Instead, run `PRAGMA incremental_vacuum(N)` during idle time, gated by an `account_state.last_vacuum_at` timestamp so it runs at most once per 24 h, dispatched through `InteractionManager.runAfterInteractions` and only while `AppState === 'active'`. N is bounded (e.g. reclaim up to a few thousand pages per run) to cap JS-thread block time given the synchronous shim.

**Why:** Full `VACUUM` rewrites the entire DB and would freeze the UI on a large store under the synchronous shim. Incremental vacuum reclaims only already-freed pages, is interruptible by bounding N, and the once-per-day gate avoids redundant work. Running only while active avoids scheduling work the OS will suspend.

**Alternatives considered:**
- `PRAGMA auto_vacuum=INCREMENTAL` at init — rejected: ignored for DBs created without it; enabling now would require a one-time full migrate/VACUUM we want to avoid.
- Never vacuum — rejected: freed pages stay allocated forever, so even with pruning the file never shrinks.

### Decision 4: Surface stable media keys in story responses (additive)

**Choice:** `moments.service.ts` includes `mediaKey` (from the persisted story doc) and, where stored, `thumbnailKey`/`musicKey` in the story response DTO alongside the existing presigned `mediaUrl`. No field is removed.

**Why:** The cache pipeline keys on `mediaKey`, not on presigned URLs (which carry an HMAC signature and 1 h TTL, making them unstable cache keys and breaking dedup). Surfacing the already-persisted key lets the viewer use `getOrDownload` exactly like chat media. Keeping `mediaUrl` preserves backward compatibility for older clients and as the fallback when a key is absent.

**Alternatives considered:**
- Cache by presigned URL — rejected: signature/TTL make the key non-deterministic; same asset yields different keys each fetch, so dedup and LRU break.
- Replace `mediaUrl` with `mediaKey` only — rejected: breaking for older clients; additive is free.

### Decision 5: Progressive video via presigned URL + background cache warm

**Choice:** On open, `VideoPlayerModal` first checks `getFromMemory(mediaKey)`. Hit → mount `<Video source={{uri: file://...}}>` (unchanged fast path). Miss → fetch a presigned GET URL (`GET /media/:mediaKey`) and mount `<Video source={{uri: presignedUrl}} bufferConfig={...}>` so playback starts at the player's buffer threshold; in parallel fire-and-forget `getOrDownload(mediaKey)` to populate the persistent cache so the next open is instant from disk. Error on the presigned stream falls back to the existing full-download-then-play path.

**Why:** `react-native-video` v6 (media3/ExoPlayer) cannot send the `Authorization` header the download proxy needs, but it streams plain HTTPS presigned URLs natively with buffering. Background warming means the progressive path is paid once per asset; repeats use the cached file. This removes the 10–30 s spinner on metered networks while preserving the durable cache.

**Alternatives considered:**
- Stream from the authenticated proxy — rejected: requires custom headers the player won't send.
- Partial-file Range caching via BlobUtil — rejected: reimplements buffering that media3 already does well.
- Keep full download — rejected: the current defect.

### Decision 6: Preloader gate on data saver AND expensive connection

**Choice:** Subscribe to `NetInfo` state in `mediaPreloader`; in `handleNewMessage`, skip enqueue when `isDataSaverEnabled() && netState.isConnectionExpensive`. When data saver is off, preload behaves as today (all networks). Existing MMKV `data_saver` setting is the single toggle; no new setting.

**Why:** The locked requirement is "honour metered when data saver is on." Gating on both avoids silently changing default behaviour for users who never enabled data saver, while fixing the documented gap (doc comment promised a NetInfo check the code lacked).

**Alternatives considered:**
- Always skip preload on metered regardless of setting — rejected: changes default behaviour beyond the agreed scope.
- New separate "Wi-Fi only preload" setting — rejected: redundant with the existing data saver toggle.

### Decision 7: Per-type breakdown from the index + PRAGMA

**Choice:** `mediaIndexService` exposes a `breakdown()` helper that iterates the in-memory map, groups entries by category inferred from `entry.mime` prefix (`image/`, `video/`, `audio/`) with file-extension fallback (`.jpg/.png/.webp` → image, `.mp4/.mov/.webm` → video, `.mp3/.m4a/.wav` → audio) because `mime` is optional, summing `size`. DB size comes from `PRAGMA page_count` × `PRAGMA page_size` via the synchronous shim. `StorageSettingsScreen` renders these as labeled rows under the existing meter.

**Why:** All data already exists in memory/DB; no new persistence. Extension fallback covers legacy entries written before `mime` was populated.

**Alternatives considered:**
- Walk the filesystem to measure — rejected: slower, duplicates the index, and the index is the source of truth for managed cache size.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Prune deletes messages a user wanted to keep past 90 days | 200-message per-conversation floor preserves recent context; 90 days is a constant tuned to match peer apps; deletion is local-only — backend MongoDB remains canonical and a future "load earlier" can re-fetch if ever needed (out of scope now). |
| Incremental vacuum still blocks JS thread briefly under synchronous shim | Bound N pages per run; run via InteractionManager while active; once-per-day gate limits frequency. Monitor; reduce N if jank observed. |
| Presigned URL for progressive video expires (1 h) mid-playback on very long videos | Player error handler falls back to full-download path; long videos are rare and the background warm means repeats use the cached file. |
| Legacy stories with no `mediaKey` | Viewer falls back to existing presigned `mediaUrl` path; behavior unchanged for those. |
| Reaper/prune run cost on first launch after upgrade on a large DB | Scheduled idle (InteractionManager), bounded, not on the render hot path; first run may take longer but does not block UI. |
| Breakdown mime missing on old index entries | File-extension fallback ensures categorization still works. |
