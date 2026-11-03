# Proposal

## Why

The music library can be curated but not used the way the product intends. Today a story can carry a `musicRef` with only `{ trackId, startMs }` — no length — so the player loops the full track underneath the media regardless of how long the story is. A 5-second photo story plays an unbounded music loop; a 41-second video plays the track past its own end. There is no post music at all, and the picker's start offset is capped at `durationSeconds - 15`, an assumption that predates any notion of clip length.

The requirement from review: admins audition the whole track, users also hear the whole track when choosing, but the **selected segment** is bounded — up to 10s for a story ("nhật ký") and up to 28s for a post/clip — and the user picks which segment by scrubbing the whole track. That is a playback-length rule, not a file-cutting rule, so it needs no media binary.

## What Changes

- **`musicRef` gains `lengthMs`** — the selected segment length, alongside the existing `startMs`. `{ trackId, startMs, lengthMs }`. This is the field that makes a 10s/28s bound expressible at all.
- **Server-side bounds, per surface** — `lengthMs` ≤ 10000 on story creation, ≤ 28000 on post creation. The server clamps/rejects; the client is never trusted. `startMs + lengthMs` must not exceed the track's `durationMs` (with a small tolerance), otherwise 400 instead of silent silence.
- **Music playback stops at `startMs + lengthMs`** — the story viewer drops its `repeat` flag and stops the track when the segment ends. Whatever the media still has left plays with its **own original audio** (unmuted), which is what the review described: a 14s clip with a 10s segment plays 10s of music, then 4s of the clip's own sound.
- **Photo stories run 10s, not 5s** — with a 10s segment bound, a 5s photo card would cut half the chosen music. `IMAGE_DURATION_MS` becomes 10000.
- **Segment scrubbing in the picker** — the start slider spans the whole track (`0 … durationMs - lengthMs`), so the user can pick any window, and the preview plays exactly the chosen window then stops. The current `- 15` cap is deleted.
- **Post music** — `musicRef` reaches the post schema and DTO with the same shape and a 28s bound; the post composer gains the same picker entry. Post playback mounts the same audio player with the same segment stop.
- **Music playback no longer depends on the message-media proxy** — a catalog track has no `Media` row, so `getOrDownload(previewKey)` 404s and every story music replay re-downloads. Story/post music resolves from the presigned URL and the player streams it; no cache entry is written for catalog audio.

## Impact

- **Backend** — `moments/dto/create-story.dto.ts` (`MusicRefDto` + `lengthMs`, `@Max`), `moments/dto/post.dto.ts` (new `musicRef`), `moments/schemas/story.schema.ts` + `post.schema.ts` (embedded `lengthMs`), `moments/moments.service.ts` (validate against track duration, bump `usageCount` for posts too).
- **Mobile** — `ChatApp/src/components/moments/MusicPicker.tsx` (full-track scrub, segment preview, length display), `MomentComposerScreen.tsx`, `MomentViewerScreen.tsx` (segment stop, `IMAGE_DURATION_MS`, unmute), `PostComposerScreen.tsx` (picker entry), post viewer/feed card playback.
- **Data** — `lengthMs` defaults to the surface bound for existing `musicRef` documents that lack it (story read path fills 10000), so no migration is needed and no existing story loses its music.
- **Not touched** — `music-catalog-ops` (admin surface, separate change), `chat-backend/src/media/**`, `ffmpeg` (still not added — nothing is cut).

## Out of Scope

- The Shorts/`Xem trước` tab: it is a placeholder (`KoolaState` "Tính năng đang được phát triển"), so "clip TikTok" here means the **post/video card**, not a feed that does not exist yet. When Shorts gets real data, it reuses the same `musicRef` with its own bound.
- Waveform rendering, beat detection, multi-track mixing, text-on-video — none of these are implied by "choose a segment".
- Audio fingerprinting, import pipelines, trending windows beyond the existing `usageCount`.
