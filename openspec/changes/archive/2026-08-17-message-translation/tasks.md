## 1. Backend — isolated TranslationModule

- [x] 1.1 Create DTO `dto/translate.dto.ts` with validated fields `text` (string, required, 1..10000, trimmed non-empty) and `targetLang` (ISO 639-1 enum, required); enforce `class-validator` decorators and Swagger `@ApiProperty`
- [x] 1.2 Create `translation.service.ts` owning: SHA256 cache-key derivation from NFC-normalized `sourceLang:targetLang:text`, Redis caching under `translate:*` with 30-day TTL, `translate(text, targetLang)` and `detectLanguage(text)` via plain HTTPS to Google Cloud Translation, structured error and timeout propagation, and normalization/trim helpers
- [x] 1.3 Create `translation.controller.ts` with `POST /api/translate`, `ThrottlerGuard` at 30 req/60 s per user, DTO validation at HTTP boundary, delegation to the service, response `{ translatedText, sourceLang, cached }`, and mapped 502/429/400 semantics
- [x] 1.4 Create `translation.module.ts` importing `CommonModule` (for `RedisService`) and wiring the controller + service; register the module in `chat-backend/src/app.module.ts`
- [x] 1.5 Add `GOOGLE_TRANSLATE_API_KEY` to `chat-backend/.env.example` and document its purpose; guard the service so the absence of the key yields a structured error the mobile treats as silent failure, not a startup crash
- [x] 1.6 Verify `npx tsc --noEmit` passes in `chat-backend`, the new endpoint returns 401 when unauthenticated and 400 for invalid payloads, and `ThrottlerGuard` returns 429 above the 30/min window ← (verify: layer separation holds — no business logic in the controller, DTO validation at the boundary, Redis is the only shared state, and the cache key is content-addressed with 30-day TTL)

## 2. Backend — user translation settings

- [x] 2.1 Extend the User `settings` object in `chat-backend/src/users/user.schema.ts` with `preferredLanguage` (string, ISO 639-1, default `"vi"`) and `autoTranslateEnabled` (boolean, default `false`), preserving existing `notificationsEnabled`
- [x] 2.2 Extend the settings DTO/service path backing `PUT /users/me/settings` to accept and validate `preferredLanguage` and `autoTranslateEnabled` (including unknown/short/invalid code → 400), and ensure `GET /users/me` reflects defaults for pre-existing documents
- [x] 2.3 Ensure `GET /users/:userId` (public read) does not expose `settings` at all, including translation fields, matching the existing privacy rule ← (verify: new user defaults are correct; partial settings PATCH preserves unspecified fields; public read hides `settings`; invalid language codes are rejected with 400)

## 3. Mobile — isolated translation service and hook

- [x] 3.1 Create `ChatApp/src/services/translation/translationService.ts` that calls `POST /api/translate` via `apiClient` with the bearer token, normalizes/trims input (NFC), caps trivial inputs (<3 chars/whitespace) with no network request, enforces a 3 s `AbortController` timeout, and wraps responses as `{ translatedText, sourceLang, cached }` with errors surfaced as timeout/provider/rate-limit signals
- [x] 3.2 Give the service an in-memory LRU cache of at most 500 entries keyed by `sha256(targetLang:normalizedText)`, with synchronous hit path and eviction of the oldest entry on the 501st insert
- [x] 3.3 Create `ChatApp/src/services/translation/useAutoTranslate.ts`, a thin hook that, for a given `IMessage` and the caller's `preferredLanguage`/`autoTranslateEnabled`, evaluates the auto-translate predicate (text + length >= 3 + not-own + not-system + sourceLang !== preferredLanguage) and drives the service, returning `{ translatedText, isLoading, error, collapsed, toggle }` for the view layer
- [x] 3.4 Add translation keys/types and storage: extend `ChatApp/src/services/storage/asyncStorage.ts` with `AUTO_TRANSLATE` / `PREFERRED_LANGUAGE` keys and helpers, and `ChatApp/src/types/index.ts` with translation result and settings types ← (verify: local cache hit skips network; overflow evicts LRU; timeout aborts cleanly; trivial input never hits the network)

## 4. Mobile — UI integration (small, additive, isolated)

- [x] 4.1 Create `ChatApp/src/components/TranslatedText.tsx`, an italic muted `KoolaText` subtitle rendered directly beneath `MessageText` inside the bubble wrapper, collapsing to one truncated line by default and expanding on tap, without touching bubble geometry
- [x] 4.2 Extend `ChatApp/src/components/MessageContextMenu.tsx` to show a tappable "Dịch" row only when the message has non-empty text content; on tap, invoke `translationService.translate` for that message's `content` to the user's `preferredLanguage` and thread the result into the bubble's translation slot, with failure showing a Toast "Không thể dịch, thử lại sau" and not mounting a subtitle
- [x] 4.3 Extend `ChatApp/src/screens/main/SettingsScreen.tsx` to add an auto-translate `Switch` and a `preferredLanguage` picker (using `KoolaText`/`KoolaListItem`/existing UI primitives), persisting optimistically to `asyncStorage` and authoritatively via `PUT /users/me/settings`, and hydrating on mount from the fetched user `settings`
- [x] 4.4 Thread translations into the read path: in `ChatApp/src/screens/chat/hooks/useMessagesFromDb.ts`, have `dbMsgToGifted()` carry an optional `translation` attachment on `IMessage & Record<string, unknown>` and have `MessageItem.renderBubble` branch to `TranslatedText` when present; ensure auto-translate and manual translate both populate the same slot and that subtitle absence/presence does not reflow the bubble outside its constraints ← (verify: translated bubble preserves bubble geometry — alignment, inset, min height, metadata strip, content order — and link semantics in MessageText; context menu shows "Dịch" only for text messages; failing translation leaves original text intact with no layout shift beyond the absent subtitle)

## 5. Tests and verification

- [x] 5.1 Backend unit tests for translation: successful translate cache miss/hit, TTL, key isolation across language pairs and normalized/trimmed variants, rate-limit signal, provider error/timeout signal, and settings validation/privacy; run `npx jest --testPathPattern=translation` ← (verify: backend tests cover cache determinism/expiry, same-text different-target isolation, defaults and privacy, and all predicate branches)
- [x] 5.2 Mobile unit tests for `translationService` (LRU hit/overflow/timeout/trivial-input guard) and `TranslatedText` rendering, and snapshot of `MessageItem` with and without a translation; run `npx jest` in `ChatApp` ← (verify: mobile LRU, timeout, subtitle rendering, and snapshot pass; no production-only module imported in the test path)
- [x] 5.3 Final checks: `npx tsc --noEmit` in both `chat-backend` and `ChatApp` (zero errors) and ESLint clean on both ends ← (verify: typecheck and lint clean on both ends)
