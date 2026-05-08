## 1. Service scaffolding

- [x] 1.1 Create `chat-backend/src/webrtc/services/call-notifications.service.ts` with `@Injectable()` class `CallNotificationsService`, private `logger`, and constructor that injects `UsersService` (for fetching `fcmTokens`). Mirror the logger/constructor style of `notifications/notifications.service.ts`.
- [x] 1.2 In the new service, import `getMessaging` from the existing `notifications/fcm-client` module (re-export or relative import — keep the import clean).
- [x] 1.3 Export a TypeScript interface `SendIncomingCallPushParams` with fields: `recipientId`, `sessionId`, `callerId`, `callerName`, `callerAvatar?`, `callType` (`'audio' | 'video'`), `conversationId`, `expiresAt` (number, epoch ms).

## 2. Push payload builder and delivery

- [x] 2.1 Implement `private buildIncomingCallMessage(params, token)` that returns a `firebase-admin` `Message` object with only a `data` field — NO `notification` field. Data keys: `type='incoming_call'`, `sessionId`, `callerId`, `callerName`, `callerAvatar` (empty string fallback), `callType`, `conversationId`, `expiresAt` (stringified epoch ms). FCM `data` values MUST all be strings.
- [x] 2.2 Set Android config: `priority: 'high'`, `ttl: 20 * 1000` (ms; SDK expects `Duration` or numeric milliseconds — verify from firebase-admin types), and optionally `restrictedPackageName` from env if set.
- [x] 2.3 Set APNs config: headers `{ 'apns-priority': '10', 'apns-push-type': 'background' }` and payload `{ aps: { 'content-available': 1 } }`.
- [x] 2.4 Implement `async sendIncomingCallPush(params: SendIncomingCallPushParams): Promise<{ success: number; failure: number; totalTokens: number }>`:
  - Load recipient user via `this.usersService.findById(params.recipientId)`.
  - If user missing or `fcmTokens[]` is empty → return `{ success: 0, failure: 0, totalTokens: 0 }` (caller decides what to do with zero-tokens).
  - Build one message per token (or use `sendEachForMulticast` with `tokens` array — whichever matches the firebase-admin version installed; check the existing `notifications.service.ts` for the idiomatic call).
  - Await `getMessaging().sendEach(messages)` (or multicast equivalent), wrap in try/catch, log success/failure counts with `sessionId`.
  - Return the counts.
- [x] 2.5 Ensure the service never throws — all FCM errors are logged and wrapped into the returned counts. ← (verify: no unhandled promise rejections; gateway's try/catch is a second line of defense, not the primary)

## 3. Session schema extension

- [x] 3.1 In `chat-backend/src/webrtc/services/call-session.service.ts`, extend the `CallSession` type with optional `pushSentAt?: Date` (or ISO string — match how other dates are stored in the Redis hash).
- [x] 3.2 Add a helper `async markPushSent(sessionId: string): Promise<void>` that sets `pushSentAt` on the hash using the existing hset pattern used for other session fields.
- [x] 3.3 Ensure the field is hydrated when reading the session back via `getSession` — update the parsing logic if it uses explicit field mapping (not generic `Object.assign`).

## 4. Gateway integration

- [x] 4.1 In `chat-backend/src/webrtc/webrtc.module.ts`, register `CallNotificationsService` as a provider and ensure `UsersModule` is imported so `UsersService` can be injected. Verify `NotificationsModule` (where FCM client lives) is either imported or the fcm-client is available via a shared module — follow the project's existing pattern.
- [x] 4.2 In `chat-backend/src/webrtc/webrtc.gateway.ts`, inject `CallNotificationsService` via the constructor.
- [x] 4.3 Modify `handleCallInitiate`: after creating the Redis session and computing `targetSockets = await this.io.in('user:' + targetUserId).fetchSockets()`, branch on `targetSockets.length`:
  - `length > 0` → existing online flow (no change).
  - `length === 0` → new offline-push branch:
    - Fetch callee via `usersService.findById(targetUserId)`; if `fcmTokens[]` is empty → keep existing immediate-missed behavior (emit `call_missed` with reason `User unreachable`, end session, update log).
    - Otherwise:
      - Emit `call_initiated` to caller with sessionId + ICE servers (same payload shape as online case).
      - Call `callNotificationsService.sendIncomingCallPush({ ... })` in try/catch; log any thrown error but continue.
      - Call `callSessionService.markPushSent(sessionId)` to set `pushSentAt` in Redis.
      - Set a 25-second `setTimeout` in `this.callTimeouts` Map keyed by `sessionId`. On fire: check session still in state `initiated`; if yes → end session, update log as `missed`, emit `call_missed` to caller with reason `No answer`, then remove the map entry.
- [x] 4.4 Confirm all existing terminal handlers (`handleCallAccept`, `handleCallDecline`, `handleCallCancel`, `handleCallEnd`, `handleCallFailed`, `handleDisconnect`) already call `clearCallTimeout(sessionId)` — they do (verified in Batch 1). Do NOT re-add; just confirm in comments/tests. ← (re-verified after regression restore: 7 call sites confirmed — handleCallAccept, handleCallDecline, handleCallCancel, handleCallEnd, handleCallFailed, handleDisconnect, plus the private method definition itself)
- [x] 4.5 Ensure the existing 30-second online-timeout path is NOT triggered for offline-push sessions — online path requires a socket to emit `incoming_call` to, which doesn't happen for offline-push. Confirm the code paths don't accidentally set both timers. ← (verify: only ONE setTimeout is registered per sessionId)

## 5. Cron safety-net verification

- [x] 5.1 Read `chat-backend/src/webrtc/services/call-session-cron.service.ts` and `call-session.service.ts:cleanupStaleSessions`. Confirm that a session in state `initiated` with `pushSentAt` populated is still correctly reaped (no new filter needed).
- [x] 5.2 If the cron filter currently excludes sessions with `pushSentAt`, update the filter OR explicitly include offline-push sessions.
- [x] 5.3 Confirm behavior: after server restart mid-grace-period, the cron cleans up the stranded session within ~15s (cron tick) + stale threshold (60s). ← (verify: no code change needed unless filter logic excludes these; document finding in PR description)

## 6. Unit tests

- [x] 6.1 Create `chat-backend/src/webrtc/services/call-notifications.service.spec.ts` (follow existing `*.service.spec.ts` patterns in the repo if any; otherwise use NestJS TestingModule with mocked `UsersService` and mocked `getMessaging`).
- [x] 6.2 Test case: `sendIncomingCallPush` with valid user + 2 tokens → builds messages with correct `data` fields, calls `sendEach`/multicast once with both tokens, returns `{ success: 2, failure: 0, totalTokens: 2 }`.
- [x] 6.3 Test case: `sendIncomingCallPush` with user having zero tokens → returns `{ success: 0, failure: 0, totalTokens: 0 }` and does NOT call messaging SDK.
- [x] 6.4 Test case: `sendIncomingCallPush` when messaging throws → logs error, returns `{ success: 0, failure: N, totalTokens: N }`, does NOT propagate exception.
- [x] 6.5 Test case: payload shape — `type='incoming_call'`, `expiresAt` is stringified number, Android `priority='high'`, APNs `content-available=1`. ← (verify: payload matches spec scenario exactly)

## 7. Integration tests

- [x] 7.1 Create `chat-backend/src/webrtc/webrtc.gateway.offline-push.spec.ts` (or extend existing gateway spec if present).
- [x] 7.2 Mock socket.io `fetchSockets` to return empty array for the target user. Mock `CallNotificationsService.sendIncomingCallPush` to return `{ success: 1, failure: 0, totalTokens: 1 }`. Mock `UsersService.findById` to return a user with one token.
- [x] 7.3 Test: offline callee with tokens → `call_initiated` emitted to caller, push service called once, session in Redis has `pushSentAt`, grace timer registered.
- [x] 7.4 Test: offline callee with no tokens → `call_missed` emitted immediately, push service NOT called, no timer.
- [x] 7.5 Test: grace timer fires → `call_missed` emitted, session removed, log status `missed`. Use Jest `jest.useFakeTimers()` to fast-forward 25s.
- [x] 7.6 Test: caller cancels during grace → `call_cancelled` emitted, timer cleared, log status `cancelled`. ← (verify: all 5 spec scenarios under the main requirement have a matching test)

## 8. Build, lint, type-check

- [x] 8.1 Run `npm run build` from `chat-backend/` — must pass without TS errors.
- [x] 8.2 Run `npm run lint` from `chat-backend/` — do NOT introduce new errors; new service code should be clean (`0` new `@typescript-eslint/no-unsafe-*` items in the new file).
- [x] 8.3 Run `npm test -- call-notifications` and `npm test -- webrtc.gateway` if test scripts exist — all green. ← (verify: full green test run, no skipped specs for the new code)

## 9. Follow-up documentation

- [x] 9.1 Update `docs/backend-webrtc-breakdown.md` (or add a section) explaining the new offline-push flow, payload shape, and grace-period semantics. Keep it short; this is reference, not tutorial.
- [x] 9.2 Note the mobile-side follow-up in the document: "Mobile must implement an FCM background data handler for `type='incoming_call'` to surface full-screen incoming-call UI (CallKit / ConnectionService). Deferred to a separate change." ← (verify: doc reflects deferred scope so future readers understand why behavior is backend-only)
