## Context

KOOLA already operates the architectural primitives Moments needs:

- MinIO presigned uploads (`MediaModule`)
- Socket.IO with `@socket.io/redis-adapter` for multi-instance fanout
- FCM push via `NotificationsModule`
- JWT auth, DTO validation, Mongoose schemas with explicit indexes
- Mobile singleton services (`socketService`, `apiService`), socket event router (`socketEventRouter.ts`), offline queue (`OfflineQueueService.ts`)

The `Khoảnh khắc` (Moments) tab is wired in `ChatHomeScreen.tsx` top-tabs but renders a placeholder. The task is to fill that surface with a complete story system that reuses, not duplicates, those primitives.

Key external constraint surfaced during research: YouTube and Spotify ToS explicitly prohibit synchronizing their audio with user-generated visual media — both options are eliminated. Vietnamese music rights enforcement is escalating (RMIT 2026), so v1 must use only license-cleared content.

The CLAUDE.md mental model — REST writes truth, Socket syncs truth, Mobile renders truth — applies in full: stories persist via REST, fan out via socket events scoped to user-rooms (not conversation rooms), and the mobile client owns all UI state.

## Goals / Non-Goals

**Goals:**
- Replace placeholder Moments screen with a working story system in one OpenSpec change
- 24h auto-expiry with permanent Highlights re-pin via TTL nullification
- 3-tier privacy (public / connections / custom named lists) with no N+1 query cost
- Industry-standard view tracking that scales past 10k viewers per story
- Music overlay using KOOLA-curated, license-cleared catalog only
- Full Vietnamese UI strings
- WCAG 2.1 AA accessibility on all new screens
- Reuse `MediaModule`, `NotificationsModule`, `GatewayModule`, `ConversationsModule` — no duplicate infrastructure

**Non-Goals:**
- Vietnamese pop catalog (defer to v2 once VCPMC license is negotiated)
- FFmpeg mux at upload time (compose-at-playback only — avoids retired `ffmpeg-kit-react-native`)
- AR filters, drawing tools, stickers, or text overlays beyond captions
- Author analytics dashboard
- Sponsored stories or advertising
- Cross-post to Shorts feed
- Snap-style "view-once" or anonymous posting that bypasses TTL
- YouTube / Spotify integration (legally blocked)

## Decisions

### Schema strategy: Outlier pattern + separate StoryViews

**Decision:** Store stories in a `Stories` collection. Embed the first ~200 viewer references on the root story doc. Once full, write subsequent views to a separate `StoryViews` collection, with overflow chains tracked via `storyGroupId` + `overFlowIndex`. The root story doc holds an authoritative `viewCount` integer.

**Why:** Embedded reads are cheapest for the common case (most stories never reach 200 views). For viral stories (10k+ views), embedded growth blows the 16MB BSON limit and slows feed reads. The Outlier pattern (MongoDB community-recommended for Instagram-like stories) gives O(1) reads on the hot path while still scaling.

**Alternative considered:** Always embed (fails at scale). Always separate (slower for the common case). Pure overflow without embed (extra round-trip for every story). Outlier balances both.

### Lifecycle: TTL index + nullable expiresAt + MinIO prefix lifecycle

**Decision:** `Stories.expiresAt` is a `Date` field with TTL index `{ expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $exists: true } } }`. Active stories have `expiresAt = createdAt + 24h`. Promoting to Highlights sets `expiresAt = null` — TTL skips the doc via the partial filter. Media in MinIO is stored under `stories/<storyId>/<mediaKey>` with a 25h object lifecycle policy; promoted Highlights media is moved (server-side copy + delete) to `highlights/<userId>/<storyId>/<mediaKey>` which has no lifecycle.

**Why:** TTL is the cheapest expiry primitive on MongoDB and runs without app-server cron. Nullifying `expiresAt` instead of moving documents preserves view history, reactions, and mention metadata for Highlights. MinIO lifecycle on the `stories/` prefix is the orphan-cleanup safety net regardless of whether the Mongo doc was deleted in time.

**Alternative considered:** Cron job sweep (more code, less reliable). Copying the document into a separate Highlights collection (loses references and complicates view-history queries). Single MinIO bucket with metadata-driven cleanup (slower listing).

**Failure mode:** TTL fires up to 60s late. Feed query MUST also filter `expiresAt > now` at read time — never rely on document absence alone.

### Privacy: 3-tier with named AudienceLists

**Decision:** `Stories.audienceScope` is an enum `'public' | 'connections' | 'custom'`. When `custom`, the story carries `audienceListId: ObjectId` referencing an `AudienceLists` document owned by the author. AudienceLists hold `memberIds: ObjectId[]` for reusable groups (e.g., "Bạn thân", "Đồng nghiệp"). Per-viewer feed queries fetch the viewer's list-membership IDs once (cached in Redis as `audience:listsContaining:<userId>` with 5-minute TTL) and use a single `$or` clause:

```js
{
  authorId: { $in: visibleAuthorIds },
  expiresAt: { $gt: new Date() },
  isActive: true,
  $or: [
    { audienceScope: 'public' },
    { audienceScope: 'connections', authorId: { $in: connectedAuthorIds } },
    { audienceScope: 'custom',      audienceListId: { $in: viewerListMembership } },
  ]
}
```

**Why:** Named lists match the WhatsApp 2026 / Instagram Close Friends pattern users already understand. Storing list membership separately avoids write amplification when the list is edited (no per-story rewrites). Redis cache invalidation runs only when the list is modified.

**Alternative considered:** Flat `allowedUserIds[]` per story (write amplification on list edit, no UX for "manage list once, use everywhere"). Per-post adhoc picker only (poor UX). User-level visibility ACL (over-engineered for this scope).

### Music: KOOLA library + compose-at-playback

**Decision:** A `MusicTracks` collection stores admin-curated tracks with provenance metadata (`licenseType`, `licenseUrl`, `sourceUrl`, `attribution`, `audioKey` in MinIO). Stories carry an optional `musicRef: { trackId, startMs }` pointer. The mobile story player composes audio + video at playback by running `react-native-video` (muted) for the user's video and a parallel audio player started with the same wall-clock anchor.

**Why:** YouTube/Spotify research confirmed both are legally blocked for sync use. CC0 + Epidemic Sound Partner API (when contracted) is the only clean path. Compose-at-playback keeps the architecture simple, avoids the retired `ffmpeg-kit-react-native` dependency (officially retired 2025-01-06), and lets a single audio asset back many stories without duplication.

**Alternative considered:** Mux at upload via FFmpeg fork (extra ~20MB APK, fork maintenance risk). External preview URLs (illegal). Music as a separate attachment without sync (poor UX).

**Failure mode:** A music track removed by admin while live stories reference it — the player drops the audio track and logs a warning; the story still plays without music.

### Reactions: emoji-only, embedded with 1-per-user constraint

**Decision:** `Stories.reactions: { userId, emoji, createdAt }[]` embedded array. The service layer enforces 1 reaction per `(storyId, userId)` pair — re-reacting overwrites the prior emoji. A unique partial index `{ "_id": 1, "reactions.userId": 1 }` is not feasible in MongoDB; dedupe is enforced via service-side `$pull` then `$push` in a single update operator (`arrayFilters` or transaction).

**Why:** Reactions are low-cardinality (emoji set is finite, ~10 options) and per-story growth is bounded (one row per viewer max). Embedding avoids a join on the hot read path. Capping at 1-per-user prevents the array from growing unbounded.

**Alternative considered:** Separate `Reactions` collection (extra read for every story render). Per-emoji counter only without user attribution (can't show "X reacted with 😂"). Threaded reactions (over-engineered).

### Comments: comment-as-DM via existing messaging capability

**Decision:** A story comment endpoint takes the comment text + storyId, looks up or creates a direct conversation between viewer and author, and creates a regular message in that conversation with `metadata: { type: 'story_reply', storyId, mediaKeyPreview }`. The mobile chat renders messages with this metadata as a regular bubble preceded by a small `StoryReferenceCard` (thumbnail + caption snippet).

**Why:** Matches Instagram and Zalo behavior — privacy-by-default (no public comment thread) and zero new infrastructure (reuses messaging, push, sync). The author sees the reply in their existing Tin nhắn tab without learning a new surface. Adds one optional metadata field to the existing message schema; this is a `MODIFIED` requirement on the `messaging` capability (not new behavior, just optional metadata).

**Alternative considered:** Public comment thread per story (moderation burden, unfamiliar UX in Vietnam). Dedicated story-comments collection (parallel infrastructure with overlapping notification logic).

### Mentions: structured array with privacy-aware notification

**Decision:** Captions are stored as raw `caption: string` plus a parallel `mentions: { userId, username, offset, length }[]` array parsed on submit. On story create, the service iterates mentions and:
1. Looks up the mentioner's `isPrivate` flag (re-uses User.isPrivate or equivalent — if absent, defaults to public)
2. For each mentioned user: if mentioner is public OR mentioner is a connection of the mentioned user, emit `story.mention` to the mentioned user's user-room AND queue an FCM push with deep-link `koola://moments/story/<storyId>`
3. Otherwise: no notification (silent suppression)

**Why:** Matches Meta's documented mention privacy model. Suppresses notification spam from strangers using private accounts.

### Real-time: user-scoped rooms + selective events

**Decision:** Each authenticated socket joins a personal room `user:<userId>` on connect (in addition to any conversation rooms). Story events are emitted to user-rooms:

| Event              | Target                                                | Payload                                                               |
|--------------------|-------------------------------------------------------|-----------------------------------------------------------------------|
| `story.new`        | each viewer's `user:<viewerId>` (filtered by privacy) | `{ storyId, authorId, mediaType, createdAt }`                          |
| `story.deleted`    | each viewer's `user:<viewerId>`                       | `{ storyId, authorId }`                                                |
| `story.mention`    | mentioned `user:<userId>`                             | `{ storyId, authorId, captionSnippet }`                                |
| `story.reaction`   | author's `user:<authorId>`                            | `{ storyId, viewerId, emoji }` (rate-limited to last reaction wins)    |

Viewer count updates are NOT pushed in real-time. Redis `INCR moments:story:<storyId>:views` increments per view; a 60s cron flushes counters back to Mongo `Stories.viewCount`.

**Why:** Conversation rooms are not the right scope — stories are author-fanout, not conversation-broadcast. User-rooms scale identically and don't pollute conversation channels. Batch view-count flush prevents write storms on viral stories.

**Failure mode:** Redis loss between flushes loses up to 60s of view counts. Acceptable given the metric is approximate by nature; the StoryViews collection is the audit trail.

### Module wiring

**Decision:** New `MomentsModule` in `chat-backend/src/moments/` imports `MediaModule`, `NotificationsModule`, `GatewayModule`, `ConversationsModule`, `MessagesModule`. Registered in `app.module.ts` `imports[]`.

**Why:** Follows the pattern used by `MessagesModule`, `ConversationsModule`. Keeps the BusinessesModule-style "must-be-wired" trap visible — a verifier check confirms `MomentsModule` is present in `app.module.ts`.

### Mobile state

**Decision:** New singleton `momentsService` (`ChatApp/src/services/moments/momentsService.ts`) holds:
- `feedRing: { authorId, lastStoryId, hasUnviewed }[]`
- `storiesByAuthor: Map<authorId, Story[]>`
- `viewerCount: Map<storyId, number>`
- `highlights: Map<userId, Highlight[]>`

Updates flow: REST fetch → service → React subscribers via lightweight pub/sub (existing pattern). Socket events go through `socketEventRouter.ts` → `momentsService.handleEvent()`.

**Why:** Matches existing `socketService` / `apiService` singletons. Survives screen navigation, resets on logout. AppState foreground transitions trigger a single `refreshFeed()` call.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| TTL fires up to 60s late, feed shows expired stories | Feed query filters `expiresAt > now` at read time; client-side computed expiry hides stale items pre-fetch |
| Outlier overflow chain corruption mid-write | Idempotent upsert pattern with `storyGroupId + overFlowIndex` unique compound index; partial writes are repaired on next view |
| View dedupe race (two simultaneous opens by same viewer) | Unique compound index `{ storyGroupId, viewerId }` on StoryViews — second insert raises E11000 which the service swallows silently |
| MinIO orphan media if Mongo TTL fires but lifecycle policy misconfigured | Lifecycle policy is the safety net (set to 25h, longer than Mongo TTL); operations runbook includes a daily orphan-detector script |
| Music track removed while stories reference it | Player handles missing audio gracefully (drops track, logs warning); admin-side delete is soft (mark `isActive: false`) and refuses hard-delete if referenced |
| User offline at upload | OfflineQueueService queues with idempotency key; on reconnect, the queued story is uploaded with the same client-generated `clientStoryId` |
| Author blocks a viewer mid-story | Viewer's open viewer screen receives a `story.access_revoked` event or 403 on next fetch and shows "Khoảnh khắc không còn khả dụng" |
| Privacy 'connections' scope when viewer has no connections | Feed query returns empty set; UI shows the standard empty state |
| Mention spam from private accounts targeting non-connections | Notification suppressed silently (Meta-style); the mention text is still rendered visually for users who happen to view the story |
| Highlights media accidentally swept by lifecycle | Highlights media uses a different MinIO prefix (`highlights/`) with no lifecycle policy; promotion does a server-side copy-then-delete; orphan-detector script flags any `stories/` keys still referenced from a Highlight |
| Redis cache stale after AudienceList edit | Service publishes a Redis pub-sub event on list edit that invalidates the per-member `audience:listsContaining:<userId>` cache |
| Redis loses up to 60s of view increments on crash | Acceptable trade-off; StoryViews collection (separate writes) is the audit trail; cron flush is idempotent (read counter, set, delete) |
| Story doc reaches 16MB BSON limit | Outlier pattern triggers overflow at ~200 views; service health-check validates root doc size on every Nth view |

## Migration Plan

1. Deploy backend with `MomentsModule` wired but no client traffic
2. Run MinIO lifecycle policy script (one-time `mc` CLI invocation or backend startup hook) to install 25h expiry on `stories/` prefix
3. Verify TTL index creation by reading Mongo `db.stories.getIndexes()`
4. Seed an initial `MusicTracks` catalog with 5–10 CC0 tracks to give v1 users a non-empty picker
5. Ship mobile build: `MomentsScreen` swaps placeholder for real implementation; composer/viewer/highlights/audience-editor screens registered
6. Feature is live; user-facing strings are Vietnamese; WCAG 2.1 AA on all new screens
7. Monitor: Redis counter flush job logs, MinIO `stories/` prefix size, FCM mention-push delivery rate

**Rollback:** Revert mobile build (placeholder restored). Backend module stays — no DB drops; existing data remains for re-enable. Lifecycle policy can be removed via `mc` CLI if needed.

## Open Questions

- Should Highlights have a soft cap (e.g., 100 highlights per user) to prevent storage abuse? Default to unlimited for v1; revisit on storage telemetry.
- Should the music picker surface a "Trending in KOOLA" section based on usage counts? Possible v1.1 addition once a usage signal exists.
- What happens to a story when its author's account is deleted? Default behavior: hard-delete all author's stories + Highlights + AudienceLists (cascade follows existing user-deletion pattern).
