# Tasks

> **Scope guard**: `chat-backend/src/moments/**` and `ChatApp/**` only. Nothing under `chat-backend/src/media/**`, `chat-backend/src/admin/**`, `admin-web/**`, and no `ffmpeg`. The admin catalog change is `music-catalog-ops` and must not be edited here.
>
> **Rule**: the segment is a playback bound (`startMs + lengthMs`), never a cut file. If a task seems to need a second object in MinIO, stop — it does not.

## 1. Backend: segment field and validation

- [ ] 1.1 `MusicRefDto` gains `lengthMs` (`@IsNumber() @Min(1)`); `CreateStoryDto` adds a per-field `@Max` that rejects > 10000 with a Vietnamese message naming the limit; verify jest: 10000 accepted, 10001 → 400, 0 → 400, negative → 400
- [ ] 1.2 `story.schema.ts` embedded `musicRef` gains `lengthMs` (default `null` so old docs stay valid); after this change a read of a legacy doc without the field SHALL present `10000` — implement the default in the read mapper, not in the schema (`rawDocToResponse`-style), so stored data is not mutated by reads; verify jest: a doc with `{ startMs: 5000 }` reads back as `lengthMs: 10000`
- [ ] 1.3 Service validates the segment against the track: `startMs + lengthMs <= track.durationMs + 500` else 400 `"Đoạn nhạc vượt quá độ dài bài"`; runs **after** the existing active-track check so an inactive track still returns the existing message; verify jest: exact fit passes, 501 ms over fails, 500 ms over passes, regression case where the track is inactive returns the old message
- [ ] 1.4 Put the two bounds in one constants module (`moments/music-segment.constants.ts`): `MUSIC_SEGMENT_MAX_MS = { STORY: 10_000, POST: 28_000 }`, `MUSIC_SEGMENT_TOLERANCE_MS = 500`. Both DTOs import it — no literal `10000`/`28000` anywhere else; verify `grep -rn "10_000\|28000" src/moments` returns only the constants file

## 2. Backend: post music

- [ ] 2.1 `post.schema.ts` gains the same embedded `musicRef` shape (`trackId`, `startMs`, `lengthMs`) defaulting to `null`; `PostMediaItem` is untouched — the reference belongs to the post, not an item
- [ ] 2.2 `CreatePostDto` accepts optional `musicRef` validated with the 28 000 bound and the same shape as the story DTO; reuse the shared segment constants; verify jest: valid post with music → 201 and stored; 28001 → 400; unknown/inactive track → 400; no `musicRef` → 201 with `null`
- [ ] 2.3 `moments.service.createPost` validates the track (active + segment fits) and increments `usageCount` fire-and-forget, mirroring `createStory` `moments.service.ts:263`; verify jest: counter incremented once; a counter rejection does not fail the create
- [ ] 2.4 Post read paths (feed + detail) return `musicRef` plus resolved `title`/`artist` so the client can render attribution without a second request; verify jest: a post with music returns both the reference and the track metadata, a post without returns `null` and no extra lookup
- [ ] 2.5 Regenerate or hand-check any response-shape fixture the mobile app types against; verify `grep -rn "musicRef" src/moments` shows the field on post paths and `npx jest src/moments` is green

## 3. Backend gates

- [ ] 3.1 `cd chat-backend && npx jest src/moments && ./node_modules/.bin/tsc --noEmit` clean; `git diff --stat` shows nothing under `src/media/**` or `src/admin/**`; `npm audit --omit=dev` unchanged (this change adds no dependency)

## 4. Mobile: picker with segment scrubbing

- [ ] 4.1 `MusicPicker` takes a required `maxSegmentMs` prop and derives `lengthMs = min(maxSegmentMs, track.durationMs)`; `MomentComposerScreen` passes `10_000`, `PostComposerScreen` passes `28_000`; verify: two tests assert the slider maximum differs by prop, and the constant is not duplicated in the component
- [ ] 4.2 Slider spans the whole track: `maximumValue = max(0, durationSeconds - lengthSeconds)`, `- 15` removed; a label renders `"0:12 – 0:22 (10s)"` from the current values; verify vitest: at `startMs=0` label reads the computed range, dragging updates it, maximum is `duration - length`
- [ ] 4.3 Preview plays the chosen window and stops: on preview start seek to `startMs`, schedule a stop at `lengthMs`, cancel the timer on stop/close/switch; verify vitest with fake timers: stop fires at exactly `lengthMs`, switching tracks cancels the previous timer, closing the modal leaves no pending timer
- [ ] 4.4 Selecting confirms `{ trackId, startMs, lengthMs }`; the "Bỏ nhạc" path still sends `null` and never a zero-length segment; verify vitest: payload shape asserted for both paths

## 5. Mobile: story playback

- [ ] 5.1 Remove `repeat` from the music player in `MomentViewerScreen`; drive the segment with an explicit start/stop at `startMs` and `startMs + lengthMs`; verify vitest with fake timers: no loop, stop called once per story, changing `currentIndex` restarts cleanly
- [ ] 5.2 `muted` follows the segment: remain muted while the segment plays, unmute the story video when the segment ends; a photo story has no unmute step; verify vitest: `muted` flips at the boundary, a story whose `lengthMs` exceeds its duration never flips, an unmount mid-segment does not leave a pending timer
- [ ] 5.3 `IMAGE_DURATION_MS` 5000 → 10000 and the hold-to-pause resume path still measures against the new value; verify vitest: an image story advances at 10 s, pausing at 4 s resumes for the remaining 6 s
- [ ] 5.4 Add `cacheFromUrl(stableKey, url)` to `mediaCacheService`, reusing the existing download path (semaphore, retry backoff, LRU index, `audio` classification) with `getOrDownload` behaviour unchanged; music calls `cacheFromUrl('music:' + trackId, trackInfo.audioUrl)`; verify vitest: first call downloads and indexes under `music:<trackId>`, second call returns the cached `file://` without a network call, a differing signed URL for the same track does not create a second entry, and the entry is classified as `audio`
- [ ] 5.5 Delete the `getOrDownload(musicKey)` branch for catalog music — that path 404s because no `Media` row exists; verify vitest: no `/media/download/` request is made for music, and playback still receives a URI

## 6. Mobile: post music

- [ ] 6.1 `PostComposerScreen` gains the "Thêm nhạc" entry and holds `musicRef` in the create payload; verify vitest: entry renders, selecting a track includes `musicRef`, clearing it omits the field
- [ ] 6.2 The post card / media viewer plays the segment with the same stop-at-`lengthMs` rule and renders the attribution line; verify vitest: playback stops at the boundary, a post without music mounts no player, the attribution renders only when a track resolves

## 7. Integration and live pass

- [ ] 7.1 `cd ChatApp && npx jest` for the touched suites and `npx tsc --noEmit` with delta 0 vs baseline; `cd chat-backend && npx jest src/moments` green ← (verify: no new errors in touched files)
- [ ] 7.2 Live: on a device, play the same story's music twice — the second play must produce zero network requests (log inspection or a MinIO access log); then clear the app cache and play again to confirm one download reinstates it. Then create a **14 s video story** with a 10 s segment → confirm music plays 0–10 s and the video's own audio is audible 10–14 s. Create a 41 s video with a 10 s segment → music stops at 10 s, original audio for the rest. Create a photo story with music → 10 s card, music stops, no audio after. Create a post with a 28 s segment → plays to its bound. Attempt `lengthMs: 10001` on a story and `28001` on a post → both 400 with the limit named. Pick a segment near the end of a track → accepted when it fits, 400 when it overruns. Confirm no music-related `[mediaCacheService] Non-200` log lines appear anymore
- [ ] 7.3 Verify a **legacy** story (created before this change, `musicRef` without `lengthMs`) still plays music and now stops at 10 s instead of looping — run against a real pre-existing document, not a fabricated one
- [ ] 7.4 `openspec validate moments-music-clips --strict`; note in the PR body that the admin surface (`music-catalog-ops`) is still unshipped, and that the 10 seed tracks have no MinIO objects, so live testing needs either an uploaded track or a re-seed
