# translation-provider-strategy Specification

## Purpose
TBD - created by archiving change pluggable-translation-provider. Update Purpose after archive.
## Requirements
### Requirement: Translation provider abstraction
The system SHALL expose a `TranslationProvider` abstraction with `name`, `isConfigured(): boolean`, and `translate(text, targetLang): Promise<{translatedText, sourceLang}>`, and `TranslationService` SHALL orchestrate cache, key derivation, and provider selection without duplicating provider logic.

#### Scenario: Provider interface is the sole translation boundary
- **WHEN** `TranslationService.translate` is called with `{text, targetLang}`
- **THEN** it checks Redis cache first and only delegates to the selected provider on a miss, mapping provider results to `{translatedText, sourceLang, cached}`

#### Scenario: Google provider is the default when configured
- **WHEN** `TRANSLATION_PROVIDER` is unset or `google` and `GOOGLE_TRANSLATE_API_KEY` is set
- **THEN** the service selects `GoogleProvider` and its `isConfigured()` returns true

#### Scenario: Provider reports not configured when its key is missing
- **WHEN** a provider's required env (e.g., `GOOGLE_TRANSLATE_API_KEY` for Google, `ANTHROPIC_API_KEY` for LLM) is absent
- **THEN** `isConfigured()` returns false and the service skips that provider

### Requirement: Google-primary with MyMemory fallback
The system SHALL use Google as the primary provider and SHALL attempt MyMemory once on a retriable Google failure (HTTP 429, 502/5xx, or 3s timeout) before returning a provider error, when MyMemory is configured.

#### Scenario: Successful Google translation does not fallback
- **WHEN** Google returns 200 with `translatedText` and `detectedSourceLanguage`
- **THEN** the service caches and returns that result with `cached:false` and does not call MyMemory

#### Scenario: Google 429 falls back to MyMemory and succeeds
- **WHEN** Google returns 429 or `Translation provider error` and MyMemory is configured
- **THEN** the service calls `https://api.mymemory.translated.net/get` once with `q`, `langpair`, and optional `de`, and on success caches and returns the MyMemory result

#### Scenario: Both providers fail returns 502
- **WHEN** Google fails and MyMemory (when attempted) also fails or is not configured
- **THEN** the service throws `HttpException` with `BAD_GATEWAY` and does not write a cache entry

#### Scenario: MyMemory primary when env selects it
- **WHEN** `TRANSLATION_PROVIDER=mymemory`
- **THEN** the service calls MyMemory directly without attempting Google

### Requirement: LLM provider stub gated for premium
The system SHALL provide an `LlmProvider` implementing `TranslationProvider` gated by a premium entitlement flag, and SHALL fall through to Google/MyMemory/mock when the gate or key is absent.

#### Scenario: LLM selected only when premium gate and key are present
- **WHEN** `TRANSLATION_PROVIDER=llm` and `TRANSLATION_LLM_ENABLED=true` (or future `user.entitlement.premium`) and `ANTHROPIC_API_KEY` is set
- **THEN** `LlmProvider.isConfigured()` is true and the service delegates to it

#### Scenario: LLM not gated falls through
- **WHEN** `TRANSLATION_PROVIDER=llm` but the premium gate is false or the API key is missing
- **THEN** the service treats LLM as not configured and proceeds to Google → MyMemory → mock in order

#### Scenario: LLM prompt is fixed and safe
- **WHEN** the LLM provider is invoked
- **THEN** it uses a fixed prompt of the form `Translate to {targetLang}, return JSON {translatedText, sourceLang}` with the user text as data only, and parses the JSON response

### Requirement: Mock fallback preserved for dev
The system SHALL return a mock translation `[targetLang] normalizedText` with `sourceLang:auto` and cache it only when **all** configured providers are not configured, preserving dev testability without billing.

#### Scenario: Mock when no provider is configured
- **WHEN** Google, MyMemory, and LLM all report `isConfigured()=false` and cache is a miss
- **THEN** the service returns `{translatedText: "[vi] hello", sourceLang:"auto", cached:false}` and writes the mock to Redis

#### Scenario: Mock is cached
- **WHEN** the mock path has written a cache entry
- **THEN** a second identical request returns `cached:true` without contacting any provider

### Requirement: Env-driven provider selection
The system SHALL read `TRANSLATION_PROVIDER` (values `google|mymemory|llm|auto`, default `google`), `GOOGLE_TRANSLATE_API_KEY`, `MYMEMORY_EMAIL` (optional, lifts MyMemory quota), and `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (optional) from env, and document them in `chat-backend/.env.example`.

#### Scenario: Default env is Google
- **WHEN** `TRANSLATION_PROVIDER` is unset
- **THEN** behavior is identical to `TRANSLATION_PROVIDER=google`

#### Scenario: Auto mode tries Google then MyMemory
- **WHEN** `TRANSLATION_PROVIDER=auto`
- **THEN** the service attempts Google first and on retriable failure attempts MyMemory once before erroring

### Requirement: Cache, timeout, and rate limit unchanged
The system SHALL preserve the existing Redis cache key (`translate:{sha256(targetLang:normalizedText)}`), 30-day TTL, NFC+trim normalization, 3s per-provider timeout via `AbortController`, and `TranslateRateLimitGuard` 30 req/60s.

#### Scenario: Cache hit still skips provider
- **WHEN** a `translate:{hash}` entry exists within TTL
- **THEN** the service returns it with `cached:true` without calling any provider

#### Scenario: Cache stores provider result with sourceLang
- **WHEN** any provider succeeds
- **THEN** the service writes `{translatedText, sourceLang}` to Redis with `EX 2592000`

