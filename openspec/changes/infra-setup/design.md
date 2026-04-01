## Context

Self-hosted chat application infrastructure on Proxmox VE. Four VMs needed before the NestJS backend and React Native app can run. The operator is a single developer managing all provisioning manually via Proxmox Web UI and SSH — no Terraform, Ansible, or Kubernetes. All services run as Docker containers for portability and version pinning.

## Goals / Non-Goals

**Goals:**
- All 4 VMs provisioned with correct resources and accessible via SSH
- All Docker containers running and persistent across VM reboots
- MongoDB data survives container restarts via bind mounts
- MinIO accessible at `:9000`, console at `:9001`
- Coturn responding on UDP/TCP `:3478` for STUN and TURN relay
- Redis reachable at `:6379`
- NestJS backend accessible at `:3000`
- Health check confirming all services are up

**Non-Goals:**
- No Kubernetes or Docker Swarm orchestration
- No TLS/SSL termination on infrastructure level (handled by NestJS in Phase 1)
- No monitoring stack (Prometheus/Grafana) — health check script only
- No MongoDB authentication (MVP uses network-level access control)
- No CDN in front of MinIO
- No database migrations or application code deployment

## Decisions

### D1: Docker over Native Installation

**Decision**: All services (MongoDB, Redis, MinIO, Coturn, NestJS) run as Docker containers via `docker-compose`.

**Rationale**:
- Version-locked: `image: mongo:7` pins to MongoDB 7, no risk of apt upgrade changing versions
- Portable: entire stack can be reproduced on another Proxmox node
- Cleanup: `docker-compose down` removes cleanly, data survives via bind mount
- Auto-restart: `restart: unless-stopped` recovers from VM reboots without systemd configuration

**Alternatives considered**:
- Native apt install: simpler for Redis/MongoDB but harder to version-lock and remove
- Docker Swarm: adds orchestration complexity not needed for 4 VMs

### D2: Bind Mounts over Docker Named Volumes

**Decision**: All persistent data directories are bind mounts from Proxmox host directories (`/var/lib/mongodb` → host path, `/mnt/data/minio` → host path).

**Rationale**:
- Proxmox snapshots can back up host directories directly
- Data is visible and manageable from Proxmox host shell
- Easier to migrate: copy host directory to new location, update bind mount path

**Alternatives considered**:
- Docker named volumes: portable but opaque, harder to back up via Proxmox snapshot
- NFS mounts: adds NFS server dependency

### D3: Coturn + MinIO on Same VM (VM3)

**Decision**: Coturn and MinIO share VM3.

**Rationale**:
- Coturn uses almost no CPU (only processes STUN/TURN binding requests)
- MinIO CPU usage is low unless actively uploading/downloading large files
- Saves 1 VM slot (~1 vCPU, 2 GB RAM)
- Both need host networking (Coturn needs UDP port binding, MinIO needs ports 9000/9001)

**Alternatives considered**:
- Separate VMs: wastes resources, adds operational complexity

**Risk mitigated**: Coturn bandwidth usage is bounded by concurrent call count (~10 Mbps per active call). Monitor via Coturn logs.

### D4: Coturn Uses Host Networking

**Decision**: Coturn Docker container uses `network_mode: host` so it binds UDP/TCP ports directly on VM3's network interfaces.

**Rationale**:
- Coturn MUST bind to the host's public IP for STUN/TURN to work
- Docker port mapping (`-p 3478:3478`) does not work reliably for UDP
- `network_mode: host` bypasses Docker's network namespace entirely

**Constraint**: Coturn must be the only process on VM3 that uses UDP 3478.

### D5: No MongoDB Authentication (MVP)

**Decision**: MongoDB runs without `--auth` flag. Access controlled by VM2's firewall (only VM1/Vm3/VM4 IPs can connect to port 27017).

**Rationale**:
- Simpler initial setup, no connection string with credentials in NestJS `.env`
- MongoDB's wire protocol is not exposed to the internet — only VMs on the same virtual network can reach it
- Adding auth is a one-line Docker restart after adding credentials to `.env`

**Risk**: If VM2's firewall is misconfigured, MongoDB is open. Mitigation: strict firewall rules on Proxmox VE network level.

### D6: Static IPs via Proxmox DHCP Reservation

**Decision**: Assign IPs via Proxmox network config (bridge vmbr0), reserve IPs in Proxmox DHCP so they are effectively static.

**Rationale**:
- No need to manage `/etc/netplan` inside each VM
- IPs are visible in Proxmox UI
- VMs get same IP after reboot

**IP Allocation**:
```
VM1 (NestJS):  192.168.1.101
VM2 (MongoDB): 192.168.1.102
VM3 (MinIO+Coturn): 192.168.1.103
VM4 (Redis):   192.168.1.104
```

### D7: Coturn Static Auth Secret

**Decision**: Coturn configured with `static-auth-secret` in `coturn.conf`. NestJS generates TURN credentials at runtime using HMAC-SHA1 of `username:timestamp` with this secret.

**Rationale**:
- Credentials expire automatically (TTL = 1 hour, encoded in username)
- No need to store per-user TURN credentials in database
- Compatible with all WebRTC clients

**Format**:
- Username: `<timestamp>:<random>` (e.g., `1700000000:callee123`)
- Password: `HMAC-SHA1(static-auth-secret, username)` encoded as base64

### D8: Docker Compose Files per VM

**Decision**: Each VM has its own `docker-compose.yml` in a project directory (e.g., `/opt/chat-mongodb/`, `/opt/chat-minio-coturn/`).

**Rationale**:
- Single developer can manage via SSH without a config management tool
- Each VM is self-contained: `docker-compose up -d` starts everything
- Version controlled: compose files can be in a GitOps repo

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Coturn fails behind NAT (no public IP on VM3) | Medium | High | Confirm VM3 has public IP before setup; if behind NAT, use port forwarding from router |
| MinIO disk fills up (100MB+ files accumulate) | Medium | High | Monitor `/mnt/data/minio` usage; set Proxmox alert at 80% disk |
| MongoDB data loss (VM2 disk failure) | Low | Critical | Daily Proxmox snapshots + backup to external storage before Phase 1 go-live |
| Coturn host networking conflicts with other services on VM3 | Low | Medium | Coturn is the only service using UDP 3478; MinIO uses TCP only |
| Docker containers fail to start after VM reboot | Low | Medium | `restart: unless-stopped` in all compose files; verify after reboot |
| Wrong bind mount path causes data loss | Medium | High | Verify mount paths exist on Proxmox host before `docker-compose up -d` |
| Proxmox host disk fills up (all VMs share one disk) | Medium | High | Calculate storage budget: MongoDB ~20GB, MinIO ~100GB+ free space, Redis ~1GB |

## Migration Plan

**This is initial infrastructure — no migration needed. Reverse operation if rollback is needed.**

To roll back any VM:
1. `docker-compose down` inside the VM
2. Delete VM via Proxmox UI
3. Re-provision with same IP and resources

## Open Questions

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Does VM3 have a public IP directly, or is it behind NAT? | **CRITICAL** — must answer before Coturn setup | Need to confirm: if behind NAT, Coturn will only work for users on the same internal network |
| 2 | Proxmox host disk size — is there enough for MongoDB + MinIO + snapshots? | Should verify | Confirm available disk on Proxmox host before allocating MinIO bind mount |
| 3 | Proxmox version — VE 7 or VE 8? | Minor — Docker works on both | VE 8 recommended, VE 7 still supported |
| 4 | Should we use `coturn:4` or `coturn:5` Docker image? | Minor — pin to major version | Use `coturn:4` (LTS) for stability |
| 5 | Nginx reverse proxy on VM1 — needed in Phase 1? | Deferred to NestJS deployment | NestJS runs directly on `:3000` in Phase 1, no nginx until TLS is needed |
