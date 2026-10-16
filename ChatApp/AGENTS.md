# ChatApp AGENTS.md

> Scope: `ChatApp/` (React Native 0.76, New Architecture + Hermes). Backend rules live in repo-root `AGENTS.md` / `CLAUDE.md`.
> Companion: repo-root `CLAUDE.md` is the mental model (Three Truths: REST writes, Socket syncs, Mobile renders). This file is the mobile playbook.

## 1. Auth lifecycle (source: `ChatApp/src/contexts/AuthContext.tsx`, `ChatApp/src/services/api/apiService.ts`)

- Access token lives ONLY in module memory (`accessToken` in `apiService.ts` via `setAccessTokenInMemory` / `getAccessTokenInMemory`). NEVER write it to AsyncStorage, MMKV, or SQLite.
- Refresh token lives in AsyncStorage (`ChatApp/src/services/storage/asyncStorage.ts`). Rotate on every refresh (`setRefreshToken` after each `/auth/refresh`).
- Session restore order in `restoreSession()`: refresh token -> `setAccessTokenInMemory` -> `usersApi.getMe()` -> `accountsApi.list()` -> re-switch into stored business account if any -> `initDb(activeId)` -> `wireLocalFirst()` -> `seedConversationsIntoSQLite()` -> `socketService.connect()` + `webrtcService.connect()` -> `pushNotificationService.registerToken()`.
- 401 interceptor retries once (`_retry` flag), re-mints business token via `/accounts/switch` when `activeAccountId` is set. Refresh failure (401/403) fires `forceLogoutHandler` -> full teardown. Socket path uses `refreshAccessTokenForSocket()` which distinguishes `ok` / `network` (retry) / `auth` (stop, logout already fired). Never force-logout on transient network errors.
- Logout order (Fabric crash-safe, see `[[logout_removeviewat_crash]]`): `navigationRef.reset()` to `LogoutTransition` -> await 3 rAF ticks -> `unregisterToken`, disconnect webrtc + socket, server logout -> `setAccessTokenInMemory(null)`, `clearAll`, `clearAll` message cache -> `unwireLocalFirst()` -> `wipeAllData()` + `shutdownDb()` -> clear accounts, `cartStore.clearAllAccounts()`, set user null LAST.
- `switchAccount(targetId)`: block when call state is not idle/ended/failed -> `accountsApi.switch` for delegated token -> full teardown (unwire, disconnect both sockets, `shutdownDb`) WITHOUT clearing root refresh token -> `initDb(targetId)` -> rewire + reconnect -> adopt target identity via `getMe()`.

## 2. Dev environment: dev-config + adb + cleartext

- Dev API/WS URL comes from `ChatApp/dev-config.json` (`DEV_HOST`, `DEV_PORT`), read via Metro `@dev-config` alias (`ChatApp/metro.config.js` `resolveRequest`). Fallback is `dev-config.example.json` (emulator `10.0.2.2`); prod stub is `dev-config.prod-stub.json` (stripped from prod bundle).
- After changing network or pulling: run `npm run dev:sync-host` from repo root. It auto-detects LAN IP and writes `ChatApp/dev-config.json` + backend MinIO host. Manual override: `npm run dev:sync-host -- --interface=Wi-Fi`.
- Physical device over USB: run on EVERY cable reconnect:
  ```
  adb reverse tcp:3000 tcp:3000
  adb reverse tcp:8081 tcp:8081
  ```
- LAN dev uses plain HTTP, allowed by `ChatApp/android/app/src/main/res/xml/network_security_config.xml` (`cleartextTrafficPermitted="true"`). Do NOT remove this for dev convenience reasons; prod uses HTTPS via `PROD_API_URL` / `PROD_WS_URL` in `ChatApp/.env`.
- Missing config fails fast: `env.ts` throws if `DEV_HOST` is `PLACEHOLDER` or `PROD_API_URL` is unset.

## 3. Singleton services (reset on logout)

- `socketService`, `webrtcService`, `momentsService`, `cartStore` are module-level singletons. They survive navigation but MUST reset on logout / force-logout / account switch: `disconnect()`, `setCurrentUserId(null)`, `momentsService.reset()`, `cartStore.clearAllAccounts()` (or `setAccount(id)` on switch).
- Local-first wiring (`wireLocalFirst`): `wireSocketEvents()` + `wireSyncTriggers()` + `wireMediaPreloader()` + `startOutboxProcessor()` + `scheduleMaintenance()`. Every wire has an unwire; `unwireLocalFirst()` pauses the outbox BEFORE `wipeAllData()` so no in-flight tick writes after wipe.
- AppState foreground (`handleAppStateChange`): if token exists and socket/webrtc disconnected, reconnect; always `emitSync()` on webrtc (catches missed incoming_call while backgrounded); `momentsService.refreshFeed()`; `scheduleMaintenance()`. All best-effort, never throw.
- Never create a second instance of these services. Import the exported singleton.

## 4. Offline queue / outbox (source: `ChatApp/src/services/sync/outboxProcessor.ts`, `ChatApp/src/services/db/outboxRepository.ts`)

- Only FIVE durable op types are queued (`OutboxOpType`): `send_message`, `react`, `delete`, `delete_for_me`, `mark_read`. NEVER queue ephemeral events (typing, presence, ping, read-receipt animation state).
- `send_message` REQUIRES `clientMessageId`. It doubles as the idempotency key sent to the backend (`messagesApi.send` body) and as the optimistic row id (`temp_<clientMessageId>`). Enqueue uses `ON CONFLICT(op_type, dedup_key)` coalescing — duplicates collapse, not duplicate.
- Processor is single-flight foreground-only: `tick()` guarded by `_isTicking` / `_isPaused`, per-conversation serial, cross-conversation parallel cap 3, 50 ms pacing, 30 s periodic backstop. Triggers: NetInfo reconnect, AppState foreground, socket reconnect, InteractionManager-scheduled, periodic. Do NOT add background execution.
- Error policy (`classifyError`): retry `NETWORK`, `TIMEOUT`, `5XX`, `429`, `401`; dead-letter `403`, `404`, `4XX`, `PARSE`. Reply whose parent failed cascades to dead-letter (`cascadeDeadLetter`). `401` inside outbox means token refresh path, not user error.
- Seed invariant: every path that wires the socket router also calls `seedConversationsIntoSQLite()` (login, restore, verifyOtp, switch). `bumpFromMessage()` needs the row to exist or `notify()` never fires and the UI silently misses realtime updates.

## 5. Socket + realtime (source: `ChatApp/src/services/socket/SocketService.ts`, `ChatApp/src/services/sync/socketEventRouter.ts`)

- Namespace is `/chat` (`io(WS_URL + '/chat', { query: { token } })`). Transports `['polling', 'websocket']` — polling first is deliberate for RN Bridgeless reliability. `reconnection: false`; reconnect is manual with exponential backoff capped at 30 s, max 10 attempts.
- Reconnect rules: `io client disconnect` (intentional) never reconnects (`intentionallyDisconnected` guard + re-check after async token refresh). `io server disconnect` means token rejected -> refresh via `refreshAccessTokenForSocket()` before reconnecting with the stale token. Rapid connect-kick cycles (`consecutiveRapidDisconnects`) count toward the cap; counter resets only after 5 s stable.
- Listeners registered via `socketService.on()` persist across socket instance recreations (re-attached on every `connect`). Always pair `on` with `off` on unmount or screen blur, or listeners leak across reconnects.
- Router handles `new_message` (extend `HANDLERS` table in `socketEventRouter.ts`, do not scatter `socketService.on('new_message')` across screens). Room scoping is server-side on `conv:<id>` — never `io.emit()` globally from backend; client sends `conversationId` with every emit.
- Reconcile, don't just append: socket `new_message` writes to SQLite via repository, UI reads from repository/REST state. Offline gaps fill via `messagesApi.sync()` (`/messages/sync`). If socket and REST disagree, REST wins; socket is a hint, sync is truth.
- Payloads under 10 KB. Media travels as presigned-URL reference (`mediaApi.requestUploadUrl` -> PUT to MinIO -> send message with `mediaKey`), never binary in socket or Mongo.

## 6. Architecture + build commands

- New Architecture + Hermes are ON (`ChatApp/android/gradle.properties`: `newArchEnabled=true`, `hermesEnabled=true`). Verify every new native dependency is New-Arch compatible before adding. Prefer existing deps over new ones.
- Metro: `withNativeWind(config, ...)` wrapper is required (NativeWind CSS). Keep the `@dev-config` and `axios` `resolveRequest` overrides. After editing `metro.config.js`: `npx react-native start --reset-cache`.
- Commands (run from `ChatApp/` unless noted):
  ```
  npx react-native start --reset-cache   # Metro after config/native changes
  npx react-native run-android           # build + install (repo root script: scripts/clean-rebuild.sh for full clean)
  npx react-native run-ios               # iOS
  npm run tsc                            # tsc --noEmit, must be clean
  npm run lint                           # eslint ., must be clean
  npm test                               # jest unit; integration: npm run test:integration
  npm run check:bundle                   # prod bundle secret check
  ```
- Screen components stay thin (compose hooks + presentational components). No service-layer bypass: screens call `*Api` objects in `apiService.ts` or repositories, never `axios`/`fetch` or `apiClient` directly. Backend layer rule still applies: controller -> service -> schema, gateway never writes DB.
- No `console.log` in shipped code. No hardcoded IPs, tokens, or secrets — dev IP via `dev:sync-host`, prod via `.env`.

## 7. Before-done checklist

- [ ] `npm run tsc` clean, `npm run lint` clean (from `ChatApp/`)
- [ ] accessToken never persisted; refresh rotation preserved; logout/switch teardown order intact
- [ ] new socket listener paired with `off`; no global emit; `conversationId` present
- [ ] new outbox op (if any) is durable-only, has idempotency key, error classified retryable/non-retryable
- [ ] socket event reconciles with REST/SQLite state; offline gap covered by `/messages/sync`
- [ ] no new native dep without New-Arch + Hermes check; no secret in bundle (`npm run check:bundle`)
- [ ] happy-path test (`*.spec.ts`) next to the service; seed invariant kept (wire socket -> seed conversations)
