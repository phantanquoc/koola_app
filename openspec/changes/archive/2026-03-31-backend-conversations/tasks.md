## 1. Schemas

- [x] 1.1 Create `src/messages/message.schema.ts`: schema with `_id`, `conversationId`, `senderId`, `type: 'text'|'image'|'file'|'voice'|'system'`, `content`, `status: 'sent'|'delivered'|'read'`, `mediaUrl`, `mediaMimeType`, `mediaSize`, `deleted`, `createdAt` — shared schema, created here first ← (verify: can be imported by both ConversationsModule and MessagesModule without circular dep)
- [x] 1.2 Create `src/conversations/conversation.schema.ts`: `type`, `name` (group), `avatar` (group), `members: [{ userId, role: 'admin'|'member', joinedAt }]`, `createdBy`, `lastMessageAt`, `lastMessagePreview`, with indexes ← (verify: `$all + $size` query returns correct direct conv)
- [x] 1.3 Create `src/conversations/user-conversation.schema.ts`: `userId`, `conversationId`, `unreadCount`, `lastReadMessageId`, `joinedAt`, compound unique index on `userId + conversationId` ← (verify: one doc per user per conv, no duplicates)
- [x] 1.4 Create Mongoose indexes: `conversations.members.userId` (multikey), `conversations.lastMessageAt` (desc), `conversations.type`, `user_conversations.userId`, `messages.conversationId + createdAt`

## 2. ConversationsService

- [x] 2.1 Create `src/conversations/conversations.service.ts` — `findById(id)`, `findByIdOrFail(id)` ← (verify: throws NotFoundException for invalid ObjectId)
- [x] 2.2 `createDirect(users: [userIdA, userIdB])` — creates direct conversation, creates 2 UserConversation docs ← (verify: no duplicate direct conv for same pair)
- [x] 2.3 `findDirectConversation(userA, userB)` — `$all + $size: 2` query ← (verify: returns null if no existing conv)
- [x] 2.4 `createGroup(createBy, name, memberIds)` — validate 3-100 members, creator = first admin, create all UserConversation docs ← (verify: returns 400 if <3 members, 400 if >100)
- [x] 2.5 `addMember(conversationId, memberId, adminId)` — verify admin, verify user exists, add member + UserConversation doc ← (verify: 403 if non-admin, 404 if user not found, 400 if direct conv)
- [x] 2.6 `removeMember(conversationId, targetId, adminId)` — verify admin, handle last-admin-reassign logic ← (verify: reassigns admin correctly when last admin leaves)
- [x] 2.7 `leaveGroup(conversationId, userId)` — self-remove, delete conv if direct ← (verify: deletes direct conv, removes member for group)
- [x] 2.8 `getConversationList(userId, page, limit)` — join UserConversation + Conversation, populate members, sort by lastMessageAt desc ← (verify: correct pagination, unreadCount from UserConversation)
- [x] 2.9 `getConversationDetails(conversationId, userId)` — verify member, return with last 20 messages ← (verify: 404 for non-member)
- [x] 2.10 `updateConversation(conversationId, data, userId)` — verify admin, update name/avatar ← (verify: 403 for non-admin, 400 for direct conv)
- [x] 2.11 `incrementUnreadCount(conversationId, senderId)` — increment unreadCount for all members except sender ← (verify: sender's own unreadCount not incremented)
- [x] 2.12 `resetUnreadCount(conversationId, userId)` — set unreadCount=0 ← (verify: only affects caller's UserConversation)
- [x] 2.13 `deleteConversation(conversationId)` — delete conv + all UserConversation docs for it ← (verify: cascade deletes all UserConversations)
- [x] 2.14 `createSystemMessage(conversationId, content)` — insert type='system' message ← (verify: system message appears in conversation messages)

## 3. ConversationsController

- [x] 3.1 `POST /conversations` — validate DTO, call `createGroup`, return 201 ← (verify: creates with correct admin, memberIds validated)
- [x] 3.2 `GET /conversations` — pagination query params, call `getConversationList` ← (verify: page/limit pagination works)
- [x] 3.3 `GET /conversations/:id` — call `getConversationDetails` ← (verify: non-member gets 404)
- [x] 3.4 `POST /conversations/:id/members` — validate DTO, call `addMember` ← (verify: 403 non-admin, 404 user not found)
- [x] 3.5 `DELETE /conversations/:id/members/:userId` — call `removeMember` ← (verify: 403 non-admin)
- [x] 3.6 `DELETE /conversations/:id/members/me` — call `leaveGroup` ← (verify: direct conv deleted, group member removed)
- [x] 3.7 `PUT /conversations/:id` — validate DTO, call `updateConversation` ← (verify: 403 non-admin, 400 direct conv)

## 4. Module Wiring

- [x] 4.1 Create `src/conversations/conversations.module.ts` — import `MongooseModule`, `UsersModule`, register schemas ← (verify: all schemas registered in Mongoose)
- [x] 4.2 Update `src/app.module.ts` — add `ConversationsModule` to imports ← (verify: no circular dependency, app starts)
- [x] 4.3 Add `MessagesModule` exports note in code comment: "Message schema shared — import from here when implementing MessagesModule"

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` — zero TypeScript errors ← (verify: clean compile)
- [ ] 5.2 `npm run start` — app starts, all modules initialize, all routes mapped ← (verify: POST/GET/DELETE/PUT routes visible in output)
- [ ] 5.3 Smoke test: create group → add member → list conversations → leave group ← (verify: each step returns correct response)
