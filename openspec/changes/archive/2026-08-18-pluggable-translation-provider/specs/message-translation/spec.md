## MODIFIED Requirements

### Requirement: Translation proxy endpoint
The system SHALL expose an authenticated `POST /api/translate` endpoint that translates caller-provided text into a target language via a pluggable provider (Google primary with MyMemory fallback, optional LLM for premium), detects the source language, caches results, and returns a structured response indicating whether the answer was cached.

#### Scenario: Successful translation on cache miss
- **WHEN** an authenticated user sends `POST /api/translate` with `{ text: "Hello world", targetLang: "vi" }` and the cache has no matching entry
- **THEN** the system returns HTTP 200 with `{ translatedText, sourceLang: "en", cached: false }` where `translatedText` is the provider's translation (Google by default, MyMemory on fallback, LLM when premium-gated)

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
- **THEN** the system returns an error response (HTTP 502 or internal error code) that the mobile client handles by showing original text only and not mounting a subtitle. When the primary provider is Google and MyMemory is configured, the system SHALL attempt MyMemory once before returning 502.

#### Scenario: Cache key isolation by language pair
- **WHEN** the same `text` is translated to two different `targetLang` values
- **THEN** each translation is cached under a distinct key and neither pollutes the other

#### Scenario: Google fallback to MyMemory on retriable failure
- **WHEN** Google returns 429 or 5xx or times out and `MYMEMORY_EMAIL` (or unauthenticated MyMemory) is available
- **THEN** the system retries exactly once via MyMemory and on MyMemory success returns HTTP 200 with the MyMemory translation

#### Scenario: Mock only when all providers unconfigured
- **WHEN** no provider is configured (missing keys) and cache is a miss
- **THEN** the system returns a mock translation `[targetLang] normalizedText` with `sourceLang:auto` (dev fallback), caches it, and does not return 502

### Requirement: Translation Redis caching
The system SHALL cache translation results in Redis keyed by `translate:{sha256(normalizedSourceLang:targetLang:normalizedText)}` with a TTL of 30 days, where the text is NFC-normalized and trimmed before hashing. The cache is provider-agnostic: a cached entry from any provider serves subsequent hits without calling a provider.

#### Scenario: Cache key determinism
- **WHEN** two requests with identical `sourceLang`, `targetLang`, and `text` (after NFC normalization and trimming) are issued
- **THEN** both resolve to the same cache key and the second request is a hit when the first is still within TTL

#### Scenario: Cache entry expiry
- **WHEN** a cache entry has exceeded its 30-day TTL
- **THEN** the next request for that key is a miss and the system calls the provider again

#### Scenario: Cache stores detected source language
- **WHEN** a translation is cached
- **THEN** the cached value includes both `translatedText` and `sourceLang` so subsequent cache hits also return the source language without a separate detection call
