## 1. Backend Post Data Model

- [x] 1.1 Create `Post` schema (caption, media[] {mediaKey, mediaType, thumbnailKey, duration}, mentions, audienceScope, audienceListId, likes[] {userId, createdAt}, likeCount, commentCount, shareCount, clientPostId, isActive, timestamps) + indexes (authorId+createdAt, audienceScope, authorId+clientPostId unique partial)
- [x] 1.2 Create `PostComment` schema (postId, parentId nullable, authorId, content ≤1000, isActive) + indexes (postId+createdAt, parentId) 
- [x] 1.3 Create `CreatePostDto` (caption ≤5000, media 0–10 items, audienceScope + custom audienceListId conditional, mentions, clientPostId) + `CommentPostDto`, `ReportPostDto` with class-validator
- [x] 1.4 Register schemas in `MomentsModule` via `MongooseModule.forFeature` ← (verify: module boots, indexes created)

## 2. Backend Post Service + Controller

- [x] 2.1 Implement `createPost` (idempotency via clientPostId + 11000 race handling, video ≤60s validation, custom-scope ownership check, mention user validation) mirroring `createStory`
- [x] 2.2 Implement `getPostsFeed` (cursor pagination, audience visibility $or filter, batch author lookup, presigned media URLs, reactionCounts, likedByMe, 2-comment preview)
- [x] 2.3 Implement like/unlike toggle (idempotent, atomic counts), `sharePost` (increment + deep link), `updatePost` (caption/audience only, author-only), `deletePost` (soft, author-only), `reportPost` (record for moderation)
- [x] 2.4 Implement comments: `commentOnPost` (top-level + reply with parent validation), `listPostComments` (cursor pagination + reply preview), `deletePostComment` (author or post-author, soft-delete, decrement)
- [x] 2.5 Wire controller routes under `/moments/posts` (POST /, GET /feed, GET /:id, PATCH /:id, DELETE /:id, POST /:id/like, DELETE /:id/like, POST /:id/share, POST /:id/report, POST /:id/comments, GET /:id/comments, DELETE /comments/:commentId) with JWT guard + DTO validation ← (verify: all spec scenarios reachable, 400/403 cases covered)
- [x] 2.6 Backend unit + integration tests (`*.spec.ts` next to service: create/feed/like/comment/share/delete/report incl. idempotency + audience scoping)

## 3. Backend Realtime + Push

- [x] 3.1 Add `post.new` / `post.deleted` / `post.reaction` / `post.comment` emits in `MomentsGateway` (ID-only payloads, `user:<id>` rooms via permitted-viewer resolution reused from stories)
- [x] 3.2 Reuse FCM mention push for post mentions with `notif:mention:<user>:<postId>` dedup key + `koola://moments/post/:id` deep link ← (verify: events received in permitted rooms only, payloads <10KB)

## 4. Mobile Service Layer (postsApi + state)

- [x] 4.1 Create `postsApi` typed wrappers mirroring controller routes exactly
- [x] 4.2 Extend `momentsService` singleton with post state (postsById, feedIds, cursor, isLoadingPosts, postsError) + actions (refreshPosts, loadMorePosts, createPost, toggleLike, addComment, sharePost, editPost, deletePost, reportPost) + `handlePostEvent` for `post.*` socket events (prepend on post.new via fetch-by-id, remove on post.deleted, patch counts on reaction/comment)
- [x] 4.3 Service-layer tests for post actions + socket handling ← (verify: state transitions, realtime prepend/remove, no duplicate on replay)

## 5. Mobile Feed UI (real data)

- [x] 5.1 Rewire `MomentsScreen` feed from `MOCK_MOMENTS_POSTS` to service post state (pull-to-refresh, cursor infinite scroll, skeleton cold load, inline error banner with retry, real empty state with composer entry)
- [x] 5.2 Wire all `PostCard` actions to real flows: like toggle (optimistic + reconcile), comment bottom-sheet (list + reply + post), share sheet via `sharePost` deep link, author → profile nav, menu → edit/delete/report, media → fullscreen viewer
- [x] 5.3 New fullscreen post media viewer screen (swipeable multi-media, pinch zoom for images, video playback) ← (verify: every spec Mobile-Feed scenario passes, zero "chưa có backend" toasts for post actions)

## 6. Mobile Post Composer

- [x] 6.1 New `PostComposerScreen` (multi-asset pick up to 10 via image picker, per-video 60s client cap with inline error, caption ≤5000 with counter, audience picker, mentions, upload progress per asset via `uploadMedia`, single POST with `clientPostId`, inline error + retry preserving inputs, offline queue replay with same key)
- [x] 6.2 Navigation wiring (composer entry from feed header/composer prompt + empty state, back on success, new post appears at feed top) ← (verify: all Mobile-Composer scenarios, no data loss on failure)

## 7. Mock Cleanup + Regression

- [x] 7.1 Delete `momentsMockPosts.ts` + `momentsMockStories.ts`; remove mock fallback in `refreshFeed` (errors set `error` state, no mock data); remove bundled `src/assets/mock-feed/` if unused elsewhere
- [x] 7.2 Update `MomentsScreen.spec.tsx` to assert real empty-state + header-always-renders invariants (no mock assertions)
- [x] 7.3 Full gates: backend jest + build, mobile jest + tsc + eslint, `*.spec.ts` next to new code per Definition of Done ← (verify: gates green, no references to deleted mock modules)
