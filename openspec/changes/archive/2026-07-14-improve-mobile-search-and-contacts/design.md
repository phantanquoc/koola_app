## Context

Message search results already identify a conversation, but navigation discards the selected message identity. The Contacts sub-tab queries all users and does not maintain a saved-contact model. Group member addition asks an admin to type a database identifier even though user search already exists.

## Goals

- Complete the search-to-context journey.
- Use truthful information architecture for people discovery.
- Reuse searchable people selection for group administration.

## Non-Goals

- Introducing device address-book synchronization or a new saved-contact model.
- Relevance ranking redesign.
- Changing who may add group members.
- Exposing private users beyond current search authorization.

## Decisions

### Target-message route contract

Message results SHALL navigate with both `conversationId` and `targetMessageId`. Chat SHALL load enough authorized context to position the target near the center and apply a temporary non-blocking highlight. If the target is unavailable, Chat opens normally and explains that the message could not be shown.

### Context retrieval boundary

Implementation includes a narrowly-scoped backend extension: `GET /conversations/:id/messages?around=<messageId>&limit=N` returning N/2 before + target + N/2 after. This is necessary because the existing messages endpoint only paginates backward by `createdAt` — there is no way to deterministically load context around an arbitrary message without unbounded client-side pagination. The endpoint reuses existing membership authorization and message query infrastructure.

**Apply-Policy exception:** This backend extension is the documented exception to umbrella rule #4. Scope is minimal (one query parameter on an existing endpoint, one new service method, DTO validation, focused tests).

### Section-owned recovery

Universal Search SHALL retain independent loading/error states. One failed source SHALL not erase successful results from other sources. Retry SHALL rerun only the failed source for the current query.

### Truthful people-search naming

Until a saved-contact capability exists, the destination SHALL use a Vietnamese label such as "Tìm người" and copy that describes global Koola user discovery.

### Searchable group member picker

The member picker SHALL reuse the existing debounced user-search source, exclude the current user and existing members, support multi-select where appropriate, and submit user IDs internally without exposing them for manual entry.

## Verification Strategy

- Route/component tests for target message ID propagation, load, scroll, highlight, and unavailable fallback.
- Per-section search tests for partial failure and retry.
- Group member picker tests for exclusion, selection, authorization error, and duplicate-submit prevention.
- Mobile smoke test with an older message not present in the initial chat page.
