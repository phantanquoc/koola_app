# Verifier Warnings — local-first-sqlite-messages

These are the 3 non-blocking warnings recorded by the verifier after the fix round (0 CRITICAL, 3 warnings). They do not block archiving but should be addressed in a follow-up change.

---

## Warning 1: wireSyncTriggers missing idempotency guard

**File:** `ChatApp/src/services/sync/syncOrchestrator.ts` — `wireSyncTriggers` function

**What is wrong:** The function that wires AppState and socket `connect` listeners does not guard against being called more than once. If the auth flow calls it on both `restoreSession` and `login` paths in the same session, duplicate listeners accumulate and each foreground/reconnect event fires multiple sync runs. The current auth flow is safe because only one path runs per session, but the latent risk remains.

**Recommended follow-up:** Add a `let wired = false` guard at module scope (or use `removeEventListener` before re-adding) so `wireSyncTriggers` is idempotent. File a separate change: `fix(sync): add idempotency guard to wireSyncTriggers`.

---

## Warning 2: Tombstone resurrection test only asserts row != null

**File:** `ChatApp/src/services/db/__tests__/messageRepository.test.ts` — tombstone resurrection scenario

**What is wrong:** The test that covers the out-of-order event case (reaction arrives before `new_message`) only asserts that the resulting row is not null. It does not assert that the `reactions` field was correctly applied, nor that the row converges to the correct final state once the `new_message` event arrives. This leaves a small logic gap: a stub row could be created with the wrong shape and the test would still pass.

**Recommended follow-up:** Extend the test to assert the full final state of the row after both events are applied (reactions array, status, content). File a separate change: `test(db): strengthen tombstone resurrection assertions in messageRepository`.

---

## Warning 3: TS error in mediaCache.spec.ts:177 — setTimeout resolver type

**File:** `ChatApp/src/services/__tests__/mediaCache.spec.ts`, line 177

**What is wrong:** The expression `setTimeout(r, 10)` passes a `NodeJS.Timeout` return value where the `Promise` executor expects `void`. TypeScript reports a type mismatch. The test passes at runtime because the value is discarded, but the TS error will surface in strict CI type-check runs.

**Recommended follow-up:** Wrap the call: `setTimeout(() => r(), 10)` or `void setTimeout(r, 10)`. File a separate change: `fix(test): resolve setTimeout resolver type error in mediaCache.spec.ts`.
