# rn-contacts — Breakdown

**Date:** 2026-04-01
**Module:** rn-contacts (Module 19)
**Status:** Planning complete

---

## 1. Fog Points & Resolution

### FP-1: User search — by what?
**Fog:** Spec không nói rõ user được tìm bằng cách nào.

→ **Resolution A (✅ chọn):** Search bằng **email hoặc displayName** — `GET /users/search?q=`
→ **Resolution B:** Chỉ search bằng email chính xác
→ **Resolution C:** Friends list (friend request flow)

**Decision: A** — Giống Telegram. Ai cũng tìm được ai. Privacy tradeoff acceptable cho MVP.

### FP-2: Start direct DM — API endpoint?
**Fog:** Tap user trong Contacts → navigate đến Chat. Cần find-or-create direct conversation trước.

→ **Resolution A (✅ chọn):** `POST /conversations/direct/:userId` — find hoặc create direct conversation
→ **Resolution B:** Reuse `POST /conversations` với `{ type: "direct" }`
→ **Resolution C:** Navigate → send first message → server auto-creates (spec behavior)
→ **Resolution D:** Không endpoint, rely on existing conversation logic

**Decision: A** — Clean, 1 call, explicit find-or-create semantics.

### FP-3: Friends vs Public search?
**Fog:** User có thể search thấy ai?

→ **Resolution A (✅ chọn):** Public search — giống Telegram
→ **Resolution B:** Friend requests trước khi chat
→ **Resolution C:** Hybrid

**Decision: A** — Không thêm complexity của friend request flow. Đơn giản, giống Telegram.

### FP-4: Contacts list vs Search-first?
**Fog:** Trang Contacts hiển thị gì trước?

→ **Resolution A (✅ chọn):** Search-first — ô search ở top, list trống ban đầu. User search để tìm người.
→ **Resolution B:** List tất cả users có trong hệ thống (privacy issue)

**Decision: A** — Privacy tốt hơn, UX clean hơn. Không flood list với tất cả users.

---

## 2. Architecture Decisions (Locked)

```
┌──────────────────────────────────────────────────────────────┐
│                APP LAYERS (RN Client)                       │
├──────────────────────────────────────────────────────────────┤
│  ContactsScreen                                             │
│    ├── SearchBar (TextInput) → debounced search              │
│    ├── SearchResults list (FlatList)                         │
│    └── ContactItem → tap → navigate to Chat                  │
├──────────────────────────────────────────────────────────────┤
│  Hooks Layer                                               │
│    ├── useContactsSearch() — debounced search API call       │
│    └── useStartDirectChat() — find-or-create DM + navigate  │
├──────────────────────────────────────────────────────────────┤
│  API Layer                                                  │
│    ├── GET /users/search?q=  (NEW — backend)                │
│    └── POST /conversations/direct/:userId  (NEW — backend)  │
├──────────────────────────────────────────────────────────────┤
│  ProfileScreen                                              │
│    └── Show user info + "Start Chat" button                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                BACKEND                                      │
├──────────────────────────────────────────────────────────────┤
│  UsersController                                            │
│    └── GET /users/search?q=  (NEW)                          │
│        → search by email OR displayName (case-insensitive)   │
│        → exclude self                                       │
│        → paginated (limit=20)                               │
│                                                              │
│  ConversationsController                                    │
│    └── POST /conversations/direct/:userId  (NEW)           │
│        → find existing direct conversation with userId      │
│        → if not found: create new direct conversation        │
│        → return conversation object                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Schema Definitions

### RN: SearchResult (from API)
```typescript
interface UserSearchResult {
  _id: string;
  email: string;
  displayName: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen: string;
}
```

### Backend: search query params
```typescript
// GET /users/search?q=<query>&limit=20&cursor=<id>
// q: min 2 chars, searches email OR displayName (case-insensitive)
// Excludes current user
// Returns: { items: User[], hasMore: boolean, nextCursor: string | null }
```

---

## 4. Edge Cases Table

| Case | Behavior |
|------|----------|
| Search < 2 chars | Không gọi API, trả empty results |
| Search query empty | Hiển thị empty state "Search for people by name or email" |
| User not found | Hiển thị empty state "No users found for '<query>'" |
| User is self | Server excludes self; client không hiển thị self trong results |
| Start DM với user đã có DM | API find-or-create → trả conversation hiện có, navigate bình thường |
| Network error on search | Show inline error "Search failed. Tap to retry." |
| Profile loading | Show skeleton/loading state |
| Avatar missing | Hiển thị initials avatar (first letter of displayName) |
| Online status | Show green dot if `isOnline === true`, otherwise gray dot |

---

## 5. Files to Create / Modify

### Backend — New Files
| File | Purpose |
|------|---------|
| `chat-backend/src/users/dto/search-users.dto.ts` | DTO for search query params |
| `chat-backend/src/users/users-search.controller.ts` | Separate controller for `/users/search` |

### Backend — Modify
| File | Changes |
|------|---------|
| `chat-backend/src/users/users.service.ts` | Add `searchUsers(query, currentUserId, cursor?, limit?)` |
| `chat-backend/src/users/users.controller.ts` | Add `GET /users/search` |
| `chat-backend/src/users/users.module.ts` | Register search controller |
| `chat-backend/src/conversations/conversations.controller.ts` | Add `POST /conversations/direct/:userId` |
| `chat-backend/src/conversations/conversations.service.ts` | Add `findOrCreateDirect(userId, currentUserId)` |

### React Native — New Files
| File | Purpose |
|------|---------|
| `ChatApp/src/hooks/useContactsSearch.ts` | Debounced search hook |
| `ChatApp/src/components/ContactItem.tsx` | User row with avatar, name, online status |
| `ChatApp/src/components/UserAvatar.tsx` | Avatar component (image or initials) |
| `ChatApp/src/components/ContactSearchBar.tsx` | Search input component |

### React Native — Modify
| File | Changes |
|------|---------|
| `ChatApp/src/screens/main/ContactsScreen.tsx` | Full implementation: search bar + results list |
| `ChatApp/src/screens/main/ProfileScreen.tsx` | Show user info + "Start Chat" button |
| `ChatApp/src/services/api/apiService.ts` | Add `searchUsers()`, `startDirectChat()` |
| `ChatApp/src/navigation/types.ts` | Add profile param types |

---

## 6. Zero-Fog Checklist

- [x] Every requirement is specific enough (search by 2+ chars, debounce 300ms, online dot, initials avatar)
- [x] All edge cases explicitly named (see Edge Cases Table above)
- [x] Error paths defined (search error → inline retry, network error → show error)
- [x] Component states listed (ContactsScreen: idle/searching/results/error/empty; ContactItem: default/loading)
- [x] Accessibility: basic (contrast + focus states)
- [x] Test strategy: unit tests for search deduplication, integration test for find-or-create DM
- [x] Architecture decisions explicit (search-first layout, debounced search, public search)
- [x] No unresolved fog — all 4 fogs resolved
- [x] Backend: 2 new endpoints confirmed missing → included in scope
