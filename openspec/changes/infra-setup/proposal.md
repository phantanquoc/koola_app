## Why

The chat application requires a self-hosted backend infrastructure running on Proxmox. Before any application code can run, four virtual machines must be provisioned and configured: MongoDB for data persistence, Redis for caching and Socket.io scaling, MinIO for media file storage, Coturn for WebRTC TURN/STUN relay, and the NestJS backend itself.

## What Changes

- **VM1 — NestJS Backend**: Provision Ubuntu 22.04 VM, install Docker, deploy NestJS app via Docker Compose with nginx reverse proxy
- **VM2 — MongoDB**: Provision Ubuntu 22.04 VM, install Docker, deploy MongoDB 7 container with persistent bind-mounted storage
- **VM3 — MinIO + Coturn**: Provision Ubuntu 22.04 VM, install Docker, deploy MinIO S3-compatible storage and Coturn TURN/STUN server (both as Docker containers)
- **VM4 — Redis**: Provision Ubuntu 22.04 VM, install Docker, deploy Redis 7 container for Socket.io adapter and caching
- **Network**: All VMs configured in bridge mode (vmbr0), static IP addresses assigned, firewall rules configured
- **Storage**: MinIO data and MongoDB data bound to Proxmox host directories for persistence across container restarts
- **Backup**: Proxmox daily snapshot schedule configured for all VMs before Phase 1 go-live

## Capabilities

### New Capabilities

- `vm-provisioning`: Create and configure 4 Ubuntu 22.04 LTS VMs on Proxmox with specified vCPU/RAM/disk resources, bridge networking, and static IPs
- `docker-runtime`: Install Docker Engine on VM1, VM3, VM4; configure Docker daemon with storage driver and logging preferences
- `mongodb-deployment`: Deploy MongoDB 7 as Docker container on VM2 with bind-mounted data directory at `/var/lib/mongodb` backed by Proxmox storage; no authentication for MVP (network-level access control only)
- `redis-deployment`: Deploy Redis 7 as Docker container on VM4 with bind-mounted data directory; no authentication for MVP
- `minio-deployment`: Deploy MinIO as Docker container on VM3 with bind-mounted data directory at `/mnt/data/minio`; console on port 9001, API on port 9000; create `chat-media` bucket with public-read policy for presigned URLs
- `coturn-deployment`: Deploy Coturn STUN/TURN server as Docker container on VM3 with host networking (UDP/TCP 3478); configure static-auth-secret for TURN credential generation; verify STUN connectivity
- `infra-monitoring`: Health check script that verifies MongoDB (port 27017), Redis (6379), MinIO (9000), Coturn (3478), and NestJS (3000) are reachable; Proxmox built-in snapshot for daily backup

### Modified Capabilities

_(None — this is infrastructure provisioning, not application code)_

## Impact

- Proxmox host must have sufficient resources: ~12 vCPU, 11 GB RAM, 150+ GB disk across 4 VMs
- Coturn VM requires a public IP address for WebRTC calls to work for external users
- MinIO and MongoDB data must survive VM restarts — bind mounts to Proxmox host directories are required, not Docker named volumes
- All Docker containers use `restart: unless-stopped` for auto-recovery on VM reboot
