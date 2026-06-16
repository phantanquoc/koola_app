# CLAUDE.md


This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

When asked about the codebase, project structure, or to find code, always use the context-engine MCP tool (codebase-retrieval) in the root workspace first before reading individual files. Use `codebase-retrieval` instead of the Explore subagent for codebase exploration and search tasks.

When you need to read a specific file but don't know the exact line range, use the file-retrieval MCP tool instead of reading the entire file. Describe what information you need and it returns only the relevant snippets with line numbers. Use the Read tool with the returned line ranges (expanded as needed) to get current content before making edits.

System understanding and reasoning guide for AI agents working on APP_KOOLA.

> **Companion file:** [AGENTS.md](./AGENTS.md) — operational rules, commands, gotchas.
> This file is the **mental model**. AGENTS.md is the **playbook**.

---

## 🎯 What APP_KOOLA Is

A real-time chat platform built for horizontal scale from day one:

- **Mobile** (React Native 0.76) — primary client surface
- **Backend** (NestJS 11) — REST + WebSocket + media + signaling
- **Real-time layer** (Socket.IO + Redis pub/sub) — multi-instance fanout
- **Object storage** (MinIO, S3-compatible) — media files via presigned URLs
- **WebRTC signaling** (Coturn for STUN/TURN) — voice/video calls

The system is **event-driven + state-synchronized**, NOT simple request-response.

---

## 🧠 Mental Model (Read This First)

### The Three Truths

```
REST    → writes truth   (persistence, source of truth)
Socket  → syncs truth    (real-time fanout to other clients)
Mobile  → renders truth  (state holder, owns UI)
```

**Backend never pushes UI logic.** Backend emits domain events (`message.new`, `conversation.updated`) — clients decide what to render.

### Why this matters

- A message MUST be persisted via REST/service before being broadcast — never socket-only
- Mobile must reconcile socket events with REST state (offline gaps fill via `/messages/sync`)
- Multiple backend instances can serve the same conversation — Redis adapter routes events

---

## 🔄 Core Data Flow — Sending a Message

```
[1] Mobile  → apiService.post('/conversations/:id/messages')
[2] NestJS  → MessagesController → MessagesService → MongoDB write
[3] Service → ChatGateway.emit('message.new', {conversationId, payload})
[4] Gateway → Socket.IO room "conv:<id>"
[5] Redis   → @socket.io/redis-adapter fanout to other backend instances
[6] Clients → socketService listener → update local store → re-render
```

**Failure modes to anticipate:**
- Step 2 succeeds but step 3 fails → message persisted, others don't see it → `/messages/sync` recovers
- Client offline at step 6 → push notification fallback (FCM) + sync on reconnect
- Backend instance crash between 2–3 → message saved, fanout lost — sync recovers

---

## ⚙️ Architectural Principles

### 1. Stateless Backend
- No conversation state in process memory
- Socket rooms are per-instance, fanout via Redis
- Sessions are JWT (stateless) + refresh token in MongoDB
- **Implication:** Adding in-memory caches breaks horizontal scaling — use Redis instead

### 2. Strict Layer Separation
```
Controllers → HTTP boundary, DTO validation, no business logic
Services    → business logic, DB calls, emit gateway events
Gateways    → real-time only, never write to DB directly
Schemas     → Mongoose models + index definitions
```
Mixing layers = future refactor pain. If a controller calls Mongoose directly, it's wrong.

### 3. Mobile is the State Holder
- Backend doesn't know which screen the user is on
- Mobile maintains conversation lists, draft messages, read state
- Backend provides primitives (sync endpoints, events) — mobile composes UX

### 4. Append-First Data Model
- Messages: append + soft-update (status, reactions, deleted-for-me flag)
- Avoid destructive deletes — use `deletedForUsers[]`, `deletedAt`
- Why: enables sync, undo, audit, multi-device consistency

---

## 🔌 Real-Time System (Critical Subsystem)

### Socket.IO Conventions
- **Every event includes `conversationId`** — required for room scoping
- Clients join `conv:<id>` rooms on screen mount, leave on unmount
- Never `io.emit()` globally — always `to('conv:<id>').emit()`
- Payloads must be JSON-serializable, keep <10KB (large media → presigned URL reference)

### Redis Adapter (`main.ts:11`)
- Backend uses `@socket.io/redis-adapter` for pub/sub across instances
- Any event emitted server-side MUST be safe for fanout (idempotent on clients)
- Don't emit user-specific data to a conversation room — use user-scoped emit

### Why this is fragile
- Subtle bug: emitting before DB commit → race where another instance can't find the message
- Subtle bug: forgetting to leave a room → user gets events from old conversations
- Always test with at least 2 simulated clients

---

## 📡 WebRTC Signaling (High Sensitivity)

- **Separate namespace** from chat socket (`/chat` vs WebRTC namespace)
- Backend only relays SDP offers/answers/ICE candidates — never touches media stream
- Coturn handles NAT traversal (STUN/TURN)
- **Windows Docker Desktop limitation:** Coturn host networking doesn't work — test calls on Linux/WSL/Proxmox

⚠️ **Modify only when necessary.** WebRTC bugs are extremely hard to reproduce — symptoms appear minutes into a call across networks.

---

## 🗄️ Data Layer (MongoDB + Mongoose)

### Index Strategy
- Define indexes via `schema.index({ field: 1 })` in schema files
- **Never** use `index: true` on `@Prop` AND `schema.index()` for same field — duplicate warning
- Frequently queried fields need indexes: `conversationId`, `createdAt`, `senderId`, `phone`, `email`

### Schema Patterns
- Messages: append-only with status field (`sent` → `delivered` → `read`)
- Conversations: members array (denormalized for fast list queries)
- Media: separate collection, referenced by `mediaKey` in messages
- RefreshTokens: separate collection, indexed by `userId` + `tokenHash`

### What to NOT do
- Don't store binary data in Mongo — always MinIO
- Don't query without index — N+1 will silently degrade as users grow
- Don't use `populate()` heavily — prefer denormalization for hot paths

---

## 📱 Mobile App Architecture

### Auth Lifecycle (`AuthContext.tsx`)
```
App launch
  → restoreSession()
  → read refreshToken from AsyncStorage
  → POST /auth/refresh → new accessToken (in-memory only)
  → fetch /users/me → setUser
  → socket.connect(token) + webrtc.connect(token)
  → register FCM push token
```
**Never persist accessToken to AsyncStorage.** It lives in memory only — refresh token is the durable credential.

### Offline Queue (`OfflineQueueService.ts`)
- NetInfo watches connectivity
- Outbound sends queued when offline, replayed on reconnect
- Each queued action has idempotency key — backend dedupes
- **Critical:** Don't queue ephemeral events (typing, presence) — only durable writes

### Singleton Services
- `socketService`, `webrtcService`, `apiService` are module-level singletons
- They survive screen navigation but reset on logout
- AppState change (background → foreground) triggers reconnect via `AuthContext.handleAppStateChange`

---

## 🔐 Authentication & Authorization

- **Access token** — JWT, short-lived (~15min), in-memory on client
- **Refresh token** — opaque, stored in MongoDB + AsyncStorage, rotates on use
- **OTP** — phone (Plivo) + email (Nodemailer), used for registration + password reset
- **Guards** — JWT strategy via Passport, applied globally except `@Public()` routes
- **Socket auth** — JWT passed in handshake, validated by `WsAuthGuard`

**Never bypass guards.** If you add `@Public()` to a route, document why.

---

## ⚠️ High-Risk Areas

Modify with extra care — failures are silent or hard to reproduce:

| Area | Failure mode |
|------|-------------|
| `gateway/chat.gateway.ts` | Message loss, duplicate events, room leaks |
| `webrtc/webrtc.gateway.ts` | Calls fail to connect, audio one-way |
| `main.ts` Redis adapter | Multi-instance fanout breaks silently |
| `AuthContext.tsx` | Forced logout loops, stuck splash screen |
| `OfflineQueueService.ts` | Lost messages on poor network |
| Mongoose schema indexes | Slow queries appear weeks later as user base grows |

For these areas: read the file fully, check existing tests, prefer additive changes over modifications.

---

## 🧩 Adding New Features

1. **Check `openspec/specs/`** — does this capability already have a spec? If yes, extend it.
2. **Create OpenSpec proposal** for non-trivial features (`/proposal` skill)
3. **Reuse existing modules** — auth, media, gateway already solve common problems
4. **Follow patterns** — new module = controller + service + schema + DTO + module file
5. **Real-time consideration** — does this data need to sync across clients? If yes, emit gateway event
6. **Mobile parallel** — backend feature usually needs RN UI + service + store update
7. **Test at least the happy path** — `*.spec.ts` next to the service

---

## 🚫 Anti-Patterns (Never Do)

- ❌ Mixing REST and Socket logic in one handler
- ❌ Adding global mutable state in backend (use Redis)
- ❌ Emitting socket events without `conversationId` scope
- ❌ Bypassing DTO validation with raw body access
- ❌ Storing access token in AsyncStorage (security)
- ❌ Direct Mongoose calls from controllers (skips service layer)
- ❌ Adding npm dependencies without checking if existing libs solve it
- ❌ Synchronous heavy work in gateway handlers (blocks event loop)

---

## ✅ Definition of Done

A correctly implemented change:

- [ ] Follows the layer separation (controller → service → schema)
- [ ] Real-time data flows through gateway, not REST polling
- [ ] DTO validation present at HTTP boundary
- [ ] Indexes defined for new query patterns
- [ ] Mobile state updates from socket events, not REST refetch
- [ ] Lint + type-check pass on both ends
- [ ] OpenSpec change archived if proposal existed

---

## 🔗 File Relationship

| File | Role | When updated |
|------|------|-------------|
| `CLAUDE.md` (this file) | System understanding, reasoning, design principles | When architecture or core principles change |
| `AGENTS.md` | Operational rules, commands, gotchas, workflows | When commands, conventions, or known issues change |

Both are loaded into Claude's context. Read CLAUDE.md to **think correctly**, AGENTS.md to **act correctly**.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **koola_app** (10064 symbols, 16961 relationships, 289 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/koola_app/context` | Codebase overview, check index freshness |
| `gitnexus://repo/koola_app/clusters` | All functional areas |
| `gitnexus://repo/koola_app/processes` | All execution flows |
| `gitnexus://repo/koola_app/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

> UI/UX work must read `openspec/ui-dna.md` before any visual change.
