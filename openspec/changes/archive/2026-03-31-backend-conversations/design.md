## Context

NestJS backend at `src/conversations/`. The conversations module manages chat conversations (1-on-1 and group). MessagesModule does not exist yet, so conversations must create message documents directly. UsersModule exists and will be injected to verify users.

## Goals / Non-Goals

**Goals:**
- Conversations with type direct/group, members with roles, unread count tracking
- Group management (create, add/remove members, leave, update metadata)
- System messages injected on member changes
- Admin role enforcement on protected operations
- Shared Message schema for later use by MessagesModule

**Non-Goals:**
- Message CRUD (MessagesModule)
- WebSocket events (GatewayModule — will be integrated later)
- Conversation search (future)
- Typing indicators (future)

## Decisions

### D1: Two Separate Schemas (Conversation + UserConversation)

**Decision**: Use two MongoDB documents — `Conversation` for shared conversation metadata, `UserConversation` for per-user state.

**Rationale**: Unread count changes frequently (on every message), making it prone to race conditions if stored as an array inside the Conversation document. A separate `UserConversation` document avoids array mutation concurrency issues and is cleaner for future read-receipt features.

**Alternative**: Store `members: [{ unreadCount }]` inside Conversation. Rejected because MongoDB's array updates are not atomic across concurrent writes.

### D2: Role Enum on Member Subdocument

**Decision**: `members: [{ userId, role: 'admin' | 'member', joinedAt }]`

**Rationale**: Collocating role with member makes permission checks O(1) (check one field) rather than searching an `admins[]` array. Future-proof for roles ('moderator', 'owner') without schema migration.

### D3: Message Schema Created Here, Imported Elsewhere

**Decision**: Create `src/messages/message.schema.ts` as part of the conversations change. MessagesModule will import it.

**Rationale**: ConversationsModule must create system messages before MessagesModule exists. The schema is shared. Creating it here avoids the circular dependency (conversations needs messages → messages needs conversations).

**Risk**: MessagesModule might need a slightly different schema. Mitigation: keep the schema minimal (only shared fields), extensions added in MessagesModule.

### D4: Direct Conversation Lookup with `$all` + `$size`

**Decision**: Query direct conversations with:
```javascript
Conversation.findOne({
  type: 'direct',
  'members.userId': { $all: [userA, userB], $size: 2 },
})
```

**Rationale**: `$size: 2` ensures we never match a group that accidentally contains only 2 people. The `$all` ensures both users are present regardless of order.

### D5: UserService Injected for Member Verification

**Decision**: ConversationsService injects UsersService to verify a user exists before adding them to a conversation.

**Rationale**: Cannot add a non-existent user. UsersService.exists() is O(1) on indexed `_id` field.

### D6: 404 for Non-Member Access (Not 403)

**Decision**: Return HTTP 404 (Not Found) when a non-member tries to access a conversation.

**Rationale**: Returning 403 reveals that the conversation exists, allowing enumeration attacks. 404 is the correct privacy-preserving response.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race condition on unread count | Low | UserConversation is a separate document; atomic `findOneAndUpdate` used |
| Circular dependency with MessagesModule | Low | Shared schema in `src/messages/message.schema.ts`, imported by both |
| Group with 2 members treated as direct | Low | Explicit type check + `$size: 2` query guard |
| System message fails to create | Medium | Log error but don't fail the member add/remove operation |
| Admin demoted incorrectly | Low | Transaction-like check: if removing last admin and >1 members remain, reassign |

## Migration Plan

Greenfield module — no migration needed. The first deploy creates the MongoDB collections automatically via Mongoose.

If rollback needed: remove the module import from AppModule and delete the collections:
```
db.conversations.drop()
db.user_conversations.drop()
db.messages.drop()  // if created here
```
