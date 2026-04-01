## Tasks

### 1. Schema & DTOs

- [x] 1.1 Review `src/messages/message.schema.ts` — verify `senderId`, `type`, `content`, `status`, `mediaUrl`, `mediaMimeType`, `mediaSize`, `deleted` fields exist ← (verify: MessageDocument matches spec requirements)
- [x] 1.2 Create `src/messages/dto/send-message.dto.ts` — `type` (enum: text/image/file/voice), `content` (optional, max 10000 chars), `mediaUrl` (optional), `mediaMimeType` (optional, validated against allowlist), `mediaSize` (optional, max 104857600 bytes) ← (verify: class-validator decorators, max length 10000 on content, max 100MB on mediaSize)
- [x] 1.3 Create `src/messages/dto/list-messages.dto.ts` — `cursor` (optional, ISO date string), `limit` (optional, default 20, max 50) ← (verify: parse cursor as Date, default limit 20)

### 2. TypingService

- [x] 2.1 Create `src/messages/typing.service.ts` — `@Injectable()` with `Map<string, NodeJS.Timeout>`, `startTyping(convId, userId)` clears old timer, sets 5s timer → emit stop callback, `stopTyping(convId, userId)` clears timer ← (verify: typing timer cleared on stop; timer fires after exactly 5s)
- [x] 2.2 TypingService constructor accepts `onTypingStop: (convId: string, userId: string) => void` callback ← (verify: callback invoked after 5s timeout)

### 3. MessagesService

- [x] 3.1 Create `src/messages/messages.service.ts` — inject `Message`, `ConversationsService`, `UsersService` ← (verify: no circular dependency — ConversationsModule does NOT import MessagesModule)
- [x] 3.2 `sendMessage(convId, senderId, dto)` — verify member via ConversationsService, validate content length ≤ 10000, validate MIME allowlist, create Message doc with status=SENT, update conv `lastMessageAt` + `lastMessagePreview`, increment unreadCount via ConversationsService, return emit payload ← (verify: 403 if non-member, 400 if empty/whitespace content, 400 if >10000 chars)
- [x] 3.3 `listMessages(convId, userId, cursor?, limit?)` — verify member, query `{ conversationId, createdAt: { $lt: cursor }, deleted: false }`, sort `{ createdAt: -1 }`, limit, reverse for ascending response, return `{ messages, nextCursor }` ← (verify: cursor pagination works page 1 → page 2)
- [x] 3.4 `deleteMessage(convId, messageId, userId)` — find message, verify senderId matches, verify < 24h old, set `deleted: true`, save ← (verify: 403 if not sender, 403 if >24h, deleted content replaced in response)
- [x] 3.5 `markAsRead(messageId, userId)` — find message, verify user is member of conv, update status=DELIVERED then READ, emit `message_read` payload ← (verify: called by gateway socket handler)
- [x] 3.6 `emitNewMessage(msg, convId)` — returns typed payload `{ message, conversationId, senderId }` ← (verify: payload structure matches gateway expectations)
- [x] 3.7 `emitTyping(convId, userId)` — called by gateway on `typing_start` socket event, starts TypingService timer ← (verify: gateway calls this method)
- [x] 3.8 `emitTypingStop(convId, userId)` — clears timer, returns typed payload `{ conversationId, userId }` ← (verify: called by gateway on typing_stop, also called by TypingService 5s timeout)
- [x] 3.9 `emitMessageDeleted(messageId, convId)` — returns typed payload `{ messageId, conversationId }` ← (verify: called by gateway after successful delete)

### 4. MessagesController

- [x] 4.1 Create `src/messages/messages.controller.ts` — `@Controller('conversations/:conversationId/messages')` ← (verify: routes match spec)
- [x] 4.2 `POST /` — rate limit enforced globally by ThrottlerGuard (60/min), validate DTO, call `sendMessage`, return 201 ← (verify: 429 when >60/min)
- [x] 4.3 `GET /` — query params `cursor`, `limit`, call `listMessages` ← (verify: pagination cursor works)
- [x] 4.4 `DELETE /:messageId` — call `deleteMessage`, return 200 ← (verify: 403 for non-sender or >24h)

### 5. Module Wiring

- [x] 5.1 Create `src/messages/messages.module.ts` — import `MongooseModule` (for Message schema), `ConversationsModule`, register `MessagesService`, `TypingService` ← (verify: no circular dependency)
- [x] 5.2 Update `src/app.module.ts` — add `MessagesModule` to imports ← (verify: app starts cleanly)

### 6. Verification

- [x] 6.1 `npx tsc --noEmit` — zero TypeScript errors ← (verify: clean compile)
- [x] 6.2 Check: no circular dependency between MessagesModule and ConversationsModule ← (verify: ConversationsModule does not import MessagesModule)
