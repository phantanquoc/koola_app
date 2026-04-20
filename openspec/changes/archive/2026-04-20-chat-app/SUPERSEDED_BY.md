# SUPERSEDED

This umbrella change was the original Phase 1 spec for the entire chat application. It was archived on **2026-04-20** with `--skip-specs --no-validate` because its 175 tasks were progressively delivered through focused child changes rather than this umbrella. The specs within this folder are historical — **the canonical specs now live under `openspec/specs/`** and were authored/updated by the child changes below.

## Child changes that delivered this work

| Area | Delivered by |
|---|---|
| Offline queue, sync, optimistic UI | `rn-offline` (complete) |
| User search, contacts, direct conversation | `rn-contacts` (19/20) |
| Message actions (reply, forward, pin, react, delete, edit) | `chat-message-actions` (complete) |
| Media upload/presigned URLs, thumbnails, blurhash | `media-enhancement` (complete) |
| Image/file rendering fixes | `fix-media-messages` (complete) |
| REST ↔ socket broadcast consistency | `fix-rest-socket-broadcast` (complete) |
| Video messages (compression, inline playback, fullscreen) | `video-messages` (37/43, QA pending) |
| QR code contact add | `qr-scanner` (complete) |
| Phone OTP registration (Plivo + email) | `phone-otp-registration` (archived 2026-04-03) |

## What was NOT delivered here

- **Production infra on Proxmox** — still tracked in the active change `infra-setup` (status: DEFERRED). Local dev uses `infra-local/docker-compose.yml` instead.
- **End-to-end Swagger docs, health monitoring, rate-limit tuning** — partially covered by code but not formally tracked.

## Do not reference these specs

The `specs/` subfolder in this archive is frozen at the umbrella's view of the world as of 2026-03-31. Always read the current specs from `openspec/specs/<capability>/spec.md` instead.
