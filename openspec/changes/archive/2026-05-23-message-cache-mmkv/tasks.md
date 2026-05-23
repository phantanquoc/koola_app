## 1. Service Implementation

- [x] 1.1 Create `ChatApp/src/services/messageCacheService.ts`
- [x] 1.2 Instantiate `new MMKV({ id: 'message-cache' })` at module scope
- [x] 1.3 Define constants: `MAX_MESSAGES_PER_CONV = 50`, `KEY_PREFIX = 'conv:'`
- [x] 1.4 Export `read(conversationId): IMessage[]` — synchronous mmap read, returns `[]` on miss/parse-error/non-array
- [x] 1.5 Re-hydrate each entry's `createdAt` to a `Date` after `JSON.parse` since JSON only stores strings
- [x] 1.6 Export `write(conversationId, messages)` — filter optimistic (`_id` startsWith `temp_` or `pending: true`), slice head to `MAX_MESSAGES_PER_CONV`, persist via `mmkv.set`; if filtered slice is empty, call `mmkv.delete` instead to keep the store tidy
- [x] 1.7 Export `clear(conversationId)` — `mmkv.delete` for a single entry
- [x] 1.8 Export `clearAll()` — `mmkv.clearAll()` for the whole instance

## 2. useMessages Integration

- [x] 2.1 Import `* as messageCache from '../../../services/messageCacheService'` in `useMessages.ts`
- [x] 2.2 Switch `useState<IMessage[]>([])` to `useState<IMessage[]>(() => messageCache.read(conversationId))` so the synchronous cache read happens inside the lazy initializer
- [x] 2.3 Switch `useState(true)` for `isInitialLoading` to a lazy initializer that returns `messageCache.read(conversationId).length === 0` — a cache hit skips the loading state entirely
- [x] 2.4 Remove the `setMessages([])` call inside the initial-fetch `useEffect`. The cached content must remain on screen while the network fetch runs in parallel, otherwise the white flash returns
- [x] 2.5 Add a debounced (500 ms) `useEffect([conversationId, messages])` that calls `messageCache.write(conversationId, messages)`

## 3. Logout Integration

- [x] 3.1 Import `* as messageCache from '../services/messageCacheService'` in `AuthContext.tsx`
- [x] 3.2 Call `messageCache.clearAll()` inside `logout()`'s `finally` block, after `await asyncStorage.clearAll()`

## 4. Type, Lint, and Build Checks

- [x] 4.1 Run `cd ChatApp && npx tsc --noEmit` — must complete with zero new errors compared to baseline
  - RESULT: Two pre-existing errors (`VideoMessage.tsx:100` in dead-code branch, `ShoppingHomeScreen.tsx:344` unrelated). No new errors introduced by this change.
- [x] 4.2 Run `cd ChatApp/android && ./gradlew installDebug` — must produce a successful APK install on the connected emulator/device
  - RESULT: BUILD SUCCESSFUL in 44s; installed on Pixel_8 (AVD) - 15.

## 5. Manual Verification

- [x] 5.1 Cold-start the app and open a conversation that has messages. Confirm the message list renders within ~100 ms (down from the ~500 ms blank).
  - CONFIRMED: User-reported ~100 ms first paint on conversation re-entry.
- [x] 5.2 Kill the app and reopen the same conversation. Confirm messages still appear on the first frame (cache survives process restart).
- [x] 5.3 Log out and back in. Confirm a second account does not see the first account's chat history (`clearAll()` wired correctly in logout).

## 6. Post-implementation Verification (this archive)

- [x] 6.1 GitNexus impact analysis on `useMessages` — risk LOW, 1 direct caller (`ChatScreen.tsx`), 0 affected processes.
- [x] 6.2 GitNexus impact analysis on `mediaIndexService.load` — risk LOW (covered by `media-cache-persistence` archive but re-checked because this change touches the same boot path).
- [x] 6.3 GitNexus impact analysis on `AuthContext.logout` — risk LOW, no upstream callers in the indexed graph.
- [x] 6.4 GitNexus detect-changes on the three commits (`9e18521`, `14759eb`, `226b4a2`) — confirmed no symbols were touched outside the expected 5 files.
