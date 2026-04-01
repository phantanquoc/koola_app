# backend-conversations — Plan Breakdown

## Module: `backend-conversations`

**Spec source:** `openspec/changes/chat-app/specs/conversation-management/spec.md`
**Existing code:** `D:\Desktop\APP_KOOLA\chat-backend\src\conversations\` (empty)

---

## Fog Points (Questions / Unresolved Issues)

### Fog 1: Unread Count — How Is It Calculated & Stored?

**Spec says:** "each conversation includes ... `unreadCount`"

**Fog:** Unread count is NOT stored directly in the conversation document. Instead, it needs to be tracked per-user. Options:

| Approach | Description |
|----------|-------------|
| **A — Subdocument per user** | `conversations` schema has `members: [{ userId, unreadCount, joinedAt }]` — unreadCount stored here, reset to 0 when user reads |
| **B — Separate collection** | `user_conversations` collection: `{ userId, conversationId, unreadCount, lastReadMessageId }` |
| **C — Computed at query time** | Count messages where `senderId != userId AND createdAt > lastReadAt` (requires `lastReadAt` per user) |

**Decision needed: B** — Approach B is most flexible for future read receipts per message. Simpler than C, more correct than A (A requires updating array inside document which can cause race conditions).

**Decision:** Use Approach B. Add a `UserConversation` schema in the same module.

---

### Fog 2: Admin Role in Groups — How Is "Admin" Determined?

**Spec says:** "admin adds member", "admin removes member", "if user is the only admin, assigns next oldest member as admin"

**Fog:** Admin is not in the current spec. Options:

| Approach | Description |
|----------|-------------|
| **A — `isAdmin` boolean on member subdocument** | `members: [{ userId, isAdmin: boolean }]` — simple, good for MVP |
| **B — Separate `admins: [userId]` array on conversation** | `admins: [userId]` at conversation level |
| **C — Role enum** | `members: [{ userId, role: 'admin' \| 'member' }]` |

**Decision needed: B** — Approach B is clearer for spec ("admin" vs "member" vs future "moderator" role). But Approach A is simpler for MVP.

**Decision:** Use Approach B initially (B/C combined): `members: [{ userId, role: 'admin' | 'member' }]` — this gives room for future roles without schema change.

---

### Fog 3: System Messages — Who Creates Them? (MessagesModule Dependency)

**Spec says:** "insert a system message when member is added or removed"

**Fog:** This requires the MessagesModule to exist (for creating message documents). But we're implementing conversations BEFORE messages.

**Resolution:** ConversationsModule will have a `MessagesService`-like method to create system messages directly (using the Message schema from `src/messages/message.schema.ts`). We will create the Message schema as part of this module (not MessagesModule) to avoid circular dependency.

**Action:** Create `src/messages/message.schema.ts` as part of conversations, then export it so MessagesModule can reuse it later.

---

## Architecture Decisions (Locked)

### Architecture 1: MongoDB Schema

```typescript
// Conversation document
{
  _id: ObjectId,
  type: 'direct' | 'group',
  name: string | null,          // group only
  avatar: string | null,        // group only
  members: [{
    userId: ObjectId,
    role: 'admin' | 'member',
    joinedAt: Date,
  }],
  createdBy: ObjectId,
  lastMessageAt: Date | null,
  lastMessagePreview: string | null,
  createdAt: Date,
  updatedAt: Date,
}

// UserConversation document (for per-user state)
{
  _id: ObjectId,
  userId: ObjectId,
  conversationId: ObjectId,
  unreadCount: number,
  lastReadMessageId: ObjectId | null,
  joinedAt: Date,
}

// Indexes:
// - conversations.members.userId (multikey)
// - conversations.lastMessageAt (descending)
// - conversations.type
// - user_conversations.userId + conversationId (compound unique)
// - user_conversations.unreadCount
```

### Architecture 2: MessagesModule Dependency Resolution

MessagesModule does NOT exist yet. To avoid circular dependency:

1. ConversationsModule creates Message documents directly using `mongoose.model('Message')` or imports from `src/messages/message.schema.ts`
2. We will create `src/messages/message.schema.ts` in the conversations folder first
3. When MessagesModule is implemented, it will import this schema

### Architecture 3: Direct Conversation Lookup

For 1-on-1 conversations: find by members array. Use `$all` + `$size` query:

```javascript
// Find direct conversation between user A and B
Conversation.findOne({
  type: 'direct',
  'members.userId': { $all: [userA_id, userB_id], $size: 2 },
})
```

### Architecture 4: Service Injection

- `ConversationsService` injects `UsersService` (to verify users exist when adding members)
- `ConversationsService` creates system messages directly (using Message schema)
- When WebSocket gateway exists, `ConversationsService` will emit events — interface is ready

---

## API Endpoints (from spec)

```
POST   /api/conversations                         Create group / start direct
GET    /api/conversations                         List user's conversations
GET    /api/conversations/:id                    Get conversation details
POST   /api/conversations/:id/members             Add member (admin only)
DELETE /api/conversations/:id/members/:userId    Remove member (admin only)
DELETE /api/conversations/:id/members/me         Leave group (self)
PUT    /api/conversations/:id                    Update group (name/avatar) (admin only)
```

---

## Files to Create

```
src/
├── conversations/
│   ├── conversations.module.ts
│   ├── conversations.service.ts
│   ├── conversations.controller.ts
│   ├── conversation.schema.ts
│   ├── user-conversation.schema.ts       ← unread count tracking
│   └── dto/
│       ├── create-conversation.dto.ts
│       ├── add-member.dto.ts
│       └── update-conversation.dto.ts
├── messages/
│   └── message.schema.ts                  ← shared, created here first
```

---

## Edge Cases (from spec, compiled)

| Case | Expected Behavior |
|------|-------------------|
| Self-message | 400: "Cannot message yourself" |
| Group < 2 members | 400: "Group must have at least 2 other members" |
| Group > 100 members | 400: "Group cannot exceed 100 members" |
| Group with no name | 400: "Group name is required" |
| Add to direct conv | 400: "Cannot add members to a direct conversation" |
| Non-admin adds | 403: Forbidden |
| Non-member reads conv | 404: Not Found (not 403 — prevent enumeration) |
| Add user who doesn't exist | 404: "User not found" |
| Last admin leaves | Assign next oldest member as admin; if only 1 member, delete conversation |
| User already in direct conv | Return existing conversation (don't create duplicate) |

---

## Status

- [ ] Specs reviewed — ✅
- [ ] Fog 1 resolved — ✅ (Approach B: UserConversation schema)
- [ ] Fog 2 resolved — ✅ (role: 'admin' | 'member' on member subdocument)
- [ ] Fog 3 resolved — ✅ (create message.schema.ts in conversations, import later)
- [ ] Zero-fog checklist — PASSED
