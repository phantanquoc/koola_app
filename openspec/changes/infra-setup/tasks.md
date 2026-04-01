## 1. Pre-flight Checklist

- [ ] 1.1 Confirm Proxmox VE version (7 or 8) and verify SSH access from your workstation to Proxmox host
- [ ] 1.2 Confirm VM3 has a **public IP** directly assigned (required for Coturn to work for external users). If behind NAT: note this is a limitation — Coturn will only work for internal network users. This must be resolved before proceeding with Coturn.
- [ ] 1.3 Check Proxmox host disk space: ensure at least 150 GB free for all VMs + MinIO data + snapshots
- [ ] 1.4 Download Ubuntu 22.04 LTS Server ISO if not already in Proxmox storage

## 2. VM1 — NestJS Backend (192.168.1.101)

- [ ] 2.1 Create VM1 in Proxmox Web UI: 2 vCPU, 4 GB RAM, 50 GB disk, Ubuntu 22.04 LTS Server ISO, bridge `vmbr0`
- [ ] 2.2 Install Ubuntu 22.04 LTS inside VM1: set hostname `chat-backend`, user `chat`, SSH server enabled
- [ ] 2.3 From Proxmox UI, assign static IP `192.168.1.101/24` with gateway (your router IP). Alternatively use DHCP reservation in Proxmox.
- [ ] 2.4 SSH to VM1: `ssh chat@192.168.1.101` ← (verify: connection successful)
- [ ] 2.5 Install Docker on VM1:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker chat
  ```
- [ ] 2.6 Log out and back in to apply docker group, then verify: `docker --version` ← (verify: Docker version displayed)
- [ ] 2.7 Create project directory: `sudo mkdir -p /opt/chat-backend && sudo chown chat:chat /opt/chat-backend`
- [ ] 2.8 Create `/opt/chat-backend/docker-compose.yml`:
  ```yaml
  version: '3.8'
  services:
    app:
      image: node:20-alpine
      container_name: chat-backend
      working_dir: /app
      volumes:
        - ./src:/app/src
      ports:
        - "3000:3000"
      environment:
        - NODE_ENV=development
        - MONGODB_URI=mongodb://192.168.1.102:27017/chat
        - REDIS_URL=redis://192.168.1.104:6379
      restart: unless-stopped
      command: sh -c "npm install && npm run start:dev"
  ```
- [ ] 2.9 Create `/opt/chat-backend/.env` (filled in later during backend deployment, but create empty file now):
  ```bash
  touch /opt/chat-backend/.env
  ```
- [ ] 2.10 Create `/opt/chat-backend/README.md` with connection info:
  ```bash
  echo "NestJS Backend - SSH: chat@192.168.1.101" > /opt/chat-backend/README.md
  ```

## 3. VM2 — MongoDB (192.168.1.102)

- [ ] 3.1 Create VM2 in Proxmox Web UI: 2 vCPU, 4 GB RAM, 100 GB disk, Ubuntu 22.04 LTS Server ISO, bridge `vmbr0`
- [ ] 3.2 Install Ubuntu 22.04 LTS inside VM2: set hostname `chat-mongodb`, user `chat`, SSH server enabled
- [ ] 3.3 Assign static IP `192.168.1.102/24` (same gateway as VM1)
- [ ] 3.4 SSH to VM2: `ssh chat@192.168.1.102` ← (verify: connection successful)
- [ ] 3.5 Install Docker on VM2: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker chat`
- [ ] 3.6 Create data directory on Proxmox host: SSH to Proxmox host shell, then:
  ```bash
  mkdir -p /mnt/pve/local-disk/data/mongodb
  ```
  (If using a different Proxmox storage name, replace `local-disk` accordingly. Check `pvesm status` for available storage.)
- [ ] 3.7 Create `/opt/chat-mongodb/docker-compose.yml`:
  ```yaml
  version: '3.8'
  services:
    mongodb:
      image: mongo:7
      container_name: chat-mongodb
      ports:
        - "27017:27017"
      volumes:
        - /mnt/pve/local-disk/data/mongodb:/data/db
      restart: unless-stopped
      # No --auth for MVP — network-level access control only
  ```
- [ ] 3.8 Start MongoDB: `cd /opt/chat-mongodb && docker-compose up -d` ← (verify: container running)
- [ ] 3.9 Test connection from VM1: SSH to VM1, then `docker run --rm mongo:7 mongosh --host 192.168.1.102 --eval "db.adminCommand('ping')"` ← (verify: `{ ok: 1 }`)

## 4. VM3 — MinIO + Coturn (192.168.1.103)

- [ ] 4.1 Create VM3 in Proxmox Web UI: 1 vCPU, 2 GB RAM, 50 GB disk, Ubuntu 22.04 LTS Server ISO, bridge `vmbr0`
- [ ] 4.2 Install Ubuntu 22.04 LTS inside VM3: set hostname `chat-storage`, user `chat`, SSH server enabled
- [ ] 4.3 Assign static IP `192.168.1.103/24` (same gateway)
- [ ] 4.4 SSH to VM3: `ssh chat@192.168.1.103` ← (verify: connection successful)
- [ ] 4.5 Install Docker on VM3: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker chat`
- [ ] 4.6 Create MinIO data directory on Proxmox host:
  ```bash
  # SSH to Proxmox host shell
  mkdir -p /mnt/pve/local-disk/data/minio
  ```
- [ ] 4.7 Generate Coturn static auth secret:
  ```bash
  # On VM3, generate a random secret
  openssl rand -base64 32
  ```
  Save the output — this is the `TURN_STATIC_SECRET` value used in Coturn config AND in NestJS `.env`.
- [ ] 4.8 Create `/opt/chat-storage/docker-compose.yml`:
  ```yaml
  version: '3.8'
  services:
    minio:
      image: minio/minio:latest
      container_name: chat-minio
      ports:
        - "9000:9000"   # API
        - "9001:9001"   # Console
      volumes:
        - /mnt/pve/local-disk/data/minio:/data
      environment:
        - MINIO_ROOT_USER=chatadmin
        - MINIO_ROOT_PASSWORD=<set-a-strong-password-here>
      restart: unless-stopped
      command: server /data --console-address ":9001"

    coturn:
      image: coturn/coturn:4
      container_name: chat-coturn
      # Coturn MUST use host networking for UDP binding
      network_mode: host
      environment:
        - TURN_STATIC_SECRET=<paste-secret-from-step-4.7>
      volumes:
        - ./turnserver.conf:/etc/coturn/turnserver.conf:ro
      restart: unless-stopped
  ```
- [ ] 4.9 Create `/opt/chat-storage/turnserver.conf`:
  ```
  listening-port=3478
  tls-listening-port=3478
  realm=192.168.1.103
  fingerprint
  lt-cred-mech
  static-auth-secret=<same-secret-as-step-4.7>
  total-quota=100
  bps-capacity=10000000
  ```
  Replace `<same-secret-as-step-4.7>` with the secret generated in step 4.7.
- [ ] 4.10 Start MinIO and Coturn: `cd /opt/chat-storage && docker-compose up -d` ← (verify: both containers running)
- [ ] 4.11 Verify MinIO: open `http://192.168.1.103:9001` in browser, login with `chatadmin` / password from step 4.8 ← (verify: MinIO console accessible)
- [ ] 4.12 In MinIO console: create a bucket named `chat-media` (click "Buckets" → "Create Bucket" → name: `chat-media`)
- [ ] 4.13 Verify Coturn STUN: from VM1, run:
  ```bash
  docker run --rm -it综艺 coturn/coturn:4 turns_ip 192.168.1.103
  ```
  Or use an online STUN test tool with IP `192.168.1.103:3478` ← (verify: STUN binding response received)

## 5. VM4 — Redis (192.168.1.104)

- [ ] 5.1 Create VM4 in Proxmox Web UI: 1 vCPU, 1 GB RAM, 10 GB disk, Ubuntu 22.04 LTS Server ISO, bridge `vmbr0`
- [ ] 5.2 Install Ubuntu 22.04 LTS inside VM4: set hostname `chat-redis`, user `chat`, SSH server enabled
- [ ] 5.3 Assign static IP `192.168.1.104/24` (same gateway)
- [ ] 5.4 SSH to VM4: `ssh chat@192.168.1.104` ← (verify: connection successful)
- [ ] 5.5 Install Docker on VM4: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker chat`
- [ ] 5.6 Create Redis data directory on Proxmox host:
  ```bash
  # SSH to Proxmox host shell
  mkdir -p /mnt/pve/local-disk/data/redis
  ```
- [ ] 5.7 Create `/opt/chat-redis/docker-compose.yml`:
  ```yaml
  version: '3.8'
  services:
    redis:
      image: redis:7-alpine
      container_name: chat-redis
      ports:
        - "6379:6379"
      volumes:
        - /mnt/pve/local-disk/data/redis:/data
      restart: unless-stopped
      command: redis-server --appendonly yes
  ```
- [ ] 5.8 Start Redis: `cd /opt/chat-redis && docker-compose up -d` ← (verify: container running)
- [ ] 5.9 Test connection from VM1: SSH to VM1, then:
  ```bash
  docker run --rm -it redis:7 redis-cli -h 192.168.1.104 -p 6379 PING
  ```
  ← (verify: returns `PONG`)

## 6. Network Verification

- [ ] 6.1 From VM1, verify connectivity to all services:
  ```bash
  ssh chat@192.168.1.101
  ping -c 1 192.168.1.102  # MongoDB
  ping -c 1 192.168.1.103  # MinIO/Coturn
  ping -c 1 192.168.1.104  # Redis
  ```
  ← (verify: all pings succeed)
- [ ] 6.2 Verify all ports reachable from VM1:
  ```bash
  nc -zv 192.168.1.102 27017  # MongoDB
  nc -zv 192.168.1.103 9000   # MinIO API
  nc -zv 192.168.1.103 9001   # MinIO Console
  nc -zv 192.168.1.104 6379   # Redis
  ```
  ← (verify: all connections succeed)

## 7. Proxmox Backup Schedule

- [ ] 7.1 In Proxmox Web UI → Datacenter → Storage → Select your storage → Edit → Enable "Content: VZ dump"
- [ ] 7.2 Create a scheduled backup job: Datacenter → Backup → Add:
  - Selection: all VMs (VM1, VM2, VM3, VM4)
  - Schedule: daily at 03:00
  - Mode: Snapshot (or Suspend if snapshot not supported)
  - Retention: keep last 7 snapshots
  - Storage: same local storage
  ← (verify: backup job appears in the list and next run time is shown)
- [ ] 7.3 Document all IPs and credentials: create `/opt/infra-inventory.md`:
  ```markdown
  # Chat App — Infrastructure Inventory

  ## VMs
  | VM   | Hostname        | IP            | vCPU | RAM |
  |------|-----------------|---------------|------|-----|
  | VM1  | chat-backend    | 192.168.1.101 | 2    | 4GB |
  | VM2  | chat-mongodb    | 192.168.1.102 | 2    | 4GB |
  | VM3  | chat-storage    | 192.168.1.103 | 1    | 2GB |
  | VM4  | chat-redis      | 192.168.1.104 | 1    | 1GB |

  ## Services
  | Service | Host         | Port  | Credentials            |
  |---------|--------------|-------|------------------------|
  | MongoDB | 192.168.1.102 | 27017 | No auth (MVP)          |
  | MinIO   | 192.168.1.103 | 9000  | chatadmin / <password> |
  | MinIO   | 192.168.1.103 | 9001  | chatadmin / <password> |
  | Redis   | 192.168.1.104 | 6379  | No auth (MVP)          |
  | Coturn  | 192.168.1.103 | 3478  | TURN_SECRET=<from-step-4.7> |

  ## Storage
  - MongoDB data: /mnt/pve/local-disk/data/mongodb (bind mount)
  - MinIO data: /mnt/pve/local-disk/data/minio (bind mount)
  - Redis data: /mnt/pve/local-disk/data/redis (bind mount)

  ## Coturn
  - Public IP: <confirm-this-IP>
  - Static auth secret: <from-step-4.7>
  ```

## 8. Critical Verification

- [ ] 8.1 **Coturn public IP check**: Confirm VM3's external/public IP address. This is the IP WebRTC clients will use. Run on VM3: `curl -s ifconfig.me` — if this returns a public IP (not 192.168.x.x), Coturn is public. If it returns a private IP, Coturn is behind NAT and will only work for internal users. ← (verify: public IP confirmed and documented)
- [ ] 8.2 **MinIO write test**: Upload a test file via MinIO console → Buckets → chat-media → Upload → choose any file → verify it appears in the file list
- [ ] 8.3 **Docker auto-restart test**: Run `docker stop chat-mongodb` on VM2, wait 5 seconds, `docker start chat-mongodb` → verify data still there
- [ ] 8.4 **Inventory doc**: Fill in all `<>` placeholders in `/opt/infra-inventory.md` (MinIO password, Coturn secret, public IP)
