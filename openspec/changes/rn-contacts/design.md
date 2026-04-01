## Context

**Current state**: The app has authentication, conversation management, and real-time messaging. ContactsScreen is a placeholder stub. Users cannot discover each other or start new conversations.

**What is needed**:
1. User search — find users by name or email (Telegram-style public directory)
2. Find-or-create direct DM — `POST /conversations/direct/:userId`
3. Profile view — show user info + start chat CTA
4. Full ContactsScreen UI with search bar + results

**Constraints**:
- React Native 0.76 with existing packages (no new deps)
- NestJS backend with Mongoose
- No "friends" system — public search only (like Telegram)
- Backend must filter special characters in search queries

---

## Goals / Non-Goals

**Goals:**
- Users can search for other users by name or email
- Users can view any user's profile
- Users can start a direct message with any user from search or profile
- Search results show online/offline presence
- Avatar shown as image or initials fallback

**Non-Goals:**
- Friends / follow / request system (Phase 2)
- Block list / hide from search (Phase 2)
- Contact import from phone book (Phase 2)
- Group member add flow (covered by conversation-management)

---

## Decisions

### D1: Search-first layout (not browse-all)

ContactsScreen defaults to an empty state with a prominent search bar. Users must actively search to find people.

**Alternatives**: Show all users on load (privacy risk, performance, overwhelming UI).
**Decision**: Search-first. Empty initial state with "Search for people by name or email" prompt.

### D2: Debounce search at 300ms

The search input fires API calls on every keystroke. Debounce at 300ms to avoid excessive requests while maintaining responsiveness.

**Alternatives**: 500ms (too slow), 150ms (too many requests). 300ms is the sweet spot.

### D3: Backend search uses `$regex` with `$options: 'i'`

MongoDB regex search for email OR displayName. Case-insensitive. Query sanitized server-side (escape regex special chars).

**Alternatives**: Full-text search index (MongoDB Atlas Search) — overkill for MVP. SQL `LIKE` — not applicable to MongoDB. Exact email match — too restrictive.

### D4: Search results do NOT include self

`UsersService.searchUsers()` always filters out `currentUserId` from results. The authenticated user never appears in their own search results.

### D5: findOrCreateDirect uses existing direct conv detection

Before creating, query existing conversations where `type: 'direct'` AND both user IDs are present. If found, return it. If not, create.

**Alternatives**: Always create new (duplicates DM threads). Rely on client to check (race condition). Decision: server-side dedup is correct.

### D6: UserAvatar uses deterministic background color

When no avatar URL is present, generate initials from `displayName[0].toUpperCase()`. Background color is deterministic based on `displayName` — cycle through a fixed palette of 8 colors based on `displayName.charCodeAt(0) % 8`.

### D7: RN navigates to Chat after finding/creating conversation

The RN client calls `POST /conversations/direct/:userId`, receives the conversation, and navigates to `ChatScreen` with that `conversationId`. No separate "DM created" screen.

---

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Users can look up anyone in the system | High (by design) | Medium (privacy) | Acceptable for MVP/Telegram-style; block list in Phase 2 |
| Regex search slow on large user tables | Medium | Medium | Add MongoDB index on email + displayName |
| Race condition: two users start DM simultaneously | Low | Low | `findOne` + `create` with unique constraint prevents duplicates |

---

## Migration Plan

This is an entirely new feature — no migration needed.

**Deploy sequence**:
1. Deploy backend endpoints first (`GET /users/search`, `POST /conversations/direct/:userId`)
2. Deploy RN ContactsScreen + ProfileScreen

**Rollback**: Disable the Contacts tab or revert RN build. No data migration.

---

## Open Questions

All fog points resolved (see `docs/rn-contacts-breakdown.md`):
- Search by email OR name → confirmed
- findOrCreateDirect endpoint → confirmed
- Public search (no friends) → confirmed
- Search-first layout → confirmed
