## Why

Moments stabilization (archived 2026-06-18) closed the three release-blockers but deliberately deferred a set of correctness bugs and the music-playback feature to follow-up changes. Those deferrals are now the remaining gap between "ships without leaking" and "complete, trustworthy stories feature":

1. **View-count flush cron is wrong twice.** `@Cron('*/60 * * * * *')` fires every **second**, not every minute, and the body runs a blocking `redis.keys('moments:story:*:views')` scan — both regressions as the story volume grows. The codebase already bans `KEYS`/`SCAN` (see the WebRTC call-session index-set pattern).
2. **`reactToStory` is not atomic.** It does `$pull` then `$push` as two separate ops, so two concurrent reactions from the same viewer can leave zero or two reaction entries.
3. **Mention FCM push is a stub.** `processMentionNotifications` emits the `story.mention` socket event but the FCM branch only logs — offline/background mentioned users never get a push.
4. **Viewer hold-to-pause does not resume.** Releasing a held image restarts the 5s timer from the beginning instead of resuming the remaining time.
5. **Music is unwired.** The composer picker and viewer attribution pill are hidden behind `{false && …}`, no audio player exists, and the music-track read returns no playable URL.

## What Changes

- **MODIFIED** `moments-views-and-reactions` — the flush cron runs once per minute via `CronExpression.EVERY_MINUTE` and drains a Redis dirty-set (`moments:dirty-stories`, populated by `recordView`) instead of scanning keys; `reactToStory` upserts the viewer's single reaction atomically (positional `$set`, else guarded `$push` with `reactions.userId $ne viewerId`).
- **MODIFIED** `moments-stories` — mention notifications send a real FCM push (`NotificationsService.sendMentionPush`) with deep-link `koola://moments/story/<storyId>`, gated by the existing privacy rule (public mentioner, or private mentioner connected to the mentioned user via shared DIRECT conversation).
- **MODIFIED** `moments-music-library` — music is re-enabled end-to-end: the composer shows the picker and sets `musicRef`; the viewer mounts a hidden audio-only `react-native-video` instance synced to the story (seek to `startMs`, pause/resume in lockstep) and renders the attribution pill; the single-track read returns presigned `audioUrl`/`previewUrl` and browse/search returns `previewUrl`. Hold-to-pause now resumes from the remaining time.

Out of scope: Posts/Feed permanent capability (separate proposal), Highlights migration hardening, AudienceList admin UX, mention offset recalculation on caption edit (captions are immutable post-create).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `moments-views-and-reactions`: cron schedule + dirty-set flush, atomic reaction upsert.
- `moments-stories`: real FCM mention push.
- `moments-music-library`: compose-at-playback player wired, picker re-enabled, presigned playback URLs.

## Impact

**Backend (`chat-backend/`)**
- `src/moments/moments.service.ts` — `flushViewCounts` (cron + dirty-set), `recordView` (SADD dirty-set), `reactToStory` (atomic upsert), `processMentionNotifications` (real push + connection-set privacy check), `getMusicTrackById` + `searchMusicTracks` (presigned URLs).
- `src/notifications/notifications.service.ts` — new `sendMentionPush()`.
- Specs/tests updated: `moments.service.spec.ts`, `moments.integration.spec.ts`.

**Mobile (`ChatApp/`)**
- `src/screens/moments/MomentViewerScreen.tsx` — paused-value ref + resume-from-remaining, hidden audio player, re-enabled attribution pill.
- `src/screens/moments/MomentComposerScreen.tsx` — re-enabled music picker entry + modal.
