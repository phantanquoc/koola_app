# message-translation Specification

## ADDED Requirements

### Requirement: Translation proxy endpoint
The system SHALL expose an authenticated `POST /api/translate` endpoint that translates caller-provided text into a target language, detects the source language, caches results, and returns a structured response indicating whether the answer was cached.

#### Scenario: Successful translation on cache miss
- **WHEN** an authenticated user sends `POST /api/translate` with `{ text: "Hello world", targetLang: "vi" }` and the cache has no matching entry
- **THEN** the system returns HTTP 200 with `{ translatedText, sourceLang: "en", cached: false }` where `translatedText` is the provider's translation

#### Scenario: Cached translation served
- **WHEN** an authenticated user repeats the same `{ text, targetLang }` pair that is still within the 30-day cache TTL
- **THEN** the system returns HTTP 200 with `cached: true` without calling the external provider

#### Scenario: Unauthenticated caller rejected
- **WHEN** an unauthenticated caller sends `POST /api/translate`
- **THEN** the system returns HTTP 401

#### Scenario: Invalid payload rejected
- **WHEN** the request omits `text` or `targetLang`, or `targetLang` is not a valid ISO 639-1 code, or `text` is empty/whitespace, or `text` exceeds 10000 characters
- **THEN** the system returns HTTP 400 with a validation error

#### Scenario: Rate limit exceeded
- **WHEN** the same authenticated user exceeds the translate rate limit of 30 requests per 60 seconds
- **THEN** the system returns HTTP 429

#### Scenario: Provider failure or timeout
- **WHEN** the external provider returns an error or the provider call exceeds the configured timeout
- **THEN** the system returns an error response (HTTP 502 or internal error code) that the mobile client handles by showing original text only and not mounting a subtitle

#### Scenario: Cache key isolation by language pair
- **WHEN** the same `text` is translated to two different `targetLang` values
- **THEN** each translation is cached under a distinct key and neither pollutes the other

### Requirement: Translation Redis caching
The system SHALL cache translation results in Redis keyed by `translate:{sha256(normalizedSourceLang:targetLang:normalizedText)}` with a TTL of 30 days, where the text is NFC-normalized and trimmed before hashing.

#### Scenario: Cache key determinism
- **WHEN** two requests with identical `sourceLang`, `targetLang`, and `text` (after NFC normalization and trimming) are issued
- **THEN** both resolve to the same cache key and the second request is a hit when the first is still within TTL

#### Scenario: Cache entry expiry
- **WHEN** a cache entry has exceeded its 30-day TTL
- **THEN** the next request for that key is a miss and the system calls the provider again

#### Scenario: Cache stores detected source language
- **WHEN** a translation is cached
- **THEN** the cached value includes both `translatedText` and `sourceLang` so subsequent cache hits also return the source language without a separate detection call

### Requirement: User translation settings
The system SHALL persist per-user translation preferences `preferredLanguage` (ISO 639-1 code, default `"vi"`) and `autoTranslateEnabled` (boolean, default `false`) on the user's `settings` object, readable via `GET /users/me` and writable via `PUT /users/me/settings`, with strict validation.

#### Scenario: Default settings for a new user
- **WHEN** a new user is created and has never written translation settings
- **THEN** `GET /users/me` returns `settings.preferredLanguage === "vi"` and `settings.autoTranslateEnabled === false` (defaults), and subsequent `PUT /users/me/settings` partial updates leave unspecified fields at their defaults

#### Scenario: Update preferred language successfully
- **WHEN** an authenticated user sends `PUT /users/me/settings` with `{ preferredLanguage: "en" }`
- **THEN** the system returns HTTP 200 with the updated user and subsequent `GET /users/me` reflects `preferredLanguage === "en"`

#### Scenario: Toggle auto-translate
- **WHEN** an authenticated user sends `PUT /users/me/settings` with `{ autoTranslateEnabled: true }`
- **THEN** the system returns HTTP 200 and subsequent `GET /users/me` reflects `autoTranslateEnabled === true`

#### Scenario: Invalid language code rejected
- **WHEN** the caller sends `preferredLanguage` that is not a valid ISO 639-1 code (unknown, wrong length, non-alpha)
- **THEN** the system returns HTTP 400 with a validation error and the setting is not persisted

#### Scenario: Partial settings update preserves other fields
- **WHEN** the user updates only `preferredLanguage` via `PUT /users/me/settings`
- **THEN** the existing `autoTranslateEnabled` value (and `notificationsEnabled`) is preserved and not reset

#### Scenario: Public profile hides translation settings
- **WHEN** an authenticated user calls `GET /users/:userId` for another user
- **THEN** the response SHALL NOT include `settings` at all (including translation fields), consistent with the profile privacy rule

### Requirement: Auto-translate trigger predicate
The system SHALL automatically translate an incoming text message for the receiving user only when all of the following hold: `autoTranslateEnabled === true` on the receiver's settings, `type === "text"` and `content` is non-empty/whitespace and length >= 3, `senderId !== currentUserId`, `system !== true`, and the detected source language differs from `preferredLanguage`. This predicate is evaluated per-message on the receiving side.

#### Scenario: Auto-translate fires for a foreign-language message
- **WHEN** user A (preferredLanguage `"vi"`, autoTranslateEnabled `true`) receives a text message from user B whose detected source language is `"en"` and the content is at least 3 characters
- **THEN** the app fetches a translation to `"vi"` and renders it as a subtitle beneath the original text

#### Scenario: Same-language message is not auto-translated
- **WHEN** the detected source language equals the receiver's `preferredLanguage`
- **THEN** no translation is fetched and only the original text is rendered

#### Scenario: Auto-translate disabled — no translation fetched
- **WHEN** `autoTranslateEnabled === false` on the receiving user
- **THEN** no translation is fetched for any incoming message regardless of language mismatch

#### Scenario: Own message is never auto-translated
- **WHEN** the incoming message's `senderId` equals the receiver's own user ID
- **THEN** no translation is fetched even when the language predicate would otherwise fire

#### Scenario: System message is never auto-translated
- **WHEN** the message is a system message (`type === "system"` or `system === true`)
- **THEN** no translation is fetched

#### Scenario: Short text is not auto-translated
- **WHEN** the message content after trimming is shorter than 3 characters
- **THEN** no translation is fetched

#### Scenario: Non-text message is not auto-translated
- **WHEN** the message `type` is `image`, `file`, `video`, `voice`, or `system` (or has no textual `content`)
- **THEN** no translation is fetched

#### Scenario: Empty or whitespace content is not auto-translated
- **WHEN** the message `content` is empty or contains only whitespace
- **THEN** no translation is fetched

### Requirement: Manual translate on demand
The system SHALL allow the user to translate any text message on demand via the message context menu, regardless of the `autoTranslateEnabled` setting, provided the message has non-empty textual content.

#### Scenario: Manual translate from context menu
- **WHEN** the user long-presses a text message and taps "Dịch" (Translate) in the context menu
- **THEN** the app calls the translate endpoint for that message's text to the user's `preferredLanguage` and renders the result as a subtitle beneath the original

#### Scenario: Manual translate available even when auto-translate is disabled
- **WHEN** `autoTranslateEnabled === false` and the user taps "Dịch" on a text message
- **THEN** manual translation still proceeds and the subtitle is shown for that message

#### Scenario: Manual translate not shown for non-text messages
- **WHEN** the long-pressed message has no textual content (media-only, file, system)
- **THEN** the "Dịch" action SHALL NOT appear in the context menu

#### Scenario: Manual translate failure shows feedback without blocking
- **WHEN** the translate call fails (network error, provider error, rate limit, or 3 s timeout)
- **THEN** the app shows a Toast "Không thể dịch, thử lại sau", does not mount a subtitle, and the original text remains visible and interactive

#### Scenario: Manual translate timeout
- **WHEN** the backend or provider call has not completed after 3 seconds
- **THEN** the client SHALL abort the request, treat it as a failure, and show the same failure feedback as above

### Requirement: Translation display presentation
The system SHALL render a successfully translated message with the original text unchanged and fully visible, plus a translated-text subtitle directly beneath it in a muted, italic style. The original text is always shown; the translation SHALL NOT replace it. Tapping the subtitle toggles between collapsed (one line, truncated) and expanded (full text).

#### Scenario: Successful translation renders subtitle beneath original
- **WHEN** a translation succeeds for a text message (via auto-translate or manual translate)
- **THEN** the bubble shows the original `MessageText` exactly as before and directly beneath it a subtitle containing `translatedText` in muted italic `KoolaText`

#### Scenario: Original text always preserved
- **WHEN** a translation is displayed
- **THEN** the original message content SHALL remain visible above the subtitle and SHALL NOT be hidden, dimmed, or covered by the subtitle

#### Scenario: Tap subtitle to toggle collapse/expand
- **WHEN** the user taps the translation subtitle that is currently collapsed (single line, truncated)
- **THEN** it expands to show the full translated text
- **AND WHEN** the user taps again
- **THEN** it collapses back to a single truncated line

#### Scenario: Translation failure shows original text only
- **WHEN** a translation attempt fails for any reason (provider error, 429, timeout, missing text)
- **THEN** only the original text is rendered with no subtitle and no layout shift beyond the absent subtitle

#### Scenario: Translation subtitle does not affect bubble geometry
- **WHEN** a translation subtitle is present or absent
- **THEN** the bubble's row-level geometry (start/end alignment, 60 dp inset, minimum height, bottom-aligned content, justified metadata strip, and content order) SHALL be preserved and the subtitle SHALL not be rendered outside the bubble wrapper's width constraints

#### Scenario: Translation subtitle preserves link semantics
- **WHEN** a translation subtitle is shown
- **THEN** the original `MessageText` component SHALL continue to render URLs, phone numbers, and emails as tappable links with scheme repair and failure handling, exactly as specified by `chat-message-presentation`

### Requirement: Mobile translation service with local cache
The mobile client SHALL expose a `translationService.translate(text, targetLang): Promise<TranslateResult>` that calls `POST /api/translate`, enforces a 3 s request timeout via `AbortController`, and maintains an in-memory LRU cache of at most 500 entries keyed by `sha256(targetLang:normalizedText)`.

#### Scenario: Translate call uses backend endpoint
- **WHEN** the mobile service is asked to translate `text` to `targetLang`
- **THEN** it issues `POST /api/translate` with `{ text, targetLang }` via `apiClient`, attaches the bearer token, and returns `{ translatedText, sourceLang, cached }`

#### Scenario: Local LRU cache hit skips network
- **WHEN** the same `text + targetLang` pair has been translated before and is still in the 500-entry LRU
- **THEN** the service returns the cached result synchronously without a network request

#### Scenario: Local LRU evicts oldest entry on overflow
- **WHEN** a 501st distinct `text + targetLang` pair is cached
- **THEN** the least-recently-used entry is evicted and its key becomes a miss on next access

#### Scenario: Timeout aborts request
- **WHEN** the backend call has not completed after 3 seconds
- **THEN** the request is aborted via `AbortController` and the caller receives a timeout error that the display layer treats as a silent failure (manual path shows a Toast)

#### Scenario: Local cache is keyed by normalized text
- **WHEN** two calls provide text differing only by NFC normalization or surrounding whitespace but identical `targetLang`
- **THEN** both resolve to the same local cache key after normalization/trim

### Requirement: Inputs and limits
The system SHALL validate translation inputs and enforce documented limits on both ends.

#### Scenario: Mobile skips translation for trivial input
- **WHEN** `translationService.translate` is called with `text` that after trimming is empty, only whitespace, or shorter than 3 characters
- **THEN** it returns without a network request and the caller treats the translation as absent (original-text-only rendering)

#### Scenario: Backend enforces max text length
- **WHEN** `POST /api/translate` receives `text` longer than 10000 characters
- **THEN** it returns HTTP 400 and no cache entry is written

#### Scenario: Input text is not stored as a message transcript
- **WHEN** a translation is requested
- **THEN** the `text` of the request SHALL only be persisted as a cache value under the derived `translate:*` key and SHALL NOT create or modify any `Message` document

