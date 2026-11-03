# Proposal

## Why

Every public media file today is served from a **presigned URL whose signature changes on every request**. Two consequences, measured from the code:

1. **No shared cache is possible.** `presignedGetObject(BUCKET, key, 3600)` signs a new query string each call (`moments.service.ts:1218` for the music picker, `:1258` for track detail, `media.service.ts` for chat media). Two users asking for the same song get two different URLs, so a CDN — or any intermediary — sees two unrelated resources and caches neither. Even the same user gets a new URL every hour.
2. **Every view is a backend request.** The picker's list presigns once per track (`Promise.all` over up to 20 rows = 20 signing operations per open), and each is a fresh signature the client cannot reuse. On a phone with a warm device cache this already hurts less, but the first view of anything public still hits MinIO through a freshly signed URL.

Public content (catalog music, story media of public-scope stories, commerce product images) does not need a signature. Private content (chat attachments, custom-audience moments) does.

## What Changes

- **Split content by audience, not by module.** A storage key is *public* when the object is reachable by anyone who has (or guesses) the key, and *private* otherwise. Public keys get a stable, unsigned URL; private keys keep presigning.
- **Public URL is deterministic**: `https://<media-host>/<bucket>/<key>` (or the CDN host when configured), with `Cache-Control: public, max-age=31536000, immutable` set on the object at upload time, not per request.
- **`immutable` is justified, not assumed** — object keys are UUID-based and content is never rewritten. The one case that violates it (replacing a track's audio) is already out of scope everywhere; a key is therefore safe to cache forever.
- **No signature, no expiry** → the client can hold a URL in the database, in a feed response, or in a notification payload without a refresh path.
- **CDN-optional**: the same URL shape works with MinIO directly (dev), with nginx in front (single host), or with a CDN (production). The backend reads one env var, `MEDIA_PUBLIC_BASE_URL`, and falls back to the current presign behaviour when unset.

## Impact

- **Backend** — a `publicUrlFor(key)` helper next to `minio-client.ts`; `moments.service` music endpoints return the stable URL for catalog audio; `media.service` keeps presigning for conversation-scoped media; upload paths set object metadata (`Content-Type`, `Cache-Control`).
- **Ops** — a bucket policy or reverse-proxy rule that serves the public prefix without signing, and (optionally) a CDN origin in front of it.
- **Clients** — they receive both shapes; nothing needs to change structurally, because a string URL is a string URL. The music picker stops re-presigning on every open.
- **Not touched** — private media stays presigned, admin music upload flow, mobile caching layer.

## Out of Scope

- Signed **cookies** or tokenised CDN URLs for private media. Private media stays on presigned URLs for now.
- Image/video transcoding, thumbnails, HLS packaging.
- Multi-region replication or origin shielding.
- Migrating existing DB rows that store full presigned URLs in text — there are none; only keys are stored (verified: search for `http` in the media-bearing schemas returns nothing).
