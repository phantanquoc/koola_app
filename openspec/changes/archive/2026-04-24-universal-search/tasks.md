## 1. Backend — Data Model

- [x] 1.1 Add MongoDB text index to `message.schema.ts`: `MessageSchema.index({ content: 'text' }, { default_language: 'none' });`
- [x] 1.2 Verify no duplicate index warnings by confirming `content` field does NOT already have `index: true` on its `@Prop` decorator ← (verify: server starts without Mongoose duplicate index warnings; `db.messages.getIndexes()` shows one text index on `content`)

## 2. Backend — DTO and Validation

- [x] 2.1 Create `chat-backend/src/messages/dto/search-messages.dto.ts` with `q` (string, MinLength 2, MaxLength 100), `limit` (optional int 1–50, default 20), `cursor` (optional string)
- [x] 2.2 Decorate all fields with `class-validator` decorators and `@ApiPropertyOptional` for Swagger ← (verify: sending `?q=h` returns 400; sending `?q=` returns 400; sending no `q` returns 400)

## 3. Backend — Service Method

- [x] 3.1 Add `searchMessages(userId: string, q: string, limit: number, cursor?: string)` method to `MessagesService`
- [x] 3.2 Inside the method, fetch the user's conversation IDs using `userConversationModel.find({ userId })` (inject `UserConversation` model via `ConversationsModule` export or add it directly — check existing `forwardRef` wiring in `MessagesModule`)
- [x] 3.3 Run `this.messageModel.find({ $text: { $search: q }, conversationId: { $in: convIds }, deleted: false, content: { $ne: '' } })` with cursor-based pagination (filter `_id > cursor` when cursor is provided)
- [x] 3.4 Enrich each result with `conversationName` (from conversation document) and `senderDisplayName` (from users service); batch-resolve to avoid N+1
- [x] 3.5 Return `{ items: MessageSearchItem[], nextCursor: string | null, total: number }` ← (verify: authenticated user calling the service only receives messages from their own conversations; messages with `deleted: true` are absent)

## 4. Backend — Controller

- [x] 4.1 Create `chat-backend/src/messages/messages-search.controller.ts` with class `MessagesSearchController`, decorated `@Controller('messages')` and `@ApiTags('messages')`, `@ApiBearerAuth()`
- [x] 4.2 Add `@Get('search')` handler that accepts `@Query() query: SearchMessagesDto` and `@CurrentUser() user`, delegates to `messagesService.searchMessages()`
- [x] 4.3 Register `MessagesSearchController` in the `controllers` array of `MessagesModule` ← (verify: `GET /messages/search?q=hello` returns 200 with correct shape; `GET /messages/search?q=hello` without JWT returns 401)

## 5. Backend — Module Wiring

- [x] 5.1 Confirm `ConversationsModule` exports `UserConversation` model or `ConversationsService`; if not, add the export so `MessagesService` can access user conversation IDs without a circular dependency
- [x] 5.2 Verify `forwardRef(() => ConversationsModule)` in `MessagesModule` is sufficient; if the `UserConversation` model is needed directly, add `MongooseModule.forFeature([{ name: UserConversation.name, schema: UserConversationSchema }])` to `MessagesModule` imports ← (verify: NestJS boots without circular dependency errors)

## 6. Mobile — API Client

- [x] 6.1 Add `messagesApi.searchMessages(q: string, cursor?: string, limit?: number)` method to `apiService.ts` calling `GET /messages/search` with params; return type `MessageSearchResponse`
- [x] 6.2 Add `MessageSearchItem` and `MessageSearchResponse` types to `ChatApp/src/types/index.ts` with fields: `messageId`, `conversationId`, `conversationName`, `senderId`, `senderDisplayName`, `content`, `createdAt` ← (verify: TypeScript compiles; existing `apiService.ts` imports unchanged)

## 7. Mobile — Navigation

- [x] 7.1 Add `UniversalSearch: undefined` to `ChatTabStackParamList` in `ChatApp/src/navigation/types.ts`
- [x] 7.2 Import and register `UniversalSearchScreen` as `<Stack.Screen name="UniversalSearch" component={UniversalSearchScreen} />` in `ChatApp/src/navigation/ChatTabStack.tsx` with `headerShown: false`
- [x] 7.3 In `ChatHomeScreen.tsx`, add `handleSearchPress` callback: `navigation.navigate('UniversalSearch')` and pass it as `onSearchPress` to `<KoolaHeader>` ← (verify: tapping the search bar in the app navigates to an empty screen at route `UniversalSearch`)

## 8. Mobile — KoolaHeader Update

- [x] 8.1 Change default `searchPlaceholder` prop value in `KoolaHeader.tsx` from `'Hỏi AI hoặc tìm kiếm'` to `'Tìm kiếm'` ← (verify: header renders "Tìm kiếm" placeholder text; existing prop override still works)

## 9. Mobile — useUniversalSearch Hook

- [x] 9.1 Create `ChatApp/src/hooks/useUniversalSearch.ts` that accepts `query: string` and returns `{ conversations, contacts, messages, loadingContacts, loadingMessages, error }`
- [x] 9.2 Implement 300 ms debounce on `query` using `useEffect` + `setTimeout` / `clearTimeout`
- [x] 9.3 Implement conversation filter: when debounced query length >= 2, filter props `conversations` array by matching `conversation.name` or any `member.displayName` (case-insensitive, `includes`)
- [x] 9.4 Implement contact search: call `usersApi.searchUsers(debouncedQuery)` when length >= 2; set `loadingContacts` during the call
- [x] 9.5 Implement message search: call `messagesApi.searchMessages(debouncedQuery)` when length >= 2; set `loadingMessages` during the call
- [x] 9.6 Reset all results and clear in-flight requests when query drops below 2 characters ← (verify: typing fast only triggers one API call per debounce window; clearing input resets all three result arrays)

## 10. Mobile — UniversalSearchScreen

- [x] 10.1 Create `ChatApp/src/screens/main/UniversalSearchScreen.tsx`; import `useUniversalSearch`, navigation, and result item components
- [x] 10.2 Render a header row with a back-arrow `TouchableOpacity` and an auto-focused `TextInput` (placeholder "Tìm kiếm", `autoFocus={true}`, `returnKeyType="search"`) and an X clear button shown when input is non-empty
- [x] 10.3 Render empty state view "Nhập từ khóa để tìm kiếm" when query is fewer than 2 characters
- [x] 10.4 Render "Cuộc trò chuyện" section: label + list of up to 3 `ConversationResultItem` rows + "Xem thêm" button if more exist; tapping an item calls `navigation.navigate('Chat', { conversationId })`
- [x] 10.5 Render "Liên hệ" section: label + `ActivityIndicator` while `loadingContacts` + up to 3 `ContactResultItem` rows + "Xem thêm" + "Không tìm thấy kết quả" when empty and query >= 2
- [x] 10.6 Render "Tin nhắn" section: label + `ActivityIndicator` while `loadingMessages` + up to 3 `MessageResultItem` rows + "Xem thêm" + "Không tìm thấy kết quả" when empty and query >= 2
- [x] 10.7 Implement "Xem thêm" expand state per section using local `useState` booleans; expanded sections show up to 20 results
- [x] 10.8 Wrap all sections in a `ScrollView`; dismiss keyboard on scroll (`keyboardShouldPersistTaps="handled"`) ← (verify: screen renders correctly for each of the three states — empty query, loading, results; tapping a conversation result opens ChatScreen)

## 11. Mobile — Result Item Components

- [x] 11.1 Create `ChatApp/src/components/search/ConversationResultItem.tsx`: renders `UserAvatar` (or group icon), conversation name, tap navigates to Chat
- [x] 11.2 Create `ChatApp/src/components/search/ContactResultItem.tsx`: renders `UserAvatar`, `displayName`, `phone`; tap navigates to Profile
- [x] 11.3 Create `ChatApp/src/components/search/MessageResultItem.tsx`: renders sender name (bold), content snippet truncated to 80 chars, conversation name, relative timestamp (use existing date util if available); tap navigates to Chat ← (verify: all three item components render without TypeScript errors; snapshots or manual visual check)

## 12. Integration and Final Wiring

- [x] 12.1 Pass the in-memory `conversations` list from a shared source (context or prop) into `useUniversalSearch`; confirm `ConversationListScreen`'s existing hook is the source of truth — do NOT duplicate the fetch
- [x] 12.2 Confirm tapping a `ContactResultItem` navigates to `Profile` screen (already in `ChatTabStackParamList`) with correct `userId`
- [x] 12.3 Confirm tapping a `MessageResultItem` navigates to `Chat` screen with `conversationId` ← (verify: end-to-end: open search → type query with 2+ chars → all three sections populate → tapping each result type lands on the correct destination screen)

## 13. TypeScript and Lint

- [x] 13.1 Run `npx tsc --noEmit` inside `ChatApp/` and fix all type errors introduced by new files
- [x] 13.2 Run `npx tsc --noEmit` inside `chat-backend/` and fix all type errors
- [x] 13.3 Run the project linter (ESLint) on both sides and resolve warnings in new files ← (verify: both `tsc` commands exit 0; no new lint errors in CI)
