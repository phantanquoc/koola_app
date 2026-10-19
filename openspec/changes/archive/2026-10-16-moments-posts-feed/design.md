## Context

The ChatTab Moments surface has two halves with opposite maturity. Stories are production-grade: `chat-backend/src/moments/` has Story CRUD, cursor feed (`GET /moments/feed`), views, reactions, comments, highlights, audience lists, music, `MomentsGateway` socket emits (`story.new`, `story.deleted`, `story.mention`, `story.reaction`) to `user:<id>` rooms, and FCM mention push with Redis dedup. Mobile has `MomentComposerScreen` (mixed picker, 60s video cap, presigned MinIO upload, idempotency key) and a live story ring rail.

Feed posts are the opposite: backend has zero post code, and mobile renders `MOCK_MOMENTS_POSTS` (bundled assets, local like state) with every action stubbed as a "chưa có backend" toast. `PostCard` and `PostMediaGrid` are well-built presentational components whose `FeedPost` interface can stay unchanged. `mediaUploadService.uploadMedia` (presigned PUT → MinIO via blob-util) is directly reusable.

## Goals / Non-Goals

**Goals:**
- Real Post backend mirroring Story conventions (layer separation controller → service → schema, DTO validation, cursor pagination, idempotency, socket + FCM fanout).
- Real mobile post feed: paginated list, pull-to-refresh, realtime prepend, full like/comment-reply/share/menu/viewer flows against the API.
- New post composer reusing story composer patterns (multi-media, caption, audience, mentions, idempotency).
- Remove all post/story mock data so empty states are real.

**Non-Goals:**
- New tabs or navigation restructuring; feed layout (story rail + vertical post list) is unchanged.
- Redesigning `PostCard` / `PostMediaGrid` interfaces.
- Touching WebRTC/calls, highlights, audience lists, music library internals.
- Changing story requirements (specs `moments-stories`, `moments-views-and-reactions` untouched).

## Decisions

1. **Post as a separate model in the moments module, not an extension of Story.** Story has 24h TTL expiry, single-media, overflow docs, and view tracking — none of which apply to permanent multi-media posts. A dedicated `Post` + `PostComment` schema keeps queries and indexes clean. Alternative (add `kind` discriminator to Story) rejected: it would pollute every story query with type filters and break the TTL partial index assumptions.

2. **Reuse Story's audience + mention + fanout machinery verbatim.** Same `AudienceScope` enum semantics, same `resolvePermittedViewers` approach for socket emits, same FCM mention push with Redis dedup key pattern (`notif:mention:<user>:<postId>`). New event names `post.new` / `post.deleted` / `post.reaction` / `post.comment` follow the existing `story.*` naming. Rationale: clients and backend already handle this shape; consistency beats novelty.

3. **Likes as embedded reaction entries (like Story), comments as a separate collection.** Post likes are single-emoji ("Thích"), low-cardinality per user, and only counts + `likedByMe` are read on the feed — embedding matches Story's proven pattern. Comments need nesting (reply), pagination, and independent deletion, so a `PostComment` collection with `{ postId, parentId, authorId }` index beats embedding. Alternative (embed both) rejected: unbounded comment arrays break the 10KB socket payload budget and make reply pagination impossible.

4. **Feed endpoint returns resolved view models.** Like `getStoryById` returns `mediaUrl`/`reactionCounts`/`myReaction`, `GET /moments/posts/feed` returns posts with presigned media URLs (1h), reaction counts, `likedByMe`, and top-2 comment previews. Rationale: `PostCard` already consumes exactly this shape (`reactionCount`, `commentCount`, `likedByMe`, `comments` preview); no component change needed.

5. **Mobile state: extend the moments singleton, don't create a parallel service.** Add `postsApi` + post state/actions to the existing `momentsService` pub/sub singleton (same pattern as feedRing). Socket router handles `post.*` alongside `story.*`. Rationale: one subscription surface for `MomentsScreen`, consistent offline/error handling, no new singleton lifecycle to manage on logout.

6. **Composer: new `PostComposerScreen` cloned from `MomentComposerScreen` flow, extended to multi-asset.** Same steps (pick → edit/caption → audience → publish with `clientPostId` idempotency), but the picker allows multiple selection and each asset uploads via `uploadMedia` before a single `POST /moments/posts`. Video duration cap stays 60s per asset, enforced client-side like stories.

7. **Share = share-count + system share sheet.** `POST /moments/posts/:id/share` increments `shareCount` and returns the post's deep link (`koola://moments/post/:id`); mobile opens the OS share sheet. No repost-to-feed semantics in v1 (explicit non-goal to avoid feed-ranking questions).

## Risks / Trade-offs

- [Risk] Feed N+1 when resolving author profiles + presigned URLs per post → Mitigation: batch author lookup (single `findByIds`), batch presigned URL generation, cap page size at 20 like story feed.
- [Risk] Socket payload >10KB for posts with many media items → Mitigation: `post.new` payload carries only IDs + counts; clients fetch full post via `GET /moments/posts/:id`.
- [Risk] Duplicate posts on offline-queue replay → Mitigation: `clientPostId` idempotency with unique partial index `{ authorId, clientPostId }`, same race-handling (return winner on 11000) as stories.
- [Risk] Deleting mock modules breaks the Phase-1 regression tests that assert mock rendering → Mitigation: update `MomentsScreen.spec.tsx` to assert real empty-state behavior; keep the "header always renders" invariant.
- [Trade-off] No repost/quote in v1 — share is count + external link only. Documented as follow-up, not hidden.
