## Context

The Moments tab shipped its UI/UX polish (Phase 1, archived `2026-10-21-moments-tab-uiux-polish`) and its D1/D3/D5 bug-fix wave (uncommitted working tree: id contract, tombstoned comment counts with `activeCommentCount`, `key={sheetEpoch}` sheet remount, PostComposer edit mode, `koola://moments/post/:id` deep links). The backend, however, still carries the v1 shortcuts: likes embedded in the `Post` document (`likes: PostLikeEntry[]`), no comment likes, parent-comment delete that orphans replies, no dedicated replies endpoint, offset-style comment cursors, an N+1 feed read path, and no share/report idempotency. Offline post creation (`create_post` outbox op) is text-only. A dev-only "Text strings must be rendered within a `<Text>`" warning fires somewhere in the Moments flow with no identified source.

Constraints: backend is stateless + horizontally scaled (Socket.IO Redis adapter, `main.ts`), so dedup must live in Redis, not memory. Mobile owns UI state; backend emits domain events. Mongo is the source of truth; MinIO holds media bytes. The feed read path must stay response-compatible — mobile keys cards by `post.id` (`resolvePost()`).

## Goals / Non-Goals

**Goals:**
- Like storage that scales: `post_likes` collection + migration, plus comment likes.
- Comment tree integrity: cascade delete, dedicated replies endpoint, `_id` cursor, exact counts.
- Realtime completeness: `post.comment` carries the comment view + updated post; post author gets a push.
- Abuse resistance: Redis 24h share dedup, report dedup + hide-reported.
- Stable media layout: persisted image width/height.
- Zero dev warnings in the Moments render path (root-caused, not silenced).
- Offline media posts: queue, upload on reconnect, idempotent replay.

**Non-Goals:**
- User blocking, haptics, editing media after publish, web client, changing the feed response shape.

## Decisions

1. **New `post_likes` collection with unique `(postId, userId)` index; migrate embedded `likes[]` once at deploy.** Why: embedded arrays grow unbounded per document and make "who liked" queries expensive; a collection with a unique index gives atomic toggle semantics. Alternative (keep embedded + cap) rejected — caps lose data. Migration runs once (guard flag in DB), copying each embedded entry; rollback keeps the old array intact until the migration is verified, then a follow-up removes it.
2. **Comment likes as a `comment_likes` collection (same pattern), single-level replies kept.** Why: consistency with post likes; nested replies stay single-level per existing spec — no threading redesign.
3. **Cascade soft-delete: deleting a top-level comment soft-deletes its replies in the same write; `commentCount` decrements by the number of active rows affected.** Why: the current "orphan replies + stale count" bug is exactly what the D1/D3/D5 wave worked around client-side; fixing server-side removes the need for client compensation. Tombstone rendering already exists on mobile.
4. **Dedicated `GET /moments/posts/:id/comments/:commentId/replies` with `_id` cursor.** Why: the thread endpoint returning nested replies double-counted with the sheet's flat rendering; a separate paginated replies endpoint keeps both renderings truthful. `_id` cursor over `createdAt` offset — stable under concurrent inserts.
5. **Share dedup via Redis `SET NX EX 24h` per `(userId, postId)`; report dedup via unique `(postId, reporterId)` in Mongo.** Why: share is high-frequency and ephemeral → Redis; reports are moderation records that must survive → Mongo unique index. Duplicate share returns the existing `{ shareCount, deepLink, appLink }` without incrementing; duplicate report returns success without a new row, and reported posts are excluded from that viewer's feed.
6. **`post.comment` socket payload becomes `{ postId, comment (view), commentCount, postUpdated }`.** Why: clients currently patch counts from separate reads and race; one payload carries everything the card + sheet need. Payload stays <10KB (no media bytes).
7. **Image width/height captured at upload (client-reported, server-validated bounds) and stored on the media entry.** Why: the feed can reserve aspect-ratio boxes before bytes arrive — no layout jump. Client-reported with sanity clamping (reject absurd values) rather than server-side probing (avoids downloading bytes on the hot path).
8. **Offline media posts: `create_post` payload gains `media[]` with local URIs + `clientPostId`; the outbox handler uploads each asset via presigned URL when online, then creates the post with the same `clientPostId`.** Why: reuses the proven idempotent replay (server returns existing post on `clientPostId` replay) — a retry after a lost response cannot duplicate. Media upload happens inside the handler before post creation, in order; progress is best-effort (survives app restart via the durable row).
9. **Text-warning hunt: bisect by rendering `MomentViewerScreen` post-link branch and `MomentsScreen` sheet states with a strict-mode test that fails on `console.error` "Text strings" — fix the unwrapped string, don't add a blanket error suppressor.** Why: the warning means a real render bug; suppressing it hides future ones.

## Risks / Trade-offs

- [Risk] Likes migration on a large `posts` collection is slow → Mitigation: batched cursor migration with progress logging; old array kept until verified; rollback = drop new collection, code reads old path behind a flag.
- [Risk] Cascade delete changes `commentCount` semantics for existing clients → Mitigation: response shape unchanged; mobile already renders tombstones + `activeCommentCount`, so it converges.
- [Risk] Share dedup changes "shareCount increments per call" behavior → Mitigation: spec delta makes 24h per-user dedup explicit; count still increments for distinct users.
- [Risk] Offline media upload retries could double-upload bytes → Mitigation: idempotency is on post creation (`clientPostId`); orphaned MinIO objects are acceptable (existing media GC story, out of scope).

## Migration Plan

1. Deploy backend with dual-read (new collections authoritative, old `likes[]` fallback) + migration job behind a guard flag.
2. Run migration; verify counts match (`post.likeCount` == `post_likes` count per post).
3. Deploy mobile (outbox v2 payload, tombstone/cascade handling already present).
4. Follow-up change removes the embedded `likes[]` field and the fallback read.

## Open Questions

- Migration timing: automatic at deploy vs. one-click manual? (Default: automatic with guard flag + backup; confirm before apply.)
- Device for Android smoke test (keyboard, double-tap vs scroll, share dismiss, video poster, 320dp rail) — needed at verify time.
