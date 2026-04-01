## ADDED Requirements

> **Implementation note**: The `offline-queue` capability requirements are defined in the parent change spec at:
> `openspec/changes/chat-app/specs/offline-queue/spec.md`
>
> This change implements all requirements defined there. The scenarios below reference that spec directly.

All requirements from `openspec/changes/chat-app/specs/offline-queue/spec.md` are implemented by this change:

- **Offline Message Queue** — queue to AsyncStorage on send when offline, retry with exponential backoff
- **Sync Missed Messages on Reconnect** — `GET /messages/sync?since=` on WebSocket reconnect
- **Local Storage for Sync State** — persist `lastSyncAt` and queue across restarts
- **Optimistic UI Updates** — immediate "sending..." feedback before server ACK
- **Connectivity Monitoring** — NetInfo drives WS lifecycle + offline banner
- **Server Message Sync Endpoint** — `GET /messages/sync` on NestJS backend
