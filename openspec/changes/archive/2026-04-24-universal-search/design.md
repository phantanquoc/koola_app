## Context

The app has a branded header (`KoolaHeader.tsx`) rendered on `ChatHomeScreen` with a tappable search bar whose `onSearchPress` is not wired. Users cannot find messages, contacts, or conversations by keyword. The backend has a `GET /users/search?q=` endpoint and `MessagesService` for existing capabilities, but no text search on messages.

Current tech stack facts that constrain this design:
- React Native 0.76, React Navigation 6 (native stack + material top tabs)
- NestJS 11, Mongoose, MongoDB Atlas (or local replica)
- Message schema already has `conversationId` and `content` fields; no text index exists
- `conversationsApi`, `usersApi`, and `apiClient` singletons live in `apiService.ts`
- Navigation type registry lives in `navigation/types.ts`; `ChatTabStackParamList` controls what screens sit above `ChatHome`

## Goals / Non-Goals

**Goals:**
- Wire the existing KoolaHeader search bar to open a dedicated `UniversalSearchScreen`
- Provide client-side conversation filtering (no API)
- Surface existing user search API results inside the new screen
- Add a new message full-text search endpoint and display results grouped with conversations and contacts
- Minimum 2-character query threshold (consistent with `ContactSearchBar.tsx`)
- Each section collapses to 3 results with "Xem thêm" expand; per-section loading states
- Tapping a result navigates to the correct screen (Chat, Profile)

**Non-Goals:**
- AI-powered or semantic search
- Search history / recent searches persistence
- Search within a single conversation (that is a separate in-chat feature)
- Search for media files or call logs
- Relevance ranking beyond MongoDB $text score

## Decisions

### D1: MongoDB $text index on messages.content

**Chosen:** Add `MessageSchema.index({ content: 'text' })` in `message.schema.ts`.

**Alternatives considered:**
- Regex (`$regex`) query — simple but does a full collection scan, unacceptable at scale
- Atlas Search (Lucene-backed) — much richer but requires Atlas M10+ tier and separate configuration; out of scope for MVP
- Elasticsearch — external dependency, ops overhead, overkill for the current user base

**Rationale:** MongoDB `$text` is built-in, uses an inverted index, works with the existing Mongoose setup, and handles Vietnamese diacritics sufficiently for MVP when the collation is set to `strength: 2`.

### D2: Search scoped to user's conversations via $in on conversationId

**Chosen:** In the service method, first fetch the list of `conversationId` values the requesting user is a member of, then run the `$text` search filtered by `{ conversationId: { $in: [...] }, deleted: false }`.

**Alternatives considered:**
- Embedding userId in message documents for direct index lookup — requires schema migration and write amplification
- Trusting the text index alone without conversation scoping — privacy violation; user could find messages from conversations they left

**Rationale:** The `ConversationsService.findByUserId` already exists. Fetching the user's conversation IDs before the text search adds one extra MongoDB query but preserves the security invariant that search results are scoped to accessible conversations. At typical conversation counts (<1000 per user) this is fast.

### D3: New controller file `messages-search.controller.ts` (additive, not modifying existing controller)

**Chosen:** Add `MessagesSearchController` as a separate file registered in `MessagesModule`.

**Alternatives considered:**
- Add `GET /messages/search` route to existing `MessagesController` — would work but that file is already large and handles per-conversation routes; a dedicated controller keeps concerns separate
- Put it in a new `SearchModule` — adds cross-module wiring complexity for a single endpoint; not justified

**Rationale:** Follows the existing pattern: `MessagesController` + `MessagesSyncController` both live in `MessagesModule`. A third controller `MessagesSearchController` is consistent.

### D4: Cursor-based pagination for message search

**Chosen:** `cursor` = base64-encoded last document `_id`. The response includes `nextCursor: string | null`.

**Alternatives considered:**
- Page/offset — non-deterministic when documents are inserted between pages; bad for infinite scroll

**Rationale:** Consistent with how `usersApi.searchUsers` already paginates (cursor field). The client "Xem thêm" button just passes the cursor on the next call.

### D5: Client-side conversation filter (no API call)

**Chosen:** Filter the in-memory conversation list already loaded by `ConversationListScreen` by matching `conversation.name` and `memberDisplayNames` locally.

**Alternatives considered:**
- New `GET /conversations/search?q=` endpoint — adds backend complexity for data the client already holds

**Rationale:** The conversation list is already fetched and cached in the `useConversations` hook state. A client-side filter is instantaneous and avoids an unnecessary round trip for what is always a small list.

### D6: UniversalSearchScreen lives in ChatTabStack (NativeStack push)

**Chosen:** Add `UniversalSearch: undefined` to `ChatTabStackParamList` and register the screen in `ChatTabStack.tsx`.

**Alternatives considered:**
- Modal (RootStack) — harder to compose with back-navigation to specific chat
- Separate SearchStack — over-engineered for a single screen

**Rationale:** Pushing onto `ChatTabStack` means `navigation.navigate('Chat', ...)` from a search result works naturally within the same stack; no cross-stack navigation gymnastics needed.

## API Contract

```
GET /messages/search?q=<string>&limit=<number>&cursor=<string>
Authorization: Bearer <token>

Response 200:
{
  "items": [
    {
      "messageId": "string",
      "conversationId": "string",
      "conversationName": "string",
      "senderId": "string",
      "senderDisplayName": "string",
      "content": "string",          // raw content; client highlights match
      "createdAt": "ISO8601"
    }
  ],
  "nextCursor": "string | null",
  "total": number
}

Query constraints:
- q: min 2 chars, max 100 chars
- limit: default 20, max 50
- cursor: optional, opaque base64 string
```

## Data Model Change

`message.schema.ts` — add after existing indexes:
```
MessageSchema.index({ content: 'text' }, { default_language: 'none' });
```

`default_language: 'none'` disables stemming so Vietnamese words are indexed as-is. MongoDB's text search still tokenises on whitespace.

## Mobile Data Flow

```
KoolaHeader.onSearchPress
  → navigation.navigate('UniversalSearch')
  → UniversalSearchScreen mounts, TextInput auto-focused
  → user types ≥2 chars (debounced 300 ms)
  → useUniversalSearch hook fires:
      [A] client filter over in-memory conversations
      [B] usersApi.searchUsers(q)
      [C] messagesApi.searchMessages(q)
  → results rendered in 3 grouped sections
  → user taps result → navigation.navigate('Chat', { conversationId })
                      or navigation.navigate('Profile', { userId })
```

## Risks / Trade-offs

- **$text index build time:** If the messages collection is large, adding the text index may take time on first deploy. Mitigation: build index in background (`{ background: true }`) or run the index creation as a migration script before deploying the NestJS app update. MongoDB Atlas will also report index build progress.

- **$in with large conversation list:** If a user is a member of thousands of conversations, passing all IDs in `$in` becomes inefficient. Mitigation: cap the conversation ID list at 500 for the search query (covering realistic usage); document the limit in the DTO.

- **Vietnamese text tokenisation:** MongoDB $text splits on whitespace. Multi-word Vietnamese queries ("xin chào") work, but partial word matches (user types "chà") will not match "chào" unless phonetic variants are indexed. Mitigation: acceptable for MVP; document this limitation. Full diacritic-aware search can be added with Atlas Search in a later sprint.

- **"Xem thêm" UX for message results:** Expanding goes from 3 to full paginated list. The screen does not have a separate "message search results" sub-screen in MVP; expanding just loads more inline. If the list grows very long, a dedicated sub-screen should be added. Mitigation: cap expanded view at 20 results (one page); show a footer link "Xem tất cả kết quả tin nhắn" that can be wired later.

- **Navigation to a specific message in Chat:** The `ChatScreen` currently loads from the latest message and does not accept a `messageId` parameter for scroll-to. Tapping a message result navigates to the conversation but does not auto-scroll to the matched message. Mitigation: Accept this limitation for MVP and document it. The `Chat` route already supports `conversationId`; scroll-to can be added in a follow-up task once message virtualisation supports it.
