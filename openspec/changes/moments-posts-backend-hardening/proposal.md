## Why

The Moments tab is functionally complete after the D1/D3/D5 bug-fix wave (id contract, comment counting, sheet freeze, edit post, share/deep link), but its backend still stores likes embedded in the post document, comment deletes can permanently skew counts, share/report endpoints have no idempotency, and media posts cannot be created offline. This change hardens the backend and closes the remaining offline + dev-warning gaps so the tab can be committed as done.

## What Changes

- Move post likes from the embedded `likes[]` array to a dedicated `post_likes` collection with a one-time migration that preserves existing likes.
- Add comment likes, a dedicated replies endpoint with `_id`-based cursor pagination, and cascade delete so deleting a parent comment removes its replies (counts stay exact).
- Emit socket `post.comment` with the comment view + parent post's updated state, and send a push notification to the post author on new comments.
- Fix feed N+1 batching, add Redis 24h share dedup, report dedup + hide reported posts, and persist image width/height.
- Root-cause and fix the dev warning "Text strings must be rendered within a `<Text>`" in the Moments flow.
- Extend the offline outbox `create_post` flow from text-only to media posts (upload on reconnect, idempotent via `clientPostId`).

## Capabilities

### New Capabilities

(none — all work modifies existing capabilities)

### Modified Capabilities

- `moments-posts`: like storage moves to `post_likes` collection; comment cascade delete; replies endpoint; `_id` comment cursor; share dedup + `appLink` contract; report dedup + hide-reported; image dimensions.
- `moments-views-and-reactions`: comment likes; `post.comment` socket payload carries comment view + post update; comment push to post author.
- `message-outbox`: `create_post` supports media payloads with deferred upload and idempotent replay.
- `mobile-content-consistency`: no unwrapped text nodes in the Moments render path (dev warning eliminated).

## Impact

- Backend: `chat-backend/src/moments` (post schema, `post_likes` schema, service, controller, DTOs, gateway, Redis), one-time likes migration, new/changed `moments-posts.spec.ts` cases.
- Mobile: `ChatApp/src/services/moments` (service, `postsApi`), outbox `create_post` handler + repository payload, `MomentViewerScreen`, `PostComposerScreen`, new/updated interaction specs.
- Feed read path changes (batching) affect `GET /moments/posts` consumers — response shape stays compatible.
- Out of scope: user blocking, haptics, editing media after publish, web client.
