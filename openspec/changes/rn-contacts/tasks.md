## 1. Backend: User Search Endpoint

- [x] 1.1 Create `chat-backend/src/users/dto/search-users.dto.ts` — DTO with `@IsOptional() @IsString() @MinLength(2)` for `q`, `@IsOptional() @IsString()` for `cursor`, `@IsOptional() @IsInt() @Min(1) @Max(100)` for `limit` (default 20) ← (verify: DTO validates q min length 2, limit max 100, cursor is optional)
- [x] 1.2 Add `searchUsers(query: string, currentUserId: string, cursor?: string, limit?: number)` method to `UsersService` — query MongoDB `$or: [{email: {$regex, $options: 'i'}}, {displayName: {$regex, $options: 'i'}}]`, exclude currentUserId, sort by displayName, paginate with limit+1 ← (verify: search is case-insensitive, regex special chars handled, self excluded, pagination works)
- [x] 1.3 Add `GET /users/search` endpoint to `UsersController` — query params from DTO, calls `usersService.searchUsers`, returns `{ items: User[], hasMore: boolean, nextCursor: string | null }` ← (verify: endpoint protected by @ApiBearerAuth, returns 401 without token, returns correct shape, excludes current user)

## 2. Backend: Find-or-Create Direct DM

- [x] 2.1 Add `findOrCreateDirect(currentUserId: string, targetUserId: string)` method to `ConversationsService` — check existing direct conv with both members, create if not found ← (verify: returns existing conversation if found (type: "direct"), creates new if not found, both user IDs in members)
- [x] 2.2 Add `POST /conversations/direct/:userId` endpoint to `ConversationsController` — calls `conversationsService.createDirect`, returns 201 ← (verify: returns 400 "Cannot message yourself" when targetId === current userId, returns 404 when targetUser not found, returns 201 on new create)

## 3. RN: API Client

- [x] 3.1 Add `searchUsers(q: string, cursor?: string)` to `ChatApp/src/services/api/apiService.ts` — `GET /users/search?q=<q>&cursor=<cursor>` ← (verify: function calls correct endpoint, returns typed response)
- [x] 3.2 Add `startDirectChat(userId: string)` to `ChatApp/src/services/api/apiService.ts` — `POST /conversations/direct/<userId>` ← (verify: function calls correct endpoint, returns typed Conversation)

## 4. RN: Shared Components

- [x] 4.1 Create `ChatApp/src/components/UserAvatar.tsx` — if `avatar` prop: render circular `<Image>`. If not: render circle with initials (first letter of `displayName[0].toUpperCase()`), background color from deterministic palette (8 colors, index = displayName.charCodeAt(0) % 8) ← (verify: renders image when avatar present, renders initials when not, color is deterministic for same name)
- [x] 4.2 Create `ChatApp/src/components/ContactItem.tsx` — renders `UserAvatar` + displayName + online dot (green if `isOnline`, gray otherwise), `onPress` callback, tappable row ← (verify: online dot shows correct color, onPress fires, layout correct)
- [x] 4.3 Create `ChatApp/src/components/ContactSearchBar.tsx` — TextInput with search icon, debounce 300ms, `onSearch(query: string)` callback, clear button when text present ← (verify: debounce 300ms, clear button appears when text present, fires callback only when ≥2 chars)

## 5. RN: Hooks

- [x] 5.1 Create `ChatApp/src/hooks/useContactsSearch.ts` — manages search state: `{ results, isLoading, error, search(query), loadMore(), clear() }`. Calls `searchUsers()` API, pagination support ← (verify: debounce 300ms from ContactSearchBar, handles empty/loading/error states, pagination appends results correctly)

## 6. RN: ContactsScreen

- [x] 6.1 Implement full `ChatApp/src/screens/main/ContactsScreen.tsx` — remove placeholder, add `ContactSearchBar` at top, FlatList of `ContactItem` for results, default empty state "Search for people by name or email", on item tap → call `startDirectChat(userId)` → navigate to ChatScreen ← (verify: search bar triggers search, results render as ContactItem list, empty state shows when no query, tap navigates to chat)
- [x] 6.2 Handle search error state — if API fails, show inline error "Search failed. Tap to retry." with retry button ← (verify: error state shown on API failure, retry button re-triggers search)

## 7. RN: ProfileScreen

- [x] 7.1 Implement full `ChatApp/src/screens/main/ProfileScreen.tsx` — remove placeholder, show `UserAvatar` (large), displayName, email, online status with lastSeen formatted (e.g., "Last seen 2 hours ago"), "Start Chat" button (blue, full-width) ← (verify: shows user info from route params, Start Chat button navigates to ChatScreen with conversationId)
- [x] 7.2 Wire "Start Chat" button — on press: call `startDirectChat(userId)` → navigate to Chat → navigate back ← (verify: button creates/returns DM, navigates to correct conversation, navigates back)

## 8. RN: Navigation Types

- [ ] 8.1 Add `userId: string` param to `ContactsStackParamList` profile screen in `ChatApp/src/navigation/types.ts` ← (verify: navigation passes userId to ProfileScreen correctly)

## 9. TypeScript + Verification

- [x] 9.1 Run `npx tsc --noEmit` in `chat-backend/` — fix any type errors
- [x] 9.2 Run `npx tsc --noEmit` in `ChatApp/` — fix any type errors
- [x] 9.3 Review all `// TODO` / `// FIXME` comments added during implementation and address
- [x] 9.4 Run `openspec verify rn-contacts` — confirm all tasks pass verification
