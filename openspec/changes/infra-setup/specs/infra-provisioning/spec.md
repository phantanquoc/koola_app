## ADDED Requirements

### Requirement: VM1 — NestJS Backend
The NestJS backend VM SHALL be provisioned with Ubuntu 22.04 LTS, 2 vCPU, 4 GB RAM, 50 GB disk, connected to bridge vmbr0 with static IP 192.168.1.101.

#### Scenario: VM1 accessible via SSH
- **WHEN** operator runs `ssh chat@192.168.1.101`
- **THEN** SSH connection is established to VM1

#### Scenario: Docker installed on VM1
- **WHEN** operator runs `docker --version`
- **THEN** Docker version is displayed (e.g., Docker version 24.x)

#### Scenario: NestJS container running
- **WHEN** operator runs `docker ps` on VM1
- **THEN** a container named `chat-backend` is running on port 3000

### Requirement: VM2 — MongoDB
MongoDB VM SHALL be provisioned with Ubuntu 22.04 LTS, 2 vCPU, 4 GB RAM, 100 GB disk, static IP 192.168.1.102, MongoDB 7 accessible on port 27017.

#### Scenario: MongoDB container running
- **WHEN** operator runs `docker ps` on VM2
- **THEN** a container named `chat-mongodb` is running

#### Scenario: MongoDB accepts connections from VM1
- **WHEN** `mongosh --host 192.168.1.102` is run from VM1
- **THEN** MongoDB shell connects to MongoDB instance

#### Scenario: MongoDB data persists across container restart
- **WHEN** operator runs `docker restart chat-mongodb` on VM2
- **THEN** existing data in MongoDB is still present after container restarts

### Requirement: VM3 — MinIO + Coturn
MinIO and Coturn VM SHALL be provisioned with Ubuntu 22.04 LTS, 1 vCPU, 2 GB RAM, static IP 192.168.1.103, Coturn using host networking to bind UDP/TCP 3478.

#### Scenario: MinIO API accessible
- **WHEN** operator opens `http://192.168.1.103:9000` in browser
- **THEN** MinIO browser login page is displayed

#### Scenario: MinIO console accessible
- **WHEN** operator opens `http://192.168.1.103:9001` in browser
- **THEN** MinIO console login page is displayed with credentials set in environment

#### Scenario: MinIO `chat-media` bucket created
- **WHEN** operator logs into MinIO console
- **THEN** a bucket named `chat-media` exists

#### Scenario: Coturn STUN responding
- **WHEN** `nc -u -v 192.168.1.103 3478` receives a STUN binding request
- **THEN** Coturn responds with a XOR-MAPPED-ADDRESS

#### Scenario: Coturn TURN credentials valid
- **WHEN** a WebRTC client uses TURN credentials generated with the static-auth-secret
- **THEN** Coturn accepts the credentials and relays traffic

### Requirement: VM4 — Redis
Redis VM SHALL be provisioned with Ubuntu 22.04 LTS, 1 vCPU, 1 GB RAM, static IP 192.168.1.104, Redis accessible on port 6379.

#### Scenario: Redis accepts connections
- **WHEN** `redis-cli -h 192.168.1.104 -p 6379 PING` is run from VM1
- **THEN** Redis returns `PONG`

### Requirement: Network Connectivity
All VMs SHALL be mutually reachable on the private network.

#### Scenario: All VMs reachable from VM1
- **WHEN** `ping -c 1 192.168.1.102`, `ping -c 1 192.168.1.103`, `ping -c 1 192.168.1.104` are run from VM1
- **THEN** all ping requests return successfully

### Requirement: Docker Auto-Start
All Docker containers SHALL restart automatically after VM reboot.

#### Scenario: Container survives VM reboot
- **WHEN** operator reboots a VM (e.g., `sudo reboot`)
- **THEN** Docker daemon starts containers with `restart: unless-stopped` after VM comes back online
