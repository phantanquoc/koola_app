# Chat App — Local Infrastructure Setup

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Docker Compose](https://docs.docker.com/compose/install/) (comes with Docker Desktop)

## Quick Start

```bash
# 1. Copy .env file
cp backend/.env.example backend/.env

# 2. Start all services (except backend — we'll add it after NestJS is built)
cd mongodb && docker compose up -d && cd ..
cd redis && docker compose up -d && cd ..
cd storage && docker compose up -d && cd ..

# 3. Verify services are running
docker ps
```

## Services

| Service | Container | Port | Credentials |
|---------|-----------|------|-------------|
| MongoDB | `chat-mongodb` | 27017 | No auth (MVP) |
| Redis | `chat-redis` | 6379 | No auth (MVP) |
| MinIO API | `chat-minio` | 9000 | chatadmin / changeme123 |
| MinIO Console | `chat-minio` | 9001 | chatadmin / changeme123 |
| Coturn (STUN/TURN) | `chat-coturn` | 3478 UDP/TCP | N/A |

## Create MinIO Bucket

1. Open http://localhost:9001
2. Login: `chatadmin` / `changeme123`
3. Buckets → Create Bucket → Name: `chat-media`
4. Buckets → chat-media → Access Rules → Add Rule:
   - Prefix: `*`
   - Access: `public`

## Test Services

```bash
# MongoDB
docker exec chat-mongodb mongosh --eval "db.adminCommand('ping')"

# Redis
docker exec chat-redis redis-cli PING

# MinIO (S3 API)
docker exec chat-minio mc alias set local http://localhost:9000 chatadmin changeme123
docker exec chat-minio mc ls local/

# Coturn STUN (requires coturn-utils)
docker run --rm --network host coturn/coturn:4 turnutils_stunclient 127.0.0.1
```

## Coturn Notes

Coturn uses `network_mode: host` which means it binds directly to localhost UDP/TCP port 3478.

On Windows + Docker Desktop, `network_mode: host` is **not fully supported**.
Coturn will only work for Linux/macOS or WSL2 with Docker Desktop.

**For Windows local test without WSL2:**
- Coturn STUN will not work locally on Windows
- Skip Coturn for now, test it on Proxmox
- Proceed with backend + frontend development without real-time call testing

## Stop Services

```bash
docker compose -f mongodb/docker-compose.yml down
docker compose -f redis/docker-compose.yml down
docker compose -f storage/docker-compose.yml down
```

## Reset Data

```bash
# Remove all data volumes
rm -rf mongodb/data redis/data storage/data
```

## Port Conflicts

If any port is already in use:

```bash
# Find what's using port 27017
netstat -ano | findstr :27017
# or on Linux/macOS
lsof -i :27017

# Change port in docker-compose.yml, e.g.:
# ports:
#   - "27018:27017"
```
