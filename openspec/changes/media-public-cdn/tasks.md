# Tasks

> **Scope guard**: backend `chat-backend/src/media/**` (the URL helper only) plus the two call sites that serve public content (`moments` music reads, `commerce` product reads), and ops config. Private media path, mobile app, and admin flows must not change behaviour.
>
> **Rule**: this change ships behind one env var. With `MEDIA_PUBLIC_BASE_URL` unset, delivery must be byte-identical to today. Every task keeps that invariant.

## 1. Backend: classification and URL helper

- [ ] 1.1 `media/public-prefixes.ts` — `PUBLIC_PREFIXES = ['music-catalog/', 'music/', 'commerce/']` and `isPublicKey(key)`; single source of truth, no prefix literal anywhere else; verify jest: each prefix true, `uploads/...` and `thumbnails/...` false, an empty key false, a key that merely *contains* `music/` (e.g. `uploads/music/a.jpg`) false
- [ ] 1.2 `media/public-url.ts` — `publicUrlFor(key): string | null`: returns `null` when `MEDIA_PUBLIC_BASE_URL` is empty, otherwise `${base}/${BUCKET}/${encodeSegments(key)}`; verify jest: no query string, identical across two calls, spaces and Vietnamese characters encoded per segment with `/` preserved, trailing slash on the base does not double up, `null` when the env var is absent
- [ ] 1.3 Add `MEDIA_PUBLIC_BASE_URL` to `.env.example` with a comment stating that empty means "sign as before" and that only public prefixes are served from it; verify the file reads correctly and no secret is introduced

## 2. Backend: serve public content through the helper

- [ ] 2.1 `moments.service.searchMusicTracks` and `getMusicTrackById` use `publicUrlFor` for `previewUrl`/`audioUrl`, falling back to the existing presign when it returns `null`; the list no longer performs one signing call per row; verify jest: with the env var set, a 20-track list performs **zero** `presignedGetObject` calls and every URL equals the stable URL; with it unset, the old behaviour is reproduced exactly
- [ ] 2.2 `commerce` product listing/detail/storefront/cart-validation use `publicUrlFor` for `imageUrl`/`imageUrls[]` with the same fallback; verify jest: image URLs stable across two reads, `null` when the env var is unset, and a product with no images still yields `imageUrl: null`
- [ ] 2.3 Leave every chat/story/attachment path untouched; verify `git diff --stat` shows no change under `media/media.service.ts` delivery methods, and add a regression test that a chat attachment URL still carries a signature (`X-Amz-Signature` present)

## 3. Upload metadata

- [ ] 3.1 Public uploads set `Content-Type` and `Cache-Control: public, max-age=31536000, immutable` as object metadata at upload time; this applies to the admin music PUT signing path and the commerce image path; verify jest: the recorded metadata contains both keys for a public prefix, and a private upload sets neither
- [ ] 3.2 Confirm the presigned PUT does not need a header added at request time for the metadata to exist (metadata comes from server-side copy or a signed PUT with metadata); if MinIO requires a signed header, document the required client header in the same task and prove it with one live PUT ← (verify: an uploaded object's `HEAD` shows the `Cache-Control` value)

## 3b. Prerequisite: the cleanup job must not eat public media

- [ ] 3b.1 Before pointing commerce images at a public prefix, fix the latent `MediaCleanupService` hazard: it marks every `messageId: null` upload deleted after 24h and is **currently unregistered** (`MediaModule.providers = [MediaService]`), which is the only reason product images survive. Either scope its filter to keys no product/catalog row references, or keep product images out of the `Media` collection entirely; verify jest: a product image and a catalog track key are never selected by the cleanup filter ← (verify: run the cleanup query against a seeded DB and assert the count is 0 for referenced keys)
- [ ] 3b.2 Do not register `MediaCleanupService` in any module as part of this change; if it is registered later, this task's guard test is the thing that must exist first

## 4. Ops and enforcement

- [ ] 4.1 Restrict anonymous access to public prefixes only — the serving proxy (or bucket policy in dev) SHALL allow `music-catalog/*`, `music/*`, `commerce/*` anonymously and deny everything else; write the rule in `infra-local/` and in the ops runbook; verify by fetching one object from each class: the public one succeeds without credentials, the private one is refused
- [ ] 4.2 Proxy supplies `Cache-Control` for objects that predate this change (D4) rather than a backfill script; verify response headers on an old object
- [ ] 4.3 Document `MEDIA_PUBLIC_BASE_URL` in the runbook with the three supported shapes (MinIO direct, nginx, CDN) and the rollback step ("unset the var, no deploy needed")

## 5. Security verification

- [ ] 5.1 An adversarial pass: attempt to read a chat attachment, a `connections`-scope story's media, and a `custom`-scope story's media through the public base URL by hand-constructing the path — all three SHALL fail; record the three results in the PR ← (verify: this is the whole change's risk, so it is tested rather than argued)
- [ ] 5.2 Confirm no code path can mint a public-prefixed key for user-uploaded content; grep every key-generation site and list them in the PR with their prefix (`media.service.generateMediaKey`, `generateThumbnailKey`, admin music upload, commerce image upload)

## 6. Gates

- [ ] 6.1 `cd chat-backend && npx jest src/media src/moments src/commerce && ./node_modules/.bin/tsc --noEmit` clean; `git diff --stat` shows nothing under `admin-web/**` or `ChatApp/**`
- [ ] 6.2 Measure the win honestly: count `presignedGetObject` calls for one music-picker open before (≈20) and after (0) with the env var set, and state the CDN hit-ratio only if a CDN is actually deployed — do not claim a caching benefit without a measurement
- [ ] 6.3 `openspec validate media-public-cdn --strict`
