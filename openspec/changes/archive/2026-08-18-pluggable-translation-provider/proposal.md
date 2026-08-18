## Why

The current translation feature is blocked on a single provider (Google Cloud Translation) and returns mock data when `GOOGLE_TRANSLATE_API_KEY` is missing. This leaves the UI untestable with real text, wastes the existing Redis/mobile cache investment, and gives no path to cost control or premium quality. A pluggable provider strategy is needed now so the product can ship real translation without vendor lock-in.

## What Changes

- Introduce a `TranslationProvider` interface in `chat-backend/src/translation/` and extract the current Google REST call into `GoogleProvider`.
- Add `MyMemoryProvider` (`api.mymemory.translated.net/get`) as a free fallback; add `LlmProvider` as a stub/optional adapter for Claude/GPT gated by a premium entitlement (no billing integration in this change — interface + env only).
- Update `TranslationService` to select provider via `TRANSLATION_PROVIDER` env (default `google`) and to fallback once: Google failure (429/5xx/timeout) → MyMemory before returning 502. Mock `[vi] text` is retained only when **all** configured providers lack keys.
- Add env keys `TRANSLATION_PROVIDER`, `MYMEMORY_EMAIL`, `ANTHROPIC_API_KEY` (optional) to `chat-backend/.env.example` and document them.
- Keep all existing behavior: Redis cache (30-day TTL, SHA-256 key `translate:{hash}`), mobile LRU 500, auto-translate predicate (≥3 chars, skip own/system/same-lang), rate limit 30/60s, 3s timeout, DTO validation, and UI (TranslatedText, context menu "Dịch", Settings).
- No mobile code changes in this change; mobile continues to call `POST /api/translate`.

## Capabilities

### New Capabilities
- `translation-provider-strategy`: Pluggable backend provider abstraction, Google primary with MyMemory fallback, and optional LLM provider gated for premium. Covers interface, provider implementations, env selection, and single fallback attempt.

### Modified Capabilities
- `message-translation`: Provider is no longer Google-only; spec adds provider selection, fallback, and premium-gated LLM path. Cache, endpoint, settings, predicate, and display requirements remain but gain provider-agnostic scenarios.

## Impact

- **Backend**: `chat-backend/src/translation/` — new `providers/` folder (`translation-provider.interface.ts`, `google.provider.ts`, `mymemory.provider.ts`, `llm.provider.ts`), modified `translation.service.ts`, `translation.module.ts`, `translation.controller.ts` (no logic change, only wiring), `dto/translate.dto.ts` (unchanged), `.env.example`.
- **Tests**: `translation.service.spec.ts` extended for fallback, mock-only-when-all-missing, MyMemory/LLM branches, and timeout mapping.
- **Mobile**: No changes.
- **Infra**: No new npm dependencies (plain `fetch` for MyMemory/LLM as with Google). Env-driven — no migration.
- **Breaking**: None. Default `TRANSLATION_PROVIDER=google` preserves current API contract `POST /api/translate → {translatedText, sourceLang, cached}`.
