## 1. Provider abstraction and wiring

- [x] 1.1 Create `chat-backend/src/translation/providers/translation-provider.interface.ts` with `TranslationProvider { name, isConfigured(): boolean, translate(text, targetLang): Promise<{translatedText, sourceLang}> }`
- [x] 1.2 Extract current Google REST logic into `chat-backend/src/translation/providers/google.provider.ts` implementing the interface (plain `fetch`, 3s `AbortController`, `isConfigured()` checks `GOOGLE_TRANSLATE_API_KEY`)
- [x] 1.3 Update `chat-backend/src/translation/translation.module.ts` to provide `GoogleProvider` and wire it via a factory that selects the primary provider from `TRANSLATION_PROVIDER` env (default `google`)
- [x] 1.4 Add `TRANSLATION_PROVIDER`, `MYMEMORY_EMAIL`, `ANTHROPIC_API_KEY` (optional) to `chat-backend/.env.example` with documentation

## 2. MyMemory fallback provider

- [x] 2.1 Create `chat-backend/src/translation/providers/mymemory.provider.ts` implementing `TranslationProvider` via `GET https://api.mymemory.translated.net/get?q=&langpair=|&de=` with 3s timeout and JSON parsing of `responseData.translatedText`
- [x] 2.2 Update `chat-backend/src/translation/translation.service.ts` to keep cache/key/normalization/timeout ownership and to fallback once: Google retriable failure (429/502/timeout) → MyMemory when `isConfigured()` true, before throwing `BAD_GATEWAY`
- [x] 2.3 Preserve mock fallback: when all providers report `!isConfigured()` on a cache miss, return `[targetLang] normalizedText` with `sourceLang:auto` and cache it (dev path)

## 3. LLM premium provider (stub, gated)

- [x] 3.1 Create `chat-backend/src/translation/providers/llm.provider.ts` implementing `TranslationProvider` with fixed prompt `Translate to {targetLang}, return JSON {translatedText, sourceLang}` via `fetch` to Anthropic/OpenAI, gated by `TRANSLATION_LLM_ENABLED=true` (or future entitlement) and `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`
- [x] 3.2 Wire LLM into the provider selection chain (`llm` → Google → MyMemory → mock) and ensure `isConfigured()` is false when gate or key is missing

## 4. Tests and verification

- [x] 4.1 Extend `chat-backend/src/translation/translation.service.spec.ts`: Google hit/miss/TTL still pass; Google 429 → MyMemory success; both fail → 502; `TRANSLATION_PROVIDER=mymemory` direct path; LLM gated/ungated; mock only when all unconfigured; cache still provider-agnostic
- [x] 4.2 Run `npx tsc --noEmit` in `chat-backend` and `npx jest --testPathPattern=translation` green ← (verify: provider abstraction, single fallback, LLM gate, mock condition, cache/TTL, timeout mapping, and rate-limit guard all covered)
