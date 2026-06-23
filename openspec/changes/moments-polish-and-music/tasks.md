## 1. Backend — View-count flush cron

- [x] 1.1 Change `@Cron('*/60 * * * * *')` to `@Cron(CronExpression.EVERY_MINUTE)` in `MomentsService.flushViewCounts`; import `CronExpression`.
- [x] 1.2 Add `REDIS_DIRTY_STORIES_KEY = 'moments:dirty-stories'`; in `recordView`, `SADD` the storyId alongside the `INCR` for non-author views.
- [x] 1.3 Rewrite `flushViewCounts` to `SMEMBERS` the dirty-set, flush each counter, `DECRBY`, and `SREM` stories that drain to zero (or were already zero).
- [x] 1.4 Update redis mocks in `moments.integration.spec.ts` and `moments.service.spec.ts` with `sadd`/`srem`/`smembers`; migrate the three flush tests to the dirty-set. ← (verify: cron fires once/min, no KEYS/SCAN, idempotent on partial failure)

## 2. Backend — Atomic reaction

- [x] 2.1 Replace the `$pull`-then-`$push` in `reactToStory` with positional `$set` (matched viewer) else guarded `$push` (`reactions.userId $ne viewerId`).
- [x] 2.2 Add unit tests: in-place update path (1 op), new-reaction push path (2 ops, guarded). ← (verify: exactly one reaction entry per viewer under concurrent requests)

## 3. Backend — FCM mention push

- [x] 3.1 Add `NotificationsService.sendMentionPush({ mentionedUserId, authorName, storyId, captionSnippet })` reusing the multicast + eligibility + dedup path; deep-link `koola://moments/story/<storyId>`.
- [x] 3.2 In `processMentionNotifications`, resolve the private-author connection set once via `getConnectedUserIds`; replace the FCM stub with a real `sendMentionPush` call.
- [x] 3.3 Add unit tests: public mentioner pushes; private+connected pushes; private+not-connected suppressed; self-mention never notifies. ← (verify: push fires for eligible mentions only)

## 4. Backend — Presigned audio/preview URLs

- [x] 4.1 `getMusicTrackById` returns `{ ...track, audioUrl, previewUrl }` (presigned, 1h); `previewUrl` falls back to `audioUrl` when no `previewKey`.
- [x] 4.2 `searchMusicTracks` attaches a presigned `previewUrl` per track.
- [x] 4.3 Add unit tests for the playback-URL enrichment and the not-found path. ← (verify: URLs present, no raw keys exposed)

## 5. Mobile — Viewer hold-to-pause resume

- [x] 5.1 Add `pausedValueRef`; `stopProgress` captures the current progress value via `stopAnimation` callback.
- [x] 5.2 `startProgress(durationMs, fromValue)` scales remaining time by `(1 - fromValue)`; `handlePressOut` resumes images from `pausedValueRef`; reset to 0 on media load. ← (verify: held image resumes remaining time, not full 5s)

## 6. Mobile — Music playback + picker

- [x] 6.1 Mount a hidden audio-only `<Video>` for stories with `musicRef`+`trackInfo.audioUrl`; `paused` synced to story state; seek to `startMs/1000` on load; silent on error; `hiddenAudio` style.
- [x] 6.2 Re-enable the viewer attribution pill (remove `{(false as boolean) && …}` guard).
- [x] 6.3 Re-enable the composer "Thêm nhạc" entry and `MusicPicker` modal (remove `{false && …}` guards). ← (verify: pick track → viewer plays audio synced + pill shows)

## 7. Specs & verification

- [x] 7.1 Update canonical `moments-music-library/spec.md` (compose-at-playback + picker enabled).
- [x] 7.2 Author change deltas for `moments-views-and-reactions`, `moments-stories`, `moments-music-library`.
- [x] 7.3 `cd chat-backend && npx tsc --noEmit` (moments/notifications clean) + `npm test -- moments` green.
- [x] 7.4 `cd ChatApp && npx tsc --noEmit` clean.
- [x] 7.5 `openspec validate moments-polish-and-music --strict` clean. ← (verify: cross-stack type-checks + tests green, spec validates)
