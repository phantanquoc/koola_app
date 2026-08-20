## ADDED Requirements

### Requirement: Peer-facing ICE URLs use the public coturn host
`TurnService` SHALL build every `stun:` and `turn:` URL it returns to clients from a single peer-facing host resolved as `COTURN_PUBLIC_HOST` when set, otherwise `COTURN_IP`, otherwise `localhost`. The internal probe host (`COTURN_INTERNAL_HOST`) SHALL NOT appear in any client-facing ICE URL. Credentials generated for TURN SHALL continue to use the shared `TURN_STATIC_SECRET` regardless of which host is advertised.

#### Scenario: Public host configured overrides COTURN_IP in client URLs
- **WHEN** the backend starts with `COTURN_PUBLIC_HOST=turn.example.com`, `COTURN_IP=192.168.1.50`, `COTURN_PORT=3478`
- **THEN** `getIceServers()` returns `stun:turn.example.com:3478` and `turn:turn.example.com:3478` entries
- **AND** no returned URL contains `192.168.1.50`, `localhost`, or the internal probe host

#### Scenario: No public host falls back to COTURN_IP
- **WHEN** `COTURN_PUBLIC_HOST` is unset or blank and `COTURN_IP=192.168.1.50`
- **THEN** `getIceServers()` returns `stun:192.168.1.50:3478` and `turn:192.168.1.50:3478`

#### Scenario: Neither host set keeps legacy localhost behaviour
- **WHEN** both `COTURN_PUBLIC_HOST` and `COTURN_IP` are unset
- **THEN** `getIceServers()` returns `stun:localhost:3478` and `turn:localhost:3478` (unchanged legacy default)
- **AND** the public STUN fallback entries remain prepended

### Requirement: Env contract documented for the host split
The backend `.env.example` SHALL document `COTURN_PUBLIC_HOST` as the peer-facing value (what mobile devices must be able to reach), distinct from `COTURN_IP`/`COTURN_INTERNAL_HOST`, following the `MINIO_PUBLIC_HOST` vs `MINIO_ENDPOINT` precedent.

#### Scenario: Documentation present
- **WHEN** a developer reads `chat-backend/.env.example`
- **THEN** `COTURN_PUBLIC_HOST` is documented with its fallback chain (`COTURN_IP` → `localhost`) and a warning that it must be reachable by both call peers
