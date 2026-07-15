## 1. Search Context Audit

- [x] 1.1 Trace message search response identity, Chat route params, local cache, pagination, and scroll APIs
- [x] 1.2 Run GitNexus upstream impact analysis for message-result navigation, Chat context loading, user search, and group member handlers before editing
- [x] 1.3 Confirm that existing APIs cannot load an arbitrary target message (verified: `chat-backend/src/messages` only paginates backward by `createdAt`, no "around" query exists)

## 2. Backend: Message Context Endpoint

- [x] 2.1 Add `around` query parameter to `GET /conversations/:id/messages` in the messages controller — returns N/2 before + target + N/2 after, ordered by `createdAt` ascending
- [x] 2.2 Add DTO validation for the `around` parameter (valid ObjectId; cursor is ignored when around is present)
- [x] 2.3 Add service method that finds the target message, verifies membership, and queries bounded context in both directions
- [x] 2.4 Return `hasBefore`/`hasAfter` booleans in the response for client-side infinite-scroll awareness
- [x] 2.5 Add focused backend tests: happy path, near-beginning, target-not-found (404), unauthorized (403), and cursor param ignored when `around` is present

## 3. Exact Message Navigation

- [x] 3.1 Add `targetMessageId` to the `Chat` route type definition in `types.ts` (defect: `UniversalSearchScreen.tsx:106-110` passes only conversationId, ignores msg._id)
- [x] 3.2 Pass `targetMessageId` from MessageResultItem navigation to ChatScreen
- [x] 3.3 Use the new `around` endpoint to load bounded authorized context, scroll to the target, and apply a temporary highlight
- [x] 3.4 Add deleted/unavailable target fallback without blocking normal conversation access
- [x] 3.5 Add focused route, context-loading, scroll, and fallback tests

## 4. Search State and Naming

- [x] 4.1 Refactor `useUniversalSearch.ts` to preserve independent loading/error/empty/result state per section (fix: contacts effect `setError(null)` currently clears message errors due to shared state)
- [x] 4.2 Add per-section retry that does not discard successful sections
- [x] 4.3 Rename the global people-search destination and default copy to truthful Vietnamese language
- [x] 4.4 Replace English error string in `useContactsSearch.ts:34` with Vietnamese equivalent

## 5. Group Member Selection

- [x] 5.1 Replace raw user-ID input with the existing debounced people-search source (reuse `GroupCreateModal` search pattern)
- [x] 5.2 Exclude self and current members; render identity, selection, loading, empty, and error states
- [x] 5.3 Prevent duplicate submit and preserve selection on recoverable API failure
- [x] 5.4 Add focused tests for exclusion, selection, authorization failure, and successful add

## 6. Verification

- [x] 6.1 Run focused mobile tests and scoped backend tests for message context endpoint
- [x] 6.2 Run `cd ChatApp && npm run tsc`
- [x] 6.3 Run `cd ChatApp && npm run lint`
- [x] 6.4 Run `cd chat-backend && npm run test`
- [x] 6.5 Smoke test an old search result, partial network failure, and adding a group member
- [x] 6.6 Run `openspec validate improve-mobile-search-and-contacts --type change --strict --no-interactive`
- [x] 6.7 Run GitNexus change detection before any requested commit and confirm authorization boundaries remain unchanged
