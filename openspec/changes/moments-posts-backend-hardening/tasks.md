## 1. Like storage migration (backend)

- [x] 1.1 Add `post_likes` schema with unique `(postId, userId)` index + `comment_likes` schema with unique `(commentId, userId)` index
- [x] 1.2 Rewrite `togglePostLike`/`removePostLike` onto `post_likes` with dual-read fallback to embedded `likes[]`
- [x] 1.3 Add one-time guarded migration copying embedded `likes[]` into `post_likes` (idempotent re-run)
- [x] 1.4 Add `POST /moments/posts/comments/:commentId/like` toggle for comment/reply likes
- [x] 1.5 Extend `moments-posts.spec.ts`: migration no-loss/no-dup, toggle semantics, comment likes, 403/404 on invisible post ← (verify: likeCount equals row count per post after migration)

## 2. Comment tree integrity (backend)

- [x] 2.1 Cascade soft-delete: top-level delete soft-deletes replies in the same write, `commentCount` decrements by active rows affected
- [x] 2.2 Add `GET /moments/posts/:id/comments/:commentId/replies` with `_id` cursor pagination
- [x] 2.3 Fix feed N+1 batching on the feed read path (response shape unchanged, `resolvePost()` id contract intact)
- [x] 2.4 Extend `moments-posts.spec.ts`: cascade counts, replies cursor stability under concurrent inserts, tombstone + `activeCommentCount` agreement ← (verify: deleting a parent with 2 replies drops the count by exactly 3)

## 3. Share/report hardening (backend)

- [x] 3.1 Redis `SET NX EX 24h` share dedup per `(userId, postId)`; repeat share returns existing payload without increment
- [x] 3.2 Report dedup via unique `(postId, reporterId)`; hide reported posts from the reporter's feed
- [x] 3.3 Persist validated image `width`/`height` on media entries (sanity-bounded, 400 on absurd values)
- [x] 3.4 Extend `moments-posts.spec.ts`: share dedup, report dedup + hide-reported, dimension validation ← (verify: second share in-window leaves shareCount unchanged)

## 4. Realtime + push (backend + mobile)

- [x] 4.1 `post.comment` socket payload carries `{ postId, comment, commentCount, postUpdated }` (stays <10KB); `post.reaction` unchanged in shape
- [x] 4.2 Push to post author on new comments (standard eligibility gates, `koola://moments/post/:postId` link); no push for author's own comments
- [x] 4.3 Mobile: consume the enriched `post.comment` payload in `momentsService.handlePostEvent` without regressing the `activeCommentCount` overlay pin ← (verify: thread-corrected count survives a socket replay)

## 5. Offline media posts (mobile)

- [x] 5.1 Extend `create_post` outbox payload with `media[]` local-asset references; composer enqueues instead of failing when offline
- [x] 5.2 Dispatcher uploads each asset via presigned URL when online, then creates the post with the stored `clientPostId` (retry-after-lost-response creates no duplicate)
- [x] 5.3 Surface upload progress + retry in PostComposer; failed rows land in `dead_letter` with visible Vietnamese error
- [x] 5.4 Interaction spec: offline media post publishes exactly once on reconnect ← (verify: one post per clientPostId after replay)

## 6. Text-warning root cause + device smoke (mobile)

- [x] 6.1 Add strict render test failing on "Text strings must be rendered within a `<Text>`" across `MomentViewerScreen` post-link branch and comment sheet states; fix the unwrapped string(s) found
- [ ] 6.2 Android device smoke: keyboard PostDetail, double-tap vs scroll, share dismiss, video poster, 320dp rail — record results
- [x] 6.3 Full gates: backend moments specs 100/100, mobile moments specs green, tsc clean vs baseline (only pre-existing errors), Jest mobile at baseline suite count ← (verify: every spec scenario in this change has a passing test)
