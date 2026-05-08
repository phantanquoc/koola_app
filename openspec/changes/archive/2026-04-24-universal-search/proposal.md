## Why

The app has a search bar in KoolaHeader that is currently non-functional — tapping it does nothing. Users have no way to find past messages, locate contacts, or navigate to conversations by name. This blocks a basic communication workflow that users expect from any chat application.

## What Changes

- KoolaHeader search bar placeholder updated from "Hỏi AI hoặc tìm kiếm" to "Tìm kiếm"; `onSearchPress` wired to navigate to new UniversalSearchScreen
- New `UniversalSearchScreen` — tabless, single-input search screen with results grouped by category
- Three search categories rendered in unified results:
  - **Conversations** — client-side filter over in-memory conversation list (no API call)
  - **Contacts/Users** — delegates to existing `GET /users/search?q=` API
  - **Messages** — new `GET /messages/search?q=&limit=&cursor=` endpoint backed by MongoDB `$text` index
- New backend endpoint and service method for message full-text search, scoped to conversations the requesting user is a member of
- MongoDB text index added to the `messages` collection on the `content` field
- New `SearchMessagesDto` with validation; new `messages-search.controller.ts` and method in `MessagesService`
- Navigation: `UniversalSearch` route added to `ChatTabStackParamList`

## Capabilities

### New Capabilities

- `universal-search`: Full-screen search experience covering conversations (client-side), contacts (existing API), and messages (new API) with grouped results, per-section loading states, and tap-to-navigate behaviour
- `message-search-api`: Backend endpoint and service logic for full-text message search scoped to the authenticated user's conversations, including MongoDB text index definition

### Modified Capabilities

- `user-search`: Surface is extended — results are now also shown inside UniversalSearchScreen in addition to (or replacing) the existing contacts-tab search. The underlying API contract is unchanged; only the client consumer changes.

## Impact

- **Backend**: `messages` schema gets a text index; new controller route under `/messages`; `MessagesModule` exports updated
- **Mobile**: New screen file, new hook, navigation param types updated, `KoolaHeader` wired
- **No breaking API changes** — existing `/users/search` and all message endpoints are additive-only
- **Dependencies**: No new npm packages required; MongoDB `$text` is built-in; no new services needed
