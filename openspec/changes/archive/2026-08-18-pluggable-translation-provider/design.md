## Context

Koola's message translation is live as an isolated `TranslationModule` (NestJS) with a single Google Cloud Translation REST adapter, Redis cache (`translate:{sha256(targetLang:normalizedText)}`, 30-day TTL), mobile LRU 500, and a strict auto-translate predicate. The current code in `translation.service.ts` mixes cache orchestration with the Google `fetch` call and falls back to a mock `[vi] text` when `GOOGLE_TRANSLATE_API_KEY` is missing, which was intentional for dev (commit `5c6c905`) but blocks real translation.

Constraints: stateless backend (no in-memory conversation state, Redis via `RedisService` only), strict layer separation (controller → service → schema), DTO validation at the HTTP boundary, and `ThrottlerGuard` 30 req/60s per user. Product wants cost control (free tier for casual use) and a path to premium quality (LLM) without rewriting the translation stack.

## Goals / Non-Goals

**Goals:**
- Decouple cache/predicate/rate-limit from the provider so adding or swapping a provider is one file + one env flag.
- Ship MyMemory as a free fallback (Google 429/5xx/timeout → one MyMemory attempt) to keep the feature working without billing for light use and to survive Google quota blips.
- Reserve an LLM adapter (Claude/GPT) gated by a premium entitlement, without integrating billing/entitlement in this change.

**Non-Goals:**
- Mobile changes (service, LRU, TranslatedText, context menu, Settings) — out of scope.
- Real entitlement/billing, per-user provider choice UI, or admin cost dashboards.
- Changing cache key, TTL, predicate, rate limit, or timeout.
- Adding SDK dependencies (Google SDK, OpenAI SDK) — plain `fetch` only.

## Decisions

### D1 — Provider interface + composition in TranslationService

**Decision:** Introduce `TranslationProvider { translate(text, targetLang): Promise<{translatedText, sourceLang}> }` plus `name` and `isConfigured(): boolean`. `TranslationService` owns cache read/write, key derivation, normalization, timeout (3s per provider call), and orchestration; it selects the provider chain based on `TRANSLATION_PROVIDER` env and fallback policy.

**Alternatives:** (A) Subclass `TranslationService` per provider — rejected: duplicates cache logic. (B) Strategy injected via `TranslationModule` factory per env — chosen as implementation detail of D1.

**Rationale:** Follows existing layer separation and `RedisService` pattern; one place to test cache/TTL, one place per provider to test HTTP mapping.

### D2 — Google stays primary, MyMemory is fallback not primary

**Decision:** Default `TRANSLATION_PROVIDER=google`. On a provider error that is retriable (`HttpException` with 502/429 or timeout), and only when `MYMEMORY_EMAIL` is set or MyMemory is allowed unauthenticated, attempt MyMemory once. If that also fails, propagate 502. When env is `mymemory`, MyMemory is primary (no Google attempt).

**Alternatives:** MyMemory as primary — rejected: quality and quota unsuitable for auto-translate at scale.

**Rationale:** Preserves quality for most traffic, uses free tier only as resilience. Single fallback attempt bounds latency (max ~6s, but `TranslationService` enforces 3s per provider call).

### D3 — LLM stub gated by premium

**Decision:** `LlmProvider` implements the same interface, reads `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`), and is selected only when `TRANSLATION_PROVIDER=llm` **and** the caller has a premium gate (initially `process.env.TRANSLATION_LLM_ENABLED === 'true'` or a future `user.entitlement` check). Without the gate or key, it reports `isConfigured()=false` and the service falls through to Google → MyMemory → mock.

**Rationale:** Keeps the LLM path testable without wiring billing; future entitlement check is a one-line predicate change.

### D4 — MyMemory request shape

**Decision:** `GET https://api.mymemory.translated.net/get?q={encodeURIComponent(text)}&langpair={sourceLang}|{targetLang}&de={MYMEMORY_EMAIL}` with `sourceLang` auto-detected or `en` fallback. Parse `responseData.translatedText` and `matches[0].segment` quality; treat `responseStatus !== 200` or `quotaExceeded` as provider error.

**Rationale:** MyMemory's free API uses `langpair` with `|` separator and optional `de` email for quota lift. Using `GET` matches their docs; response is JSON, no SDK needed.

### D5 — No new dependencies, env-only config

**Decision:** All providers use global `fetch` + `AbortController` with 3s timeout, same error mapping to `HttpException(502)`. Add `TRANSLATION_PROVIDER`, `MYMEMORY_EMAIL`, `ANTHROPIC_API_KEY` to `.env.example`.

**Rationale:** Matches `CLAUDE.md` dependency rule and existing Google adapter's plain-HTTPS approach.

## Risks / Trade-offs

- **MyMemory quota (1000-5000/day/IP) still limits fallback** → Mitigation: Redis cache absorbs repeats; fallback is only on Google failure, not primary; monitor `X-RateLimit` if present.
- **MyMemory quality lower than Google/LLM** → Mitigation: fallback only, not default; still better than 502/mock.
- **Latency doubles on fallback (up to 6s)** → Mitigation: 3s per-provider timeout, cache hit path unaffected, mobile already has 3s abort.
- **LLM prompt injection / cost blowup if enabled broadly** → Mitigation: gated, not enabled in this change; prompt is fixed ("Translate to {targetLang}, return JSON {translatedText, sourceLang}"), no user prompt passthrough.
- **Env misconfiguration (all providers unconfigured)** → Mitigation: preserve mock fallback with warn log, so dev still works; prod deploy checklist asserts at least one provider key.

## Migration Plan

1. Deploy backend with new providers; default `TRANSLATION_PROVIDER=google` keeps current behavior when Google key is present.
2. Set `MYMEMORY_EMAIL` in staging/prod to enable fallback without code change.
3. LLM remains inert until `TRANSLATION_PROVIDER=llm` + premium gate + `ANTHROPIC_API_KEY` are set — no rollout risk.
4. Rollback: revert `TRANSLATION_PROVIDER` to `google` or remove `MYMEMORY_EMAIL`; delete `providers/` if needed — no schema migration.

## Open Questions

- Whether product wants per-user provider choice (e.g., free users → MyMemory, premium → LLM) vs. global env — deferred; interface supports either.
- Whether to surface provider used (`source: google|mymemory|llm|mock|cache`) in the response for observability — deferred to ops follow-up.
