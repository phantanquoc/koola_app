## Why

Universal Search opens a message's conversation but not the selected message, API failures can look like empty results, the Contacts destination is actually global people search, and group member addition exposes a raw user-ID field. These behaviors make discovery technically functional but inefficient and confusing.

## What Changes

- Open a selected message at its exact conversation context and briefly highlight it.
- Distinguish loading, empty, partial failure, and full failure per search section with retry actions.
- Rename the global people-search destination so its label matches its behavior instead of implying a saved contact list.
- Replace raw group-member ID entry with searchable user selection and duplicate/current-member filtering.
- Add a narrowly-scoped backend extension for bidirectional message-context retrieval (`GET /conversations/:id/messages?around=<messageId>&limit=N`) — verified necessary because current `chat-backend/src/messages` only paginates backward by `createdAt` with no "around a message" query.
- Preserve existing search, direct-conversation, group-member, and message authorization contracts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `universal-search`: Message results navigate to exact message context and section failures remain distinguishable from empty results.
- `user-search`: The mobile destination and empty-state language accurately describe global people search.
- `conversation-management`: Group admins select members through user search instead of entering opaque identifiers.
- `message-sync-api`: Add bidirectional context retrieval around a target message.

## Impact

- Universal Search route params, result items, Chat entry/context loading, people-search labels, and GroupInfo member controls.
- Backend: `chat-backend/src/messages` controller/service gains a single new query mode (`around` parameter). No new module, no schema change.
- No changes to search authorization, direct-conversation creation, or group admin rules.

## Apply-Policy Exception

This change includes a narrowly-scoped backend extension, which is an explicit exception to the umbrella Apply Policy rule #4 ("Keep backend/API changes out of a mobile-only change"). Justification: message-context retrieval genuinely requires a backend query mode that does not exist — the messages endpoint only paginates backward by `createdAt`, and there is no "around a message" query. Building scroll-to-message without the backend endpoint is architecturally unsound (would require unbounded client-side pagination). The backend scope is minimal: one additional query parameter on an existing endpoint.
