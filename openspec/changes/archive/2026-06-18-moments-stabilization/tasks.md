## 1. Backend — Connection helper

- [x] 1.1 Add `getConnectedUserIds(userId: string): Promise<string[]>` to `chat-backend/src/conversations/conversations.service.ts`. Implementation per design.md Decision 2: query `Conversation` where `type === DIRECT` and `members.userId` contains the user's ObjectId; return distinct other-member userIds as strings. Guard non-ObjectId input by returning `[]`.
- [x] 1.2 Verify `ConversationsService` is exported from `chat-backend/src/conversations/conversations.module.ts` (it is — used by `messages` and `gateway`); no module change expected. Confirm import path consistency.
- [x] 1.3 If `chat-backend/src/conversations/conversations.service.spec.ts` exists, add a unit test for `getConnectedUserIds`: mock `conversationModel.find` returning two DIRECT conversations whose `members` overlap with the viewer; assert distinct other-member IDs returned and viewer's own ID excluded. Skip if no spec file exists. ← (verify: helper covers ObjectId-validated input; viewer excluded from output; deduplicates across multiple shared conversations)

## 2. Backend — Privacy CONNECTIONS fix

- [x] 2.1 In `chat-backend/src/moments/moments.service.ts` `getFeed` (~line 281): before building the `$or` filter, call `const connectionIds = await this.conversationsService.getConnectedUserIds(viewerId)`. Replace the unfiltered `{ audienceScope: AudienceScope.CONNECTIONS }` clause with `{ audienceScope: AudienceScope.CONNECTIONS, authorId: { $in: connectionIds } }`. Append `{ authorId: viewerId }` as an unconditional self-visibility clause so the author always sees their own stories regardless of scope. Remove the "best-effort for v1" comment block.
- [x] 2.2 In the same `getFeed`, ensure the cursor logic still works after the new clause: `cursor` filter remains `authorId: { $gt: cursor }` applied at top level. Verify no contradiction with the OR clauses (the cursor narrows the candidate set; OR clauses define eligibility — both compose correctly).
- [x] 2.3 In `MomentsService.assertViewAccess` (~line 1101): add an early return `if (story.authorId === viewerId) return;` before the scope switch. For `AudienceScope.CONNECTIONS`, replace the unconditional `return` with `const connectionIds = await this.conversationsService.getConnectedUserIds(viewerId); if (!connectionIds.includes(story.authorId)) throw new ForbiddenException('Story is not accessible');`. Remove the "for v1" comment.
- [x] 2.4 In `chat-backend/src/moments/moments.gateway.ts` `resolvePermittedViewers` (~line 127): for `AudienceScope.CONNECTIONS`, replace `return [story.authorId]` with `return await this.conversationsService.getConnectedUserIds(story.authorId)`. The existing `for (const viewerId of recipientIds) { if (viewerId === story.authorId) continue; ... }` loop in `emitStoryNew` already excludes the author, so the helper return value can include or exclude the author safely.
- [x] 2.5 Inject `ConversationsService` into `MomentsGateway`: add constructor parameter `private readonly conversationsService: ConversationsService` (alongside the existing `audienceListModel` injection). The class is already in `MomentsModule.providers` and `ConversationsModule` is already in `MomentsModule.imports`, so no module wiring change needed; verify by reading `chat-backend/src/moments/moments.module.ts` first.
- [x] 2.6 Also update `resolvePermittedViewers` PUBLIC branch comment to acknowledge the limitation honestly — keep `return [story.authorId]` for PUBLIC since `emitStoryNew` short-circuits PUBLIC to `io.emit(...)` namespace broadcast (line 56-60 in current gateway), so the helper return is unused for PUBLIC. Document this in the inline comment. ← (verify: connections privacy enforced at all three boundaries — getFeed, assertViewAccess, gateway emit — and author can still see their own content)

## 3. Backend — Feed item enrichment

- [x] 3.1 In `MomentsService.getFeed`, after `allItems` is built, collect `const authorIds = [...new Set(allItems.map((it) => it.authorId))]`. Call `const users = await this.usersService.findByIds(authorIds)`. Build `const userById = new Map(users.map((u) => [u._id.toString(), u]))`.
- [x] 3.2 Map each item: `const u = userById.get(item.authorId); item.authorDisplayName = u?.displayName ?? ''; item.authorAvatar = u?.avatar ?? null;`. Apply enrichment AFTER `slice(0, limit)` so we don't fetch users for items we won't return.
- [x] 3.3 Update the `getFeed` return type annotation to include `authorDisplayName: string` and `authorAvatar: string | null` on each item. Add the two fields to the `FeedItem` local type defined inside the function. ← (verify: feed response shape includes both fields; missing User documents result in `''` and `null` respectively, no exception)

## 4. Backend — Test fixture remediation

- [x] 4.1 At the top of `chat-backend/src/moments/moments.integration.spec.ts`, add helper `function oid(): string { return new Types.ObjectId().toString(); }` (import `Types` from `mongoose`).
- [x] 4.2 Replace literal IDs that fail `Types.ObjectId.isValid` (`'story-1'`, `'author-1'`, `'highlight-1'`, `'list-1'`, `'msg-1'`, `'conv-1'`, etc.). Where a test asserts equality on the ID, generate the value once at `beforeEach` (e.g., `let storyId: string; beforeEach(() => { storyId = oid(); ... })`) so assertions stay valid.
- [x] 4.3 Update `getSharedConversationIds` mock returns where needed (e.g., line 115, 242, 359, 470, 593, 716) to keep behavior compatible.
- [x] 4.4 Run `cd chat-backend && npm test -- moments.integration.spec` and confirm 0 fixture-related failures. Resolve any new failure caused by the migration. ← (verify: 12 previously failing tests now pass; 3 previously passing tests remain green; total 15 pass)

## 5. Backend — Privacy unit tests

- [x] 5.1 In `chat-backend/src/moments/moments.service.spec.ts` add `describe('Privacy CONNECTIONS scope', () => { ... })` covering:
  - getFeed excludes connections-scope story from author with no shared DIRECT conversation
  - getFeed includes connections-scope story from author who shares a DIRECT conversation
  - getFeed always includes viewer's own connections-scope stories
  - assertViewAccess throws ForbiddenException when viewer is not a connection
  - assertViewAccess passes when viewer is a connection
  - assertViewAccess passes when viewer is the author (regardless of scope)
- [x] 5.2 In `chat-backend/src/moments/moments.gateway.spec.ts` add tests for `resolvePermittedViewers`: returns the author's `getConnectedUserIds` result for CONNECTIONS; returns AudienceList memberIds for CUSTOM (already covered — verify still green); returns `[author.authorId]` placeholder for PUBLIC (existing behaviour). Provide a mock `ConversationsService` with `getConnectedUserIds: jest.fn().mockResolvedValue(['userA', 'userB'])`.
- [x] 5.3 Run `cd chat-backend && npm test -- moments` and confirm full suite green. ← (verify: full moments test suite passes; new privacy assertions reflect the spec's MODIFIED requirements)

## 6. Mobile — Type and service updates

- [x] 6.1 In `ChatApp/src/services/moments/momentsApi.ts`, extend `FeedItem` interface with `authorDisplayName: string` and `authorAvatar: string | null`. No other surface changes.
- [x] 6.2 In `ChatApp/src/services/moments/momentsService.ts`, extend `FeedRingItem` interface with `authorDisplayName: string` and `authorAvatar: string | null`. In `refreshFeed` map: `feedRing: response.items.map((it) => ({ authorId: it.authorId, lastStoryId: it.lastStoryId, hasUnviewed: it.hasUnviewed, authorDisplayName: it.authorDisplayName, authorAvatar: it.authorAvatar }))`.
- [x] 6.3 In `momentsService.handleStoryNew` (socket event handler), populate the new fields with empty placeholders (`authorDisplayName: ''`, `authorAvatar: null`) when adding a new ring item from a `story.new` event. Document the placeholder via a comment that a follow-up `refreshFeed()` will fill in the real values; if `existing` is found, preserve its name/avatar. ← (verify: typed feed surface end-to-end; no runtime `undefined` access)

## 7. Mobile — MomentsScreen ring rendering

- [x] 7.1 In `ChatApp/src/screens/main/MomentsScreen.tsx` `renderItem`, change the prop bindings:
  - `displayName={isOwn ? (user?.displayName ?? 'Tôi') : (item.authorDisplayName || 'Người dùng')}`
  - `avatarKey={isOwn ? user?.avatar : (item.authorAvatar ?? undefined)}`
- [x] 7.2 Confirm `ownRing` placeholder construction (line ~109) still produces a valid `FeedRingItem` after the type change — supply `authorDisplayName: ''` and `authorAvatar: null` so the placeholder type-checks. ← (verify: ring renders display name + avatar correctly for self and others; falls back to "Người dùng" if backend returns empty name)

## 8. Mobile — Composer video support

- [x] 8.1 In `ChatApp/src/screens/moments/MomentComposerScreen.tsx` `handlePickMedia`, change the `launchImageLibrary` call to:
  ```ts
  const result = await launchImageLibrary({
    mediaType: 'mixed',
    quality: 0.8,
    videoQuality: 'medium',
    durationLimit: 60,
    selectionLimit: 1,
    includeExtra: true,
  });
  ```
- [x] 8.2 After receiving the asset, detect type per design.md Decision 6:
  ```ts
  const isVideo = (asset.type ?? '').startsWith('video/') || asset.duration != null;
  const detectedType: 'image' | 'video' = isVideo ? 'video' : 'image';
  if (isVideo && typeof asset.duration === 'number' && asset.duration > 60) {
    setErrorMsg('Video dài quá 60 giây');
    setStep('error');
    return;
  }
  setMedia({
    uri: asset.uri ?? '',
    type: detectedType,
    mimeType: asset.type ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    fileSize: asset.fileSize ?? 0,
    duration: isVideo ? asset.duration : undefined,
    filename: asset.fileName ?? 'moment',
  });
  setStep('preview');
  ```
- [x] 8.3 In `handlePublish`, the existing `mediaType: media.type` line already routes the dynamic type correctly — verify by reading the current code; no change beyond removing any leftover hardcoded `'image'`. The `duration` field is already passed through to the DTO conditionally.
- [x] 8.4 Replace the helper text "Chỉ ảnh, tối đa 5MB" (~line 209) with "Ảnh hoặc video tối đa 60 giây".
- [x] 8.5 Update `accessibilityLabel` for the picker button if it still says "image" only — keep it generic: "Chọn ảnh hoặc video từ thư viện".
- [x] 8.6 If the video preview should be shown via `Image` source — check whether `<Image>` handles `uri: 'file://...mp4'` (it does NOT cross-platform). For the preview step, keep the existing `<Image>` component if asset is image; for video assets, render a placeholder message "Video được chọn — bấm Đăng để gửi". This avoids pulling in `<Video>` for the preview which would expand scope. Implement minimally:
  ```tsx
  {media && (media.type === 'image' ? (
    <Image source={{ uri: media.uri }} style={styles.previewMedia} ... />
  ) : (
    <View style={styles.previewMedia /* black background reused */}>
      <KoolaText tone="surface" align="center">Video đã chọn ({media.duration}s)</KoolaText>
    </View>
  ))}
  ```

## 9. Mobile — Hide music UI in composer + viewer

- [x] 9.1 In `MomentComposerScreen.tsx` preview render, wrap the music picker entry `<TouchableOpacity style={styles.optionRow} onPress={() => setShowMusicPicker(true)}> ... </TouchableOpacity>` in `{false && ( ... )}` and add `{/* Music picker — hidden in v1, restore in Step 11 */}` comment immediately above. Apply the same wrapping to the `<MusicPicker visible={showMusicPicker} ... />` render in the same file.
- [x] 9.2 In `MomentViewerScreen.tsx` (~line 520-527), wrap the music attribution pill JSX `{currentStory?.musicRef && trackInfo && ( <View style={styles.musicPill}> ... </View> )}` in `{false && ( ... )}` (keep the original conditional inside) with comment `{/* Music pill — hidden in v1, restore in Step 11 */}`.
- [x] 9.3 Do not delete `MusicPicker.tsx`, do not remove `MusicPicker` import in composer, do not remove `musicRef` from `Story`/`FeedItem`/`MomentsService` types.
- [x] 9.4 If the file ends up with unused `useState`/imports (`musicRef`, `setMusicRef`, `showMusicPicker`, etc.) that produce TS6133 unused-var errors, comment them out with `// kept for Step 11` next to the declaration. The repo's TS config does not have `noUnusedLocals: true` (verify by checking `chat-backend/tsconfig.json` and `ChatApp/tsconfig.json` if mobile complains). If it does, prefix with `_` or wrap with `void` so TS accepts. ← (verify: composer has no music entry visible; viewer never renders the music pill; tsc passes)

## 10. Cross-stack verification

- [x] 10.1 Run `cd chat-backend && npx tsc --noEmit` — must pass with no errors. Capture output to `tsc_result.txt` (existing file in repo) only if changes made; otherwise discard.
- [x] 10.2 Run `cd chat-backend && npm test -- moments` — full moments suite must pass (15 integration + ~26 service unit + gateway unit + new privacy tests). Record final test count in PR description.
- [x] 10.3 Run `cd ChatApp && npx tsc --noEmit` — must pass with no errors.
- [x] 10.4 (manual, document only) Smoke test plan to include in PR description: "User A and User B have never chatted. User A posts a story with scope='Người kết nối'. User B opens app → Khoảnh khắc tab → ring does NOT show User A. User A and User B exchange one direct message. User B pulls-to-refresh → ring NOW shows User A with their display name and avatar; tap → viewer plays the story." ← (verify: cross-stack tests green; manual smoke test plan articulated in PR; out-of-scope bugs untouched)

## 11. OpenSpec & branch hygiene

- [x] 11.1 Run `openspec validate moments-stabilization --strict` and resolve any structural validation errors (typically header-format issues). Re-run until clean.
- [ ] 11.2 Create branch `feat/moments-stabilization` off `master`. Commit changes in logical chunks (helper → privacy fix → enrichment → mobile → tests). Do NOT include unrelated files (verified at exploration time: working tree was clean off `master`).
- [ ] 11.3 Push branch and prepare PR with smoke test plan from 10.4. Do NOT merge — verification step decides green-light. ← (verify: spec validates strict; branch contains only moments-stabilization scope; PR description carries smoke test plan)
