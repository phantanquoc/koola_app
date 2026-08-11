## 1. Phase D1: Fix reactions comparator

- [x] 1.1 Update `ChatApp/src/screens/chat/components/messageItemEquality.ts` reactions comparison from identity check to value comparison (length + per-index userId + emoji)
- [x] 1.2 Add test case to `messageItemEquality.spec.ts`: identical reactions arrays yield memo hit
- [x] 1.3 Add test case to `messageItemEquality.spec.ts`: empty reactions arrays yield memo hit
- [x] 1.4 Add test case to `messageItemEquality.spec.ts`: different reaction length yields memo miss
- [x] 1.5 Add test case to `messageItemEquality.spec.ts`: swapped reactions yield memo miss
- [x] 1.6 Add test case to `messageItemEquality.spec.ts`: added reaction yields memo miss
- [x] 1.7 Add test case to `messageItemEquality.spec.ts`: removed reaction yields memo miss
- [x] 1.8 Run `cd ChatApp && npm run type-check` to verify type ledger intact (ComparedPropKey / UncomparedPropKey / MustBeNever guards pass) ← (verify: tsc passes with no errors, type guards still enforce comparator completeness)

## 2. Phase D2: Create memo boundary

- [x] 2.1 Create `ChatApp/src/screens/chat/components/MemoizedMessageList.tsx` with strongly typed props interface (messages, user, handlers, listViewProps)
- [x] 2.2 Implement MemoizedMessageList as React.memo wrapper around GiftedChat with pass-through props
- [x] 2.3 Update `ChatApp/src/screens/chat/ChatScreen.tsx`: stabilize listViewProps via useMemo with frozen deps
- [x] 2.4 Update `ChatApp/src/screens/chat/ChatScreen.tsx`: replace direct GiftedChat render with MemoizedMessageList
- [x] 2.5 Verify all handler props passed to MemoizedMessageList are already useCallback (onSend, onLongPress, renderMessage)
- [x] 2.6 Run `cd ChatApp && npm run type-check` to verify MemoizedMessageList props have no any escapes

## 3. Test memo boundary behavior

- [x] 3.1 Create test file `ChatApp/src/screens/chat/components/MemoizedMessageList.spec.tsx`
- [x] 3.2 Add test case: typing indicator change does not re-render message list (mock parent state change, assert GiftedChat not re-rendered)
- [x] 3.3 Add test case: context menu state change does not re-render message list
- [x] 3.4 Add test case: new message invalidation triggers re-render (messages prop change)
- [x] 3.5 Add test case: listViewProps reference stable across parent re-renders
- [x] 3.6 Run `cd ChatApp && npm test -- MemoizedMessageList.spec.tsx` to verify all memo boundary tests pass ← (verify: all 4 test cases pass, memo boundary correctly isolates from parent state)

## 4. Verify gesture handlers preserved

- [x] 4.1 Run full ChatApp test suite: `cd ChatApp && npm test`
- [x] 4.2 Run lint: `cd ChatApp && npm run lint`
- [ ] 4.3 Manual smoke test on device: verify long-press opens context menu (requires physical device or emulator)
- [ ] 4.4 Manual smoke test on device: verify message tap works (image preview, link navigation)
- [ ] 4.5 Manual smoke test on device: verify avatar tap navigates to profile ← (verify: all gesture handlers functional, no regressions from memo boundary)

## 5. Integration verification

- [x] 5.1 Run combined test suite: `cd ChatApp && npm test` (all existing tests + new comparator + memo boundary tests)
- [x] 5.2 Verify tsc passes: `cd ChatApp && npm run tsc`
- [x] 5.3 Verify lint passes: `cd ChatApp && npm run lint`
- [ ] 5.4 Manual scroll test on device: scroll message list while typing indicator active, verify no stutter
- [ ] 5.5 Manual scroll test on device: scroll during incoming reactions/socket events, verify smooth scrolling ← (verify: combined Phase B+C+D optimizations work together, no performance regressions, all specs satisfied)

## 6. Documentation

- [x] 6.1 Add inline comment in `messageItemEquality.ts` reactions comparison block explaining why value comparison is needed (JSON.parse creates new arrays)
- [x] 6.2 Add inline comment in `messageItemEquality.ts` warning that comparator only checks userId + emoji, not other potential reaction fields
- [x] 6.3 Add JSDoc comment to `MemoizedMessageList.tsx` explaining purpose (isolates GiftedChat from parent state changes)
- [x] 6.4 Update `CLAUDE.md` or `AGENTS.md` if needed to document Phase D completion and measurement gate (Phase D gated on Phase B+C device measurement)
