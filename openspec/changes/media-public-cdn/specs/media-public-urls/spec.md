## Purpose

A stable, unsigned URL for **public** media objects — catalog music, product images — so that browsers, proxies, and CDNs can cache them, while private media keeps its signed, membership-checked path. The distinction is carried by the storage prefix, not by the calling module.

## ADDED Requirements

### Requirement: Public content is identified by storage prefix

The system SHALL classify an object as public only when its key begins with a configured public prefix (`music-catalog/`, `music/`, `commerce/`), and SHALL treat every other key as private.

#### Scenario: Public prefix resolves to a public classification

- **WHEN** the system is asked for the delivery URL of `music-catalog/9f2c…​.mp3`
- **THEN** it SHALL classify the object as public

#### Scenario: Unknown prefix is private

- **WHEN** the system is asked for the delivery URL of `uploads/<userId>/<uuid>.jpg`
- **THEN** it SHALL classify the object as private and SHALL NOT produce an unsigned URL for it

#### Scenario: Private classification does not depend on the database

- **WHEN** a key has no `Media` row yet
- **THEN** its classification SHALL still follow the prefix rule, so delivery never depends on a document existing

### Requirement: Public delivery uses a stable unsigned URL

For a public key the system SHALL return `${MEDIA_PUBLIC_BASE_URL}/${bucket}/${key}`, identical for every caller and every request, with each path segment URI-encoded and `/` preserved.

#### Scenario: Same key yields the same URL twice

- **WHEN** two clients request playback for the same public track one hour apart
- **THEN** both SHALL receive the identical URL string, with no query string and no signature

#### Scenario: Base URL is configurable and may point anywhere

- **WHEN** `MEDIA_PUBLIC_BASE_URL` is set to a CDN origin, a reverse proxy, or a MinIO endpoint
- **THEN** the produced URL SHALL use that origin with the same path shape

#### Scenario: Missing configuration falls back to signing

- **WHEN** `MEDIA_PUBLIC_BASE_URL` is unset or empty
- **THEN** public keys SHALL be delivered with the existing presigned URL and no error SHALL be raised, so the change can ship before the CDN exists

#### Scenario: Non-ASCII and space characters in a key are encoded

- **WHEN** a public key contains spaces or non-ASCII characters
- **THEN** the produced URL SHALL encode each segment and SHALL remain fetchable

### Requirement: Public objects carry immutable cache metadata

Public objects SHALL be served with `Cache-Control: public, max-age=31536000, immutable` and the correct `Content-Type`, and this SHALL NOT be expressed by adding headers to a signed request.

#### Scenario: Metadata rides on the object or the proxy

- **WHEN** a public object is uploaded
- **THEN** the upload SHALL set its `Cache-Control` and `Content-Type` as object metadata, and when an older object lacks that metadata the serving proxy SHALL supply the header instead

#### Scenario: No header is added to a signed URL

- **WHEN** any delivery URL is generated
- **THEN** the system SHALL NOT attach `Cache-Control` or other unrequested headers to a presigned request, because that invalidates the signature

#### Scenario: Immutability is justified by keys never being overwritten

- **WHEN** content for a public key must change
- **THEN** the change SHALL use a new key, and no flow SHALL overwrite the bytes of an existing public key

### Requirement: Private media keeps its signed, checked path

Private media SHALL continue to require presigning plus the existing membership check, and SHALL NOT become reachable through the public base URL.

#### Scenario: Chat attachment stays private

- **WHEN** a client requests a chat attachment
- **THEN** the response SHALL be a short-lived presigned URL and access SHALL be refused to a non-member

#### Scenario: Public base URL does not bypass authorization

- **WHEN** a client constructs `MEDIA_PUBLIC_BASE_URL` + a private key by hand
- **THEN** the object SHALL NOT be readable anonymously, because the public-serving path SHALL be restricted to public prefixes

#### Scenario: Time-bounded content stays signed

- **WHEN** media belongs to a story, including a public-scope story
- **THEN** it SHALL be delivered by a presigned URL, because the content expires after 24 hours and an unsigned URL would outlive it permanently

### Requirement: Callers receive the stable URL without changing their contract

Endpoints that already return a playback URL SHALL keep the same field name and type, substituting the stable URL when the object is public.

#### Scenario: Music endpoints return the stable URL

- **WHEN** a client reads `GET /moments/music-tracks` or `GET /moments/music-tracks/:id`
- **THEN** `previewUrl` and `audioUrl` SHALL be the stable public URL for the track's key, and the list SHALL no longer perform one signing operation per row

#### Scenario: Product images return the stable URL

- **WHEN** a client reads a product listing or detail
- **THEN** `imageUrl` / `imageUrls[]` SHALL be stable public URLs for the product's image keys

#### Scenario: Client expiry-retry code becomes a no-op, not a bug

- **WHEN** a client's existing "URL expired, refetch" path runs against a stable URL
- **THEN** the refetch SHALL return the same URL and playback SHALL continue; no client change SHALL be required for this to be safe
