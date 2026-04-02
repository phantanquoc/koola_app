# Chat App — Local Infrastructure Setup

## Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

## Quick Start

```bash
# 1. Copy env file
cp backend/.env.example backend/.env

# 2. (Optional) Edit backend/.env — change JWT_SECRET to a long random string

# 3. Start all services
docker compose up -d

# 4. Verify all containers are healthy
docker ps

# 5. Check logs
docker compose logs -f backend
```

## Services

| Service | Container | Internal Hostname | Port | Credentials |
|---------|-----------|-------------------|------|-------------|
| MongoDB | `chat-mongodb` | `chat-mongodb` | 27017 | No auth (MVP) |
| Redis | `chat-redis` | `chat-redis` | 6379 | No auth (MVP) |
| MinIO API | `chat-minio` | `chat-minio` | 9000 | chatadmin / changeme123 |
| MinIO Console | `chat-minio` | — | 9001 | chatadmin / changeme123 |
| Coturn (STUN/TURN) | `chat-coturn` | localhost | 3478 UDP/TCP | — |
| Backend API | `chat-backend` | `chat-backend` | 3000 | — |

## Development Modes

### Production Build (default)
```bash
docker compose up -d
```
Builds NestJS → runs compiled JS in Alpine container.

### Development (live reload)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```
Mounts source code directly — changes to `chat-backend/src` auto-reload.

## Bucket Setup
MinIO bucket `chat-media` is created automatically on first start via `storage/bucket-setup.sh`. If you need to recreate it manually:

1. Open http://localhost:9001
2. Login: `chatadmin` / `changeme123`
3. Buckets → Create Bucket → Name: `chat-media`
4. Buckets → chat-media → Access Rules → Add Rule: Prefix `*`, Access `public`

## Test Services

```bash
# MongoDB
docker exec chat-mongodb mongosh --eval "db.adminCommand('ping')"

# Redis
docker exec chat-redis redis-cli PING

# Backend API health
curl http://localhost:3000/api/health

# Swagger docs
curl http://localhost:3000/api/docs
```

## Coturn Notes

Coturn uses `network_mode: host` — it binds directly to localhost UDP/TCP port 3478.

| OS | Coturn Support |
|----|---------------|
| Linux / macOS | ✅ Fully supported |
| WSL2 + Docker Desktop | ✅ Supported |
| Windows (Docker Desktop) | ⚠️ STUN/TURN disabled locally — test calls on Proxmox |

## Reset Data

```bash
# Remove all data volumes
docker compose down -v

# Or manually
rm -rf mongodb/data redis/data storage/data
```

## Port Conflicts

If any port is already in use, change the left-side port in `docker-compose.yml`:

```yaml
# Example: change MongoDB from 27017 → 27018
ports:
  - "27018:27017"   # host:container
```

## Environment Variables

All config is in `backend/.env`. Key values for Docker:

| Variable | Docker Value |
|----------|-------------|
| `MONGODB_URI` | `mongodb://chat-mongodb:27017/chat` |
| `REDIS_URL` | `redis://chat-redis:6379` |
| `MINIO_ENDPOINT` | `chat-minio` |
| `COTURN_IP` | `localhost` |
| `TURN_STATIC_SECRET` | Must match `static-auth-secret` in `storage/turnserver.conf` |

## Stop Services

```bash
docker compose down
docker compose down -v  # also remove data volumes
```

