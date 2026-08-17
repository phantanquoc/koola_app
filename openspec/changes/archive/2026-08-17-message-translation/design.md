## Context

Koola is a real-time chat platform with a NestJS backend (REST + WebSocket + MinIO + Redis), a React Native 0.76 mobile app (GiftedChat-based chat), MongoDB persistence, and a Redis adapter for multi-instance Socket.IO fanout. Text messages flow: `POST /conversations/:id/messages` → MongoDB → `ChatGateway.broadcastNewMessage` → Redis pub/sub → offline push via FCM. On mobile, `useMessagesFromDb` (SQLite-backed read path) and the legacy `useMessages` both map API objects to `IMessage` through `dbMsgToGifted()` before rendering via `MessageItem.renderBubble` → GiftedChat `MessageText`.

There is no existing translation capability — no dependency, no service, no user preference, no API integration. The following are directly relevant and already exist:

- **User settings** (`settings.notificationsEnabled`) on the User schema and `PUT /users/me/settings` (used for notification toggle). Extending `settings` with language preferences follows the established pattern.
- **Redis** via `RedisService` (`get`, `setNXEX`, `del`, `getDel`, `incrWithTTL`) backed by `ioredis` — already used for notification dedup and refresh-token rotation. Cache for translations reuses the same client.
- **Settings screen** (`SettingsScreen.tsx`) uses `KoolaText`/`Switch`/`KoolaListItem` primitives and `asyncStorage` (keys like `REFRESH_TOKEN`, `THEME`) — the language toggle/picker belongs there.
- **Message context menu** (`MessageContextMenu.tsx`) is a bottom-sheet `Modal` hosting emoji reactions and actions (Forward/Pin/Copy/Delete). The new Translate action joins that sheet.
- **Message rendering** (`MessageItem → MessageText`) is memoized and owns bubble geometry explicitly after the Phase 2B extraction — translation subtitle rendering must not break that isolation or reintroduce GiftedChat-owned geometry.

Stakeholders are end-users (cross-language conversations), the backend team (no extra in-memory state — Redis-only), and product (cost control on external translation calls). `AGENTS.md` forbids global mutable state in the backend, requires DTO validation at HTTP boundaries, and requires strict layer separation (controller → service → schema).

## Goals / Non-Goals

**Goals:**
- Proxy translations through the backend so the provider API key stays server-side, rate limiting is centralized, and results are cached once for all clients.
- Auto-translate foreign-language messages for users who opt in, and manual Translate on demand from the context menu for any text message.
- Present translations as a muted subtitle beneath the original text with the original always visible; allow tap-to-collapse/expand.
- Isolate translation concerns into dedicated services/components so future work (reply previews, Moments, offline) can reuse them.
- Keep cache hits local (Redis on backend, LRU in-memory on mobile) so repeated texts never re-hit the provider.

**Non-Goals:**
- Translation of reply previews, story/moment captions, comments, or non-text payloads.
- Offline or on-device translation (ML Kit / on-device models).
- Multi-language chunk detection inside a single message.
- Translation quality feedback, ratings, or editing.
- Admin cost dashboards or billing automation.
- Any change to the WebSocket layer beyond the settings used to decide whether a message qualifies for auto-translate.

## Decisions

### D1 — Backend proxy over on-device ML Kit

**Decision:** Translation runs server-side; the backend calls Google Cloud Translation v3 Basic REST and caches the response in Redis. Mobile never holds a provider key.

**Alternatives:** (A) `@react-native-ml-kit/translate` on-device — rejected: native rebuild, 50–80 MB model downloads, awkward language-pack lifecycle, per-device cache only, weaker quality on short chat messages. (B) Direct client-to-Google call — rejected: API key leakage, per-client rate limiting, no shared cache.

**Rationale:** Follows the project's layer separation (REST writes truth, caches go through Redis not process memory), keeps cost centralized, and yields a single cache warm path for repeated texts across the user base. Switching providers later means editing one service adapter.

### D2 — Plain HTTPS call over Google SDK

**Decision:** The translation service issues a plain `fetch`/`axios` call to `https://translation.googleapis.com/language/translate/v2` (v3 Basic is accessed the same way). No heavy SDK is added unless a follow-up opts in after vetting against `CLAUDE.md`'s dependency rule ("check if existing libs solve it").

**Rationale:** A REST call keeps the module self-contained, has no additional engine constraints, and makes the adapter surface trivial (interfaces `translate(text, targetLang)` + `detectLanguage(text)`).

### D3 — Redis cache key and TTL

**Decision:** Key `translate:{sha256(sourceLang:targetLang:text)}`, value JSON `{translatedText, sourceLang}`, TTL 30 days via `SET key value EX 2592000`.

**Rationale:** Deterministic and content-addressed (same source/target/text never pays twice across restarts and instances). 30 days matches product expectation that translations are stable; expiry bounds drift if the provider's model improves. Expensive variants (per-user or per-conversation namespaces) are deferred — the payoff only matters for user-specific glossaries, which are out of scope.

### D4 — Auto-translate trigger predicate

**Decision:** A message qualifies for auto-translate iff all of:

1. `autoTranslateEnabled === true` on the receiving user's settings,
2. `type === 'text'` and `content` is non-empty/whitespace and `content.length >= 3`,
3. `senderId !== currentUserId` and `system !== true`,
4. `detectedSourceLang !== preferredLanguage` (detected via Google `detect` call or the `detectedSourceLanguage` returned alongside `translate`).

**Alternatives:** "Translate every incoming message" — rejected: 70–80% wasted calls on same-language chats and false positives on short/gibberish text. "Per-conversation toggle" — deferred as a follow-up.

**Rationale:** Defaults to no cost and no surprise. A user who opts in in Settings and sets `preferredLanguage` only pays for genuinely foreign messages, and short-token filtering suppresses nonsense translations.

### D5 — Isolated mobile service and component

**Decision:** `ChatApp/src/services/translation/translationService.ts` owns: typed `translate(text, targetLang): Promise<TranslateResult>` against `POST /api/translate`, an in-memory LRU `Map` of 500 entries keyed by `sha256(targetLang:text)`, and timeout handling (3 s abort). `ChatApp/src/components/TranslatedText.tsx` owns subtitle rendering (italic muted `KoolaText` beneath the original, press to collapse/expand). `useAutoTranslate` is a thin hook coordinating the read path.

Integration point is `dbMsgToGifted()` in `useMessagesFromDb.ts`: it receives an optional `translation` attachment and threads it through `IMessage & Record<string, unknown>` so `MessageItem.renderBubble` can branch to `TranslatedText` without touching GiftedChat-owned geometry. The long-press menu in `MessageContextMenu.tsx` only adds one `TouchableOpacity` row.

**Rationale:** Keeps GiftedChat presentation isolation intact (Phase 2B), avoids a second source of bubble truth, and prevents translation from scattering through `MessageItem` internals. The same `translationService`/`TranslatedText` pair is reusable for reply previews and Moments later.

### D6 — Rate limiting and error policy

**Decision:**
- Backend: `ThrottlerGuard` on `POST /translate` at 30 req / 60 s per user (keyed by `userId` via `ThrottlerModule.forRoot` short window). 429 when exceeded.
- Mobile: `translationService` aborts a provider wait after 3 s (`AbortController`).
- Error rendering: any translation failure (network, 429, 5xx, timeout) is swallowed — the bubble renders the original text alone and logs a warning. For explicit manual Translate, a brief Toast "Không thể dịch, thử lại sau" is shown and the subtitle is not mounted.

**Rationale:** Mirrors the existing `ThrottlerGuard` pattern on messages (60/min) and the OfflineQueue philosophy (durable writes queue, ephemeral events don't). Never blocks render for a best-effort feature.

### D7 — Settings storage

**Decision:** Values are persisted in both places: `asyncStorage` (`AUTO_TRANSLATE`, `PREFERRED_LANGUAGE`) for immediate mobile state and `PUT /users/me/settings` for the durable server-side `settings.{preferredLanguage, autoTranslateEnabled}` that drives the predicate.

**Rationale:** Follows the existing `ThemeMode` and `notificationsEnabled` precedent: optimistic local persistence + authoritative backend write. Auto-translate decides off the fetched `settings`, so a device reinstall doesn't lose the preference.

## Risks / Trade-offs

- **Translation cost grows with chat volume** → Mitigation: Redis 30-day memoization + mobile LRU + 3-char minimum + skip-on-same-language. Large-scale monitoring (cost per 1K messages) is an Ops follow-up, not part of this change.
- **Google API key or quota misconfiguration blocks translations** → Mitigation: the feature degrades silently to original text; manual Translate shows a non-blocking Toast; the controller returns a structured 502-like signal that the service catches. No retry loop, no offline queue entry.
- **Language detection false positives on very short or mixed-language texts** → Mitigation: the ≥3-char guard, and the requirement to show original text always — even a wrong language tag cannot hide the message.
- **Language detection latency adds to an extra round-trip for auto-translate** → Mitigation: Google's `translate` response already returns `detectedSourceLanguage`, so a separate `detect` call is only needed on cache misses when a caller wants detection before deciding to translate; the hot path is a single `translate` call.
- **Bubble layout instability from subtitle insertion** → Mitigation: `TranslatedText` renders strictly below the `MessageText` host inside the bubble wrapper, uses the same width constraints, and does not touch bubble geometry; visual regression is covered by a snapshot of `MessageItem` with and without translation.
- **Cache key collision or normalized-text drift (trimming, zero-width chars)** → Mitigation: key input is `text.trim()` after NFC normalization; caller normalizes before hashing.
- **Correlation with `ThrottlerGuard` naming (`short`/`long` windows)** → Mitigation: reuse the existing `ThrottlerGuard` configuration; do not assume a global `@SkipThrottle()` without a window name disables throttling, per the Coturn/LAN caveat already documented for the throttler.

## Migration Plan

1. **Backend first:** merge `TranslationModule` + schema extension + settings DTO; deploy with `GOOGLE_TRANSLATE_API_KEY` set in the target environment's `.env` (staging/VM4). If the key is absent, the service starts but `POST /translate` returns a structured error the mobile ignores — the feature is inert, not broken.
2. **Mobile next:** ship `translationService` + `TranslatedText` + context-menu addition + Settings UI. The mobile code guards every translation call with the feature predicate, so a backend that hasn't deployed yet simply yields original-text-only rendering.
3. **Rollout:** auto-translate is `false` by default, so no user is affected until they enable it. Turning it off per-user restores the previous behavior instantly; no data migration is needed.
4. **Rollback:** delete `TranslationModule` from `app.module.ts` and revert the `settings` schema defaults — existing user documents with the two new fields are ignored safely because the fields are optional with defaults.
5. **Follow-up (out of this change):** per-conversation overrides, reply-preview reuse, Moments translation, analytics on cache hit rate and cost.

## Open Questions

- Whether product later wants provider-pluggable translation (DeepL / LibreTranslate) behind the same `TranslationService` adapter interface — out of scope for this change but the adapter boundary leaves the option open.
- Whether very long messages (>10000 chars) are truncated or chunked before translation — the spec caps input to the existing `SendMessageDto` max (10000) and the service truncates to a documented provider limit before calling the API.
