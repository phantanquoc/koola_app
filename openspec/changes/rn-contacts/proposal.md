## Why

The chat app currently has no way for users to discover and connect with each other. ContactsScreen is a placeholder, preventing users from starting new conversations or viewing each other's profiles. This change implements user search, contact discovery, and direct message initiation.

## What Changes

- **New RN ContactsScreen:** Search-first UI with debounced text search. Shows search results as a FlatList with avatar, name, and online indicator. Tap a user → navigate to Chat.
- **New RN ProfileScreen:** Full profile view (avatar, display name, email, online status) with "Start Chat" button.
- **New Backend endpoint `GET /users/search`:** Paginated user search by email or display name (case-insensitive). Excludes the authenticated user.
- **New Backend endpoint `POST /conversations/direct/:userId`:** Find-or-create direct conversation. Returns existing DM if one exists, otherwise creates a new one.
- **New RN components:** `ContactItem`, `UserAvatar`, `ContactSearchBar` — reusable, consistent with existing design language.
- **New RN hook:** `useContactsSearch` — debounced search with loading/error/empty states.

## Capabilities

### New Capabilities

- `user-search`: User discovery via search by email or display name. Public — any authenticated user can search and find other users. Supports cursor pagination, minimum 2-character query.

### Modified Capabilities

- None. This change is purely additive.

## Impact

**React Native (`ChatApp/`):**
- New: `useContactsSearch` hook, `ContactItem` component, `UserAvatar` component, `ContactSearchBar` component
- New: Full implementation of `ContactsScreen`, `ProfileScreen`
- Modified: `apiService.ts` — added `searchUsers()` and `startDirectChat()` API methods
- Modified: `navigation/types.ts` — added profile navigation params

**NestJS Backend (`chat-backend/`):**
- New: `GET /users/search` endpoint + `UsersService.searchUsers()` method
- New: `POST /conversations/direct/:userId` endpoint + `ConversationsService.findOrCreateDirect()`
- Modified: `UsersController` — added search endpoint
- Modified: `ConversationsController` — added direct DM endpoint

**Dependencies:**
- No new npm dependencies — all existing packages are sufficient.

**No breaking changes** to existing API contracts.
