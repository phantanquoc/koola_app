## Why

Koola users chat with contacts across language boundaries, but the app has no way to understand a message written in an unfamiliar language. Users currently copy text into a third-party translator and back, breaking the conversation flow. A built-in translation capability — both automatic for incoming foreign-language messages and on-demand for any message — keeps users in the conversation and removes a real friction point.

## What Changes

- **Backend translation proxy**: A new isolated `TranslationModule` (NestJS) exposes `POST /api/translate` that accepts `{ text, targetLang }` and returns `{ translatedText, sourceLang, cached }`. It proxies to Google Cloud Translation v3 Basic, caches results in Redis (30-day TTL, key derived from source+target+text), and detects the source language. No business logic lives in the controller.
- **User translation settings**: The user `settings` object gains `preferredLanguage` (ISO 639-1 code) and `autoTranslateEnabled` (boolean), persisted via the existing `PUT /users/me/settings` endpoint. Defaults: `preferredLanguage = "vi"`, `autoTranslateEnabled = false`.
- **Auto-translate on receive**: When a text message arrives whose detected source language differs from the receiving user's `preferredLanguage`, and `autoTranslateEnabled` is true, and the message is not the user's own, not a system message, and has at least 3 characters of text, the app fetches and displays a translation.
- **Manual translate**: The message context menu gains a "Dịch" action for any text message, translating on demand regardless of the auto-translate setting.
- **Translation display**: The translated text renders as an italic, muted subtitle beneath the original text. The original is always visible. Tapping the subtitle collapses/expands it.
- **Mobile translation service**: A new client-side `translationService` calls the backend endpoint with an in-memory LRU cache (500 entries) so repeated texts never re-hit the network. A `useAutoTranslate` hook drives the auto-translate flow from the message read path.
- **Settings UI**: The Settings screen gains an auto-translate toggle and a preferred-language picker, persisted to AsyncStorage and synced to the backend settings endpoint.

## Capabilities

### New Capabilities
- `message-translation`: Covers the backend translation proxy endpoint, Redis caching, source-language detection, the user translation settings (`preferredLanguage`, `autoTranslateEnabled`), the auto-translate trigger rules, the manual translate action, the subtitle display component, and the mobile translation service with LRU cache.

### Modified Capabilities
- `message-context-menu`: Adds a "Dịch" (Translate) action to the long-press menu for text messages, alongside the existing Forward/Pin/Copy/Delete actions.

## Impact

- **Backend (new module)**: `chat-backend/src/translation/` — `translation.module.ts`, `translation.service.ts`, `translation.controller.ts`, `dto/translate.dto.ts`. Registered in `app.module.ts`.
- **Backend (schema)**: `chat-backend/src/users/user.schema.ts` — extend `settings` with `preferredLanguage` and `autoTranslateEnabled`. `chat-backend/src/users/users.service.ts` + settings DTO — accept the new fields on `PUT /users/me/settings`. `chat-backend/.env.example` — add `GOOGLE_TRANSLATE_API_KEY`.
- **Backend dependency**: Google Cloud Translation is reached via a plain HTTPS call (REST) to avoid a heavyweight SDK; no new npm package required. If a SDK is preferred, it must be vetted against CLAUDE.md's dependency rule.
- **Mobile (new)**: `ChatApp/src/services/translation/translationService.ts`, `ChatApp/src/services/translation/useAutoTranslate.ts`, `ChatApp/src/components/TranslatedText.tsx`.
- **Mobile (integration)**: `useMessagesFromDb.ts` (inject translation into the read path), `MessageContextMenu.tsx` (add "Dịch"), `SettingsScreen.tsx` (toggle + language picker), `asyncStorage.ts` (two new keys), `types/index.ts` (translation types).
- **Non-goals**: reply-preview translation, Moments/stories translation, offline/on-device translation, multi-language detection within a single message, translation quality feedback, and admin cost dashboards are explicitly out of scope.
