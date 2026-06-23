## Context

The Moments feature shipped with three release-blocker bugs traced in the conversation:

1. **Privacy hole — `connections` scope is unenforced.** `MomentsService.getFeed` (chat-backend/src/moments/moments.service.ts:303-313) builds a `$or` filter that includes every `audienceScope: "connections"` story without any author filter. `MomentsService.assertViewAccess` (chat-backend/src/moments/moments.service.ts:1101-1108) returns immediately for `CONNECTIONS` with a comment "for v1, 'connections' scope allows all authenticated viewers". `MomentsGateway.resolvePermittedViewers` (chat-backend/src/moments/moments.gateway.ts:142-145) returns `[story.authorId]` for `CONNECTIONS` so only the author receives `story.new`.
2. **Feed UI broken — author identity missing.** `GET /moments/feed` returns `{ authorId, lastStoryId, hasUnviewed, stories[] }`. `MomentsScreen` renders `displayName={isOwn ? user?.displayName : item.authorId}` (ChatApp/src/screens/main/MomentsScreen.tsx:124), so other-user rings render the raw 24-character ObjectId.
3. **Composer false promise.** `MomentComposerScreen.handlePickMedia` calls `launchImageLibrary({ mediaType: 'photo', ... })` (ChatApp/src/screens/moments/MomentComposerScreen.tsx:83) but the button label reads "Chọn ảnh / video". The viewer renders a music attribution pill from `currentStory.musicRef` (ChatApp/src/screens/moments/MomentViewerScreen.tsx:520-527) but no `react-native-track-player` (or equivalent) audio playback is wired — the pill is decorative only.

The Moments roadmap discussed with the user splits remaining work into three changes (stabilization → polish → posts MVP). This change is scope-locked to the three release blockers above.

The codebase does NOT have a dedicated `AccountConnection`/`Friendship` schema. Connection signals today are derived from conversation membership (the `connect-discovery` capability already follows this pattern: tapping "Nhắn tin" creates a DIRECT conversation, which becomes the durable connection record). `messages.service.ts:724` and `gateway/chat.gateway.ts:521,539` consume `conversationsService.getSharedConversationIds(userId)` which returns the list of conversation IDs the user belongs to (NOT the connection user IDs). A new helper is required.

`moments.integration.spec.ts` currently fails 12/15 tests because fixtures use `'story-1'`/`'author-1'` strings as IDs and `MomentsService` validates them via `Types.ObjectId.isValid`. The 12 failures are fixture-only; service logic for those scenarios is not regressed. The fixture fix is in scope because the test suite is the only signal we have for verify gates.

ESLint repo-wide is broken (ESLint 9 flat config not yet ported per the user's standing memory). Verification depends on `tsc --noEmit` and `npm test`, not lint.

## Goals / Non-Goals

**Goals:**
- Enforce `connections` scope server-side via the DIRECT-conversation graph at every boundary: feed query, story read access, gateway emit.
- Enrich feed items with author display name and avatar so the ring renders user-recognizable identity without an extra round-trip.
- Allow the composer to upload video assets and stop showing a music UI that does not function.
- Make `moments.integration.spec.ts` green so verify can rely on the test suite.

**Non-Goals:**
- No new connection schema, no contacts table, no follower/following graph. Connection inference stays consistent with `connect-discovery` (DIRECT conversation = connection).
- No real audio playback integration — that is Step 11 in the Moments roadmap.
- No fix for `cron('*/60 * * * * *')` (will run more frequently than intended), `reactToStory` race condition, FCM mention stub, viewer hold-to-pause resume, mention offset recalc, or `redis.keys()` blocking call. These belong to the next change `moments-polish`.
- No Posts/Feed permanent capability work, no Highlights migration safety work, no AudienceList admin UX work.
- No removal of `MusicTrack` schema, `musicRef` DTO field, `/moments/music-tracks/*` endpoints, or any music-related component file.

## Decisions

### Decision 1: Define "connection" as `share at least one DIRECT conversation`

**Why:** This matches how `connect-discovery` already works in the product (tapping "Nhắn tin" on a discovery card creates a DIRECT conversation, becoming the connection record). It uses an indexed query (`'members.userId'` is multikey-indexed via `ConversationDocSchema.index({ 'members.userId': 1 })`). It avoids introducing a new schema and migration that the rest of the system doesn't yet need.

**Alternatives considered:**
- Dedicated `AccountConnection` schema with explicit `connect` action. Cleaner long-term but requires a UX flow that doesn't exist today, plus migrations and back-fill. Out of scope.
- Use `usersService` graph from `useAccountDiscovery`. That hook discovers business accounts only — not symmetric peer connections.

**Implication for v1:** A user who has never sent a DIRECT message to anyone has zero connections; their `audienceScope: "connections"` story emits `story.new` to nobody. This is acceptable for v1 — a future change can extend the definition (e.g., bidirectional contact action) without re-touching Moments.

### Decision 2: Add `getConnectedUserIds(userId)` to `ConversationsService`, not `MembershipService`

**Why:** `ConversationsService` is the existing aggregator that owns `getSharedConversationIds(userId)` and is already injected into `MomentsService`. `MembershipService` is per-conversation membership ops; cross-conversation aggregation belongs at the higher level.

**Implementation sketch:**

```ts
// conversations.service.ts
async getConnectedUserIds(userId: string): Promise<string[]> {
  if (!Types.ObjectId.isValid(userId)) return [];
  const oid = new Types.ObjectId(userId);
  const convs = await this.conversationModel
    .find({ type: ConversationType.DIRECT, 'members.userId': oid })
    .select('members')
    .lean();
  const others = new Set<string>();
  for (const c of convs) {
    for (const m of c.members) {
      const id = m.userId?.toString();
      if (id && id !== userId) others.add(id);
    }
  }
  return Array.from(others);
}
```

### Decision 3: Inject `ConversationsService` into `MomentsGateway`

**Why:** `MomentsGateway.resolvePermittedViewers` needs the helper. Currently the gateway only injects `AudienceListModel`. `ConversationsModule` already exports `ConversationsService` (used by `messages`, `gateway`). We import `ConversationsModule` into `MomentsModule` already (proposal/tasks line 614 confirms — `commentOnStory` uses it via `MomentsService`). The constructor change is local.

**Alternative considered:** Have `MomentsService` resolve viewers and pass them to the gateway. Rejected: emit-time fanout is the gateway's responsibility, and routing through the service forces synchronous awaits on a fire-and-forget path.

### Decision 4: Self-scope inclusion in feed and access checks

**Why:** Author should always see their own `connections` story. Without this, an author posting a `connections` story with zero connections wouldn't see it on their own ring and would think the post failed.

**Implementation:** In `getFeed`'s `$or`:
```
{ audienceScope: "connections", authorId: { $in: connectionIds } },
{ authorId: viewerId }  // self always visible regardless of scope
```
In `assertViewAccess`: short-circuit `if (story.authorId === viewerId) return;` before scope checks.

### Decision 5: Feed enrichment via single `findByIds` after grouping

**Why:** Feed groups by author, so distinct author count == feed length (typically ≤ 50 for a single page). One `findByIds([...])` call is O(1) round-trips. Inline within `getFeed` keeps the surface small.

**Schema fields used:** `User.displayName` (string), `User.avatar` (string, nullable). Both already projected by the default `findByIds` (which selects `-passwordHash`).

**Edge case:** if the User document is deleted but stories remain (orphan), set `authorDisplayName = ''` and `authorAvatar = null`. Mobile fallback to "Người dùng" / placeholder avatar.

### Decision 6: Composer asset detection

**Why:** `react-native-image-picker`'s `Asset` type provides `type` (MIME) and `duration` (seconds, video only). `mediaType: 'mixed'` is supported and maps to "image OR video".

**Library constraint:** `react-native-image-picker@8.2.1`'s `ImageLibraryOptions` does NOT include `durationLimit` — that field is only on `CameraOptions`. The 60-second cap is therefore enforced client-side in JavaScript after the picker returns, by inspecting `asset.duration`. This is a library limitation, not a design choice; the spec scenario reflects it.

**Implementation:**
```ts
const isVideo = (asset.type ?? '').startsWith('video/') || asset.duration != null;
const detectedType: 'image' | 'video' = isVideo ? 'video' : 'image';
if (isVideo && asset.duration != null && asset.duration > 60) {
  setErrorMsg('Video dài quá 60 giây');
  setStep('error');
  return;
}
```

The DTO's `duration` field is already optional; we pass it through only for videos. The client-side guard above is the actual 60-second enforcement (the picker cannot pre-filter by duration on the library version we use).

### Decision 7: Hide music UI by code, keep components

**Why:** Removing the import or deleting components creates fragile diffs that Step 11 has to revert. Hiding the render block at the use-site (composer's preview step + viewer's pill) is reversible by editing two files.

**Implementation pattern:**
```tsx
// MomentComposerScreen.tsx — preview render
{/* Music picker entry — hidden in v1, restore in Step 11 */}
{false && (
  <TouchableOpacity style={styles.optionRow} onPress={() => setShowMusicPicker(true)}>
    ...
  </TouchableOpacity>
)}
{false && (
  <MusicPicker ... />
)}
```
The `false &&` short-circuit is intentional: it preserves the JSX for review while the bundler tree-shakes the dead branch in release. Alternative — extract behind a prop flag — overkill for a temporary suppression.

The state variables (`musicRef`, `showMusicPicker`) and `loadAudienceLists` callback can stay in place; they are unreferenced in the active render path but cheap. ESLint warnings are tolerable since the lint config is broken anyway.

### Decision 8: Test fixture migration via shared helper

**Why:** 12 failures share the same root cause (`'story-1'` not a valid ObjectId). A single helper function `oid()` returning `new Types.ObjectId().toString()` placed at the top of `moments.integration.spec.ts` lets us replace literals in-place without restructuring assertions.

**Concern:** Some tests assert string equality of returned IDs (e.g., `expect(result.messageId).toBe('msg-1')`). Those need fresh fixed-but-valid IDs created at the `beforeEach` level so equality still holds.

### Decision 9: Branch strategy

Create `feat/moments-stabilization` branched off `master` (current local HEAD is on `master` per `git status`). Apply step does the branch creation. Push as a separate PR distinct from the merged `feat/business-accounts-and-admin` work.

## Risks / Trade-offs

- **[Connection definition is approximate]** A DIRECT conversation can be initiated by either party with a single tap. Users who block/dislike each other but were ever in a DIRECT conversation are still "connections" until one deletes the conversation. → Mitigation: acceptable for v1; the privacy guarantee improves dramatically vs. the current "everyone sees everything" baseline. A future explicit-block list is orthogonal to this change.
- **[Feed query cost]** `getFeed` now calls `getConnectedUserIds(viewerId)` once per page. For a viewer with thousands of connections this is a single indexed query but the resulting `$in` array could be large. → Mitigation: `'members.userId'` is multikey-indexed; Mongo handles `$in` of thousands of ObjectIds. If this becomes a real cost, we cache the connection set per viewer in Redis (~5 min TTL) following the same pattern as `getViewerListMembership`. Out of scope here.
- **[Gateway emit scales with author's connections]** A user with 5,000 connections triggers 5,000 `io.to(...).emit(...)` calls per `story.new`. `redis-adapter` handles cross-instance fanout, but the in-memory loop is O(n). → Mitigation: acceptable at current scale. If degraded, switch to a single emit per author with a server-side filter at receive (more complex; defer).
- **[Test fixture migration touches many lines]** Mass replace of string IDs is a wide diff. → Mitigation: localize through helper `oid()`; review diff carefully before merge.
- **[Music UI suppression is `false &&` not feature flag]** Looks like dead code at first glance. → Mitigation: explicit `// kept for Step 11` comment beside the suppressed block.
- **[Hidden music render still leaves `currentStory.musicRef` truthy in payloads]** Stories created BEFORE this change shipped that already have `musicRef` set will not show the pill (good) but the player still applies `muted={!!currentStory.musicRef}` on the `<Video>` element. With no parallel audio player wired, those legacy stories play silently. → Acceptable; user impact is limited to a small set of QA stories created in pre-release builds.

## Migration Plan

No data migration required. The change is purely additive at the schema level (only adds two derived fields to the API response) and behavioral at the service/gateway level (tightens privacy enforcement).

**Rollback strategy:** revert the PR. The connection helper is purely additive; reverting only un-tightens privacy back to the buggy state. No downstream coupling.

## Open Questions

None. All decisions above are made autonomously per the autopilot brief.
