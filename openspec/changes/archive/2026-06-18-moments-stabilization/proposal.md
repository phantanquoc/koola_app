## Why

The shipped Moments (Khoảnh khắc) feature carries three release-blocker bugs:

1. **Privacy hole**: stories posted with `audienceScope: 'connections'` are returned by `getFeed` to every authenticated viewer, and `MomentsGateway.resolvePermittedViewers` only emits `story.new` to the author themselves. Both code sites carry self-admitted "best-effort for v1" comments. A user who posts to "Người kết nối" today still leaks to total strangers.
2. **Broken feed UI**: `GET /moments/feed` does not return author display name or avatar, so `MomentRing` renders the raw MongoDB ObjectId where the user's name should be — the screen looks broken on first launch.
3. **Composer mismatch**: the composer button reads "Chọn ảnh / video" but `launchImageLibrary` is hard-coded to `mediaType: 'photo'`, so video upload is impossible. The viewer also shows a "🎵 ..." music attribution pill, but no audio player is wired — music is currently a UI lie.

These three bugs together gate any wider rollout of Moments. This change closes them without expanding scope (no new capabilities, no Posts/Feed permanent, no Highlights/AudienceList rework).

## What Changes

- **MODIFIED** `moments-stories` capability — `audienceScope: 'connections'` is now enforced server-side via the connection graph derived from DIRECT conversations:
  - `getFeed` returns `connections`-scoped stories only when the author shares at least one DIRECT conversation with the viewer (or the viewer is the author).
  - `assertViewAccess` rejects `connections` access when the viewer has no shared DIRECT conversation with the author.
  - `MomentsGateway.resolvePermittedViewers` for `connections` returns the author's real connection set (not just the author).
- **MODIFIED** `moments-stories` capability — `GET /moments/feed` response items now include `authorDisplayName: string` and `authorAvatar: string | null` fetched in a single `usersService.findByIds()` call, so the mobile ring can render user-recognizable identity.
- **MODIFIED** `moments-stories` capability — composer accepts video:
  - `launchImageLibrary` opens with `mediaType: 'mixed'`, `videoQuality: 'medium'`, `durationLimit: 60`.
  - The composer detects asset type and sets `mediaType` to `'video'` or `'image'` correctly when calling `POST /moments/stories`.
  - UI hint reads "Ảnh hoặc video tối đa 60 giây".
- **MODIFIED** `moments-music-library` capability — client-side music UI is hidden in v1 while audio playback is unwired:
  - Composer hides the "Thêm nhạc" entry; every story created via the composer has `musicRef = null`.
  - Viewer hides the music attribution pill.
  - Backend schemas, endpoints (`/moments/music-tracks/*`), and `musicRef` DTO field remain unchanged so Step 11 can re-enable the surface without a backend migration.

Out of scope (will be addressed by later changes in the Moments roadmap, not here): cron expression `*/60 * * * * *`, `reactToStory` race condition, FCM mention stub, viewer hold-to-pause resume, mention offset recalc, Posts/Feed permanent, Highlights migration safety, audience-list admin UX.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `moments-stories`: privacy enforcement for `connections` scope, feed item enrichment with author identity, and composer video support are spec-level requirement changes — feed/access/emit behaviour and the composer requirement currently described in the archived 2026-06-10-moments-feature delta need amendment.
- `moments-music-library`: music client surface is suppressed in v1; backend contract is unchanged but the spec scenarios about composer music picker visibility and viewer music attribution change.

## Impact

**Backend (`chat-backend/`)**
- `chat-backend/src/conversations/conversations.service.ts` — add `getConnectedUserIds(userId): Promise<string[]>` returning distinct other-member userIds across all `type='direct'` conversations the user belongs to.
- `chat-backend/src/conversations/conversations.module.ts` — verify `ConversationsService` is exported (it already is — used by `messages`, `gateway`); no module wiring change expected unless missing.
- `chat-backend/src/moments/moments.service.ts` — `getFeed`, `assertViewAccess`, and the feed return type all consume the new helper and enrich items with `authorDisplayName`/`authorAvatar`.
- `chat-backend/src/moments/moments.gateway.ts` — `resolvePermittedViewers` for `connections` calls the helper.
- `chat-backend/src/moments/moments.module.ts` — inject `ConversationsService` into `MomentsGateway` (currently only `MomentsService` has it).
- `chat-backend/src/moments/moments.integration.spec.ts` — replace ad-hoc string IDs (`'story-1'`, `'author-1'`, etc.) with `new Types.ObjectId().toString()` so the suite stops failing 12/15 on `Types.ObjectId.isValid`.
- `chat-backend/src/moments/moments.service.spec.ts` — add CONNECTIONS-privacy describe block.
- `chat-backend/src/moments/moments.gateway.spec.ts` — add `resolvePermittedViewers` test for connections.

**Mobile (`ChatApp/`)**
- `ChatApp/src/services/moments/momentsApi.ts` — extend `FeedItem` with `authorDisplayName: string` and `authorAvatar: string | null`.
- `ChatApp/src/services/moments/momentsService.ts` — extend `FeedRingItem` with the same fields, populate from `refreshFeed()`. `handleStoryNew` populates them as empty placeholders until the next refresh.
- `ChatApp/src/screens/main/MomentsScreen.tsx` — `renderItem` reads `item.authorDisplayName` / `item.authorAvatar` for non-own rings; own ring still uses `useAuth().user`.
- `ChatApp/src/screens/moments/MomentComposerScreen.tsx` — `mediaType: 'mixed'` + `videoQuality` + `durationLimit`, asset-type detection, hint text update, hide the "Thêm nhạc" row and `MusicPicker` modal at use-site (component file untouched).
- `ChatApp/src/screens/moments/MomentViewerScreen.tsx` — hide the music attribution pill render block (component code stays).

**Specs (`openspec/`)**
- New change directory `openspec/changes/moments-stabilization/` with `proposal.md`, `design.md`, `specs/moments-stories/spec.md` delta, `specs/moments-music-library/spec.md` delta, and `tasks.md`.

**Out-of-scope guarantees**
- No schema migrations.
- No removal of `MusicTrack` schema, `musicRef` DTO field, or `/moments/music-tracks/*` endpoints.
- No deletion of `MusicPicker.tsx`, `MentionTextInput.tsx`, `AudienceListEditorScreen.tsx`, or `HighlightsScreen.tsx`.
- No changes to `pushNotificationService`, FCM mention path, viewer hold-pause logic, mention offset calculator, cron expressions, or reaction race fix.
