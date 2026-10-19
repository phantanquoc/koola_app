## Why

The ChatTab Moments feed currently renders 100% mock post data (`momentsMockPosts.ts` with bundled assets, local like state, "chưa có backend" toasts on every action) while the Story subsystem already has a complete backend (CRUD, feed ring, views, reactions, comments, socket + FCM). Users cannot publish or interact with real feed posts, so the social tab cannot function as a real social surface.

## What Changes

- Backend: new `Post` + `PostComment` Mongoose models in the moments module with full REST API — create post (text + multi-media via presigned MinIO keys), cursor-paginated feed, like/unlike, nested reply comments, share-count, edit/delete/report, fullscreen media URL resolution.
- Backend: socket events `post.new` / `post.deleted` / `post.reaction` / `post.comment` emitted to permitted viewer user-rooms, plus FCM mention push reusing the story mention pattern.
- Mobile: new `postsApi` + posts state in the moments service layer; `MomentsScreen` feed reads real posts (pull-to-refresh, cursor pagination, realtime prepend via socket); new post composer screen reusing `mediaUploadService` + `MomentComposerScreen` patterns (multi-image/video pick, caption, audience, mentions, idempotency key).
- Mobile: fullscreen media viewer for post media; post menu (edit/delete/report); share action.
- Cleanup: remove `momentsMockPosts.ts`, `momentsMockStories.ts`, and the mock fallback in `momentsService.refreshFeed`; replace all `notify('...chưa có backend')` post actions with real API calls; offline/empty states show a real empty state instead of mock data.
- `PostCard` / `PostMediaGrid` interfaces stay unchanged — only their data source changes.

## Capabilities

### New Capabilities
- `moments-posts`: Post creation, feed, likes, comments/replies, shares, edit/delete/report, audience scoping, socket + FCM fanout.

### Modified Capabilities
- None (story specs `moments-stories`, `moments-views-and-reactions` keep their requirements; story mock cleanup is implementation detail, not a requirement change).

## Impact

- Backend: `chat-backend/src/moments/` (new schemas, DTOs, controller routes under `/moments/posts`, service methods, gateway emits); new Mongo indexes; `*.spec.ts` coverage per Definition of Done.
- Mobile: `ChatApp/src/services/moments/` (postsApi + state), `MomentsScreen.tsx`, new composer + viewer screens, navigation types; removal of two mock modules; jest + tsc + eslint gates.
- Systems: MinIO presigned upload reuse (no new infra); Redis/socket fanout reuse; FCM reuse. No WebRTC/call changes.
