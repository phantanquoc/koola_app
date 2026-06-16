## Why

KOOLA's `Khoảnh khắc` (Moments) tab is currently a placeholder screen — users see only a "feature in development" state. The product needs a story-style sharing surface so users can post ephemeral image/video moments with music, captions, mentions, and 3-tier privacy controls, with permanent re-pin via Highlights. This is core social engagement that complements the chat-first product and uses existing infrastructure (MinIO presigned uploads, Socket.IO + Redis fanout, FCM push) without adding new architectural layers.

Doing this now unblocks the existing UI placement (already wired in `ChatHomeScreen.tsx` top-tabs) and avoids carrying a permanent placeholder while users discover the app.

## What Changes

- **NEW** Story posting flow: image or video + caption + optional music + audience scope (public / connections / custom list) + @mentions
- **NEW** Story feed (avatar ring at top of `Khoảnh khắc` tab) showing unviewed-first ordering scoped by 3-tier privacy filter
- **NEW** Fullscreen story viewer with auto-advance, swipe-down dismiss, video+music compose-at-playback
- **NEW** Reactions: emoji-only, capped at 1 per viewer per story, embedded on story doc
- **NEW** Comments-as-DM: a story comment is delivered as a direct message in the existing chat conversation between viewer and author, tagged with `{type: 'story_reply', storyId}` metadata
- **NEW** "Who viewed" list on author's own stories
- **NEW** Highlights: author can pin an expired story permanently; surfaced on profile
- **NEW** Reusable Audience Lists ("Bạn thân", "Đồng nghiệp") for the `custom` privacy scope; managed in a dedicated editor screen
- **NEW** Music library curated by KOOLA admin (CC0/license-cleared), with provenance metadata; music picker in composer
- **NEW** 24h MongoDB TTL expiry on stories with MinIO `stories/` prefix lifecycle policy (25h) for orphan media cleanup
- **NEW** Real-time `story.new` / `story.deleted` / `story.mention` / `story.reaction` socket events fanned out via Redis adapter to user-scoped rooms
- **NEW** Mention notifications via FCM with privacy gating (Meta-style: private accounts only notify connected users)
- **MODIFIED** `ChatHomeScreen.tsx` top-tab `Moments` swaps from placeholder to real `MomentsScreen`
- **MODIFIED** `socketEventRouter.ts` (mobile) routes new `story.*` events to a `momentsService` listener
- **MODIFIED** `app.module.ts` (backend) imports the new `MomentsModule`

## Capabilities

### New Capabilities
- `moments-stories`: story creation, schema, feed query with 3-tier privacy filter, TTL expiry, MinIO lifecycle, `story.new` socket fanout, story deletion (soft + hard), @mention parsing and notification
- `moments-views-and-reactions`: StoryViews collection with outlier overflow, Redis INCR view counter + 60s cron flush, view dedupe via unique compound index, reactions embedded array with 1-per-user constraint, "who viewed" endpoint, comment-as-DM bridge into the messages capability
- `moments-highlights`: Highlights grouping documents, promote-to-highlight (nullify `expiresAt`), MinIO key migration to `highlights/` prefix, Highlights screen on user profile, ordered story re-arrangement
- `moments-audience-lists`: AudienceLists CRUD endpoints, named reusable lists, Redis cache for `viewerListMembership` invalidated on edit, picker UI in composer
- `moments-music-library`: MusicTracks collection with provenance fields (license type, source URL, attribution), admin-curated catalog, music picker UI, compose-at-playback player (separate video + audio streams synced at render time)

### Modified Capabilities
- `messaging`: messages may now carry an optional `storyReply` metadata block referencing a story, rendered with a story-reference card in the chat bubble; outbound messages from a story comment endpoint use this metadata
- `chat-presence`: not modified
- `message-sync-engine`: not modified — story events use a separate user-room channel and do not pass through conversation sync

## Impact

**Backend (`chat-backend/`)**
- New module `chat-backend/src/moments/` with controller, service, gateway, schemas (Story, StoryView, Highlight, AudienceList, MusicTrack), DTOs
- New cron job for Redis view-count flush (every 60s)
- New MinIO lifecycle policy script (run on startup or via `mc` CLI) for `stories/` prefix
- Wires into existing `MediaModule` (presigned upload), `NotificationsModule` (FCM), `GatewayModule` (socket fanout), `ConversationsModule` (story-comment-as-DM)
- `app.module.ts` imports `MomentsModule`
- `messages.service.ts` accepts optional `storyReply` metadata when creating a message via the moments comment endpoint

**Mobile (`ChatApp/`)**
- `screens/main/MomentsScreen.tsx` rewritten to real implementation (story ring + feed)
- New screens: `MomentComposerScreen.tsx`, `MomentViewerScreen.tsx`, `HighlightsScreen.tsx`, `AudienceListEditorScreen.tsx`
- New components: `MomentRing`, `MomentReactionBar`, `MusicPicker`, `MentionTextInput`, `StoryReferenceCard` (chat-side renderer)
- New service: `services/moments/momentsService.ts` (singleton, follows existing `socketService`/`apiService` pattern)
- `services/sync/socketEventRouter.ts` routes `story.*` events
- `navigation/ChatTabStack.tsx` registers composer/viewer (modal stack) and highlights routes
- Outbound story upload integrates with existing `OfflineQueueService` for offline resilience

**Out of scope (v1)**
- Vietnamese pop catalog (requires VCPMC license — defer to v2)
- FFmpeg mux at upload time (compose-at-playback only)
- AR filters / drawing tools / stickers / text overlays beyond captions
- Story analytics dashboard for authors
- Sponsored stories / ads
- Cross-post to Shorts feed
- Anonymous / Snap-style ephemeral that bypasses TTL
- YouTube and Spotify integrations (ToS prohibit audio/video sync — confirmed in research)

**Dependencies**
- No new npm packages on backend (uses existing Mongoose, Redis, Mongo TTL)
- Mobile reuses `react-native-video`, `react-native-image-picker`, `react-native-fast-image`, `@react-native-community/netinfo` already in `package.json`
- MinIO `mc` CLI for lifecycle policy (or backend startup hook using existing MinIO client)
