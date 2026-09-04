# AGENTS.md

Instructions for AI agents (Claude Code, Cursor, Copilot, etc.) working in this repository.

A symlink/pointer `CLAUDE.md` can reference this file so Claude Code picks up the same rules.

---

## Project Overview

**APP_KOOLA** — A chat application monorepo with three components:

| Component | Path | Stack |
|-----------|------|-------|
| Mobile app | `ChatApp/` | React Native 0.76 + TypeScript + React Navigation |
| Backend API | `chat-backend/` | NestJS 11 + MongoDB (Mongoose) + Socket.IO |
| Admin web | `admin-web/` | Vite + React 19 + TypeScript + React Router + Axios |
| Local infra | `infra-local/` | Docker Compose: MongoDB, Redis, MinIO, Coturn |

Feature workflow is driven by **OpenSpec** (`openspec/` directory) — proposals, specs, and archived changes.

---

## Commands

### Backend (`chat-backend/`)
```bash
npm run start:dev        # NestJS watch mode, listens on :3000
npm run build            # Compile TS → dist/
npm run lint             # ESLint --fix
npm test                 # Jest (*.spec.ts)
npm run test:e2e         # E2E Jest config
```

### Admin web (`admin-web/`)
```bash
npm install              # Install dependencies (first time)
npm run dev              # Vite dev server on :5173
npm run build            # TypeScript check + production build → dist/
npm run lint             # ESLint
npm run preview          # Serve the production build locally
```

Config: copy `admin-web/.env.example` → `admin-web/.env`, set `VITE_API_URL` to the backend base URL (e.g. `http://localhost:3000`).

#### Bootstrap the first platform admin

Option A — ts-node script (from `chat-backend/`):
```bash
npx ts-node -r tsconfig-paths/register scripts/grant-admin.ts --email admin@example.com
# or by phone: --phone +84900000000
# or by MongoDB _id: --id <objectId>
```
Requires `MONGODB_URI` env var (set in `chat-backend/.env`).

Option B — mongosh one-liner (connect to your MongoDB instance):
```js
db.users.updateOne({ email: "admin@example.com" }, { $set: { isPlatformAdmin: true } })
```

The script and one-liner are idempotent — safe to re-run.

### Mobile (`ChatApp/`)
```bash
npx react-native start               # Metro bundler on :8081
npx react-native run-android         # Build + install debug APK
npm run tsc                          # tsc --noEmit
npm run lint                         # ESLint
```

### Infrastructure (`infra-local/`)
```bash
docker compose up -d                 # Start MongoDB + Redis + MinIO + Coturn
docker compose down                  # Stop
docker compose down -v               # Stop + wipe volumes (reset data)
docker ps                            # Verify containers healthy
```

### Dev environment setup (first time after clone)
```bash
# 1. Install dependencies
cd ChatApp && npm install             # postinstall creates dev-config.json from example
cd ../chat-backend && npm install
cd .. && npm install                  # root scripts (sync-dev-host, gen:limits)

# 2. Sync LAN IP (physical device on same Wi-Fi)
npm run dev:sync-host                 # Writes IP to ChatApp/dev-config.json + chat-backend/.env

# 3. Generate mobile media limits from backend source
npm run gen:limits                    # Creates ChatApp/src/services/media/__generated__/media-limits.ts

# 4. Native build (first time only — needed for react-native-config)
cd ChatApp && npx react-native run-android

# 5. Start backend
cd chat-backend && npm run start:dev  # Logs: "MinIO public URL: http://<ip>:9000"
```

### After changing Wi-Fi / network
```bash
npm run dev:sync-host                 # Re-syncs IP. Backend picks up via .env watcher (no restart).
                                      # Mobile: restart Metro (Ctrl+C → npm start) to reload dev-config.json.
```

### Emulator setup (if using emulator instead of physical device)
```bash
emulator -avd Pixel_8 &              # Launch AVD
adb reverse tcp:3000 tcp:3000        # Map backend to emulator
adb reverse tcp:8081 tcp:8081        # Map Metro to emulator
# Note: with adb reverse, dev-config.json defaults (10.0.2.2) work without sync-dev-host.
```

---

## Architecture

### Backend — NestJS modules
- **`auth/`** — JWT + refresh token, phone OTP (Plivo), email OTP (Nodemailer)
- **`users/`** — Profile, search
- **`conversations/`** — 1-1 + group, member management
- **`messages/`** — Send/list/react/delete, sync (incremental pull)
- **`media/`** — MinIO presigned URLs (upload + download direct from MinIO, not proxied)
- **`gateway/`** — Socket.IO gateway for chat events, **Redis pub/sub adapter** (`main.ts:11`) for horizontal scale
- **`webrtc/`** — WebRTC signaling over separate namespace
- **Global:** `HttpExceptionFilter` + `LoggingInterceptor` + `ValidationPipe` (whitelist + forbidNonWhitelisted)

### Mobile — React Native
- **`navigation/`** — Root → Auth/Main → tab stacks (Chats/Contacts/Settings)
- **`contexts/AuthContext.tsx`** — Session restore via refresh token, socket + webrtc singletons connect on login
- **`services/`**
  - `api/apiService.ts` — Axios with access token in-memory, auto-refresh on 401
  - `socket/socketService.ts` — Socket.IO singleton
  - `webrtc/webrtcService.ts` — WebRTC signaling singleton
  - `OfflineQueueService.ts` — Queues sends when offline, flushes on reconnect
  - `push/pushNotificationService.ts` — FCM token registration
- **`config/env.ts`** — reads `DEV_HOST`/`DEV_PORT` from `dev-config.json` (runtime, no rebuild). Prod reads from `react-native-config`.

### Data flow — sending a message
```
RN screen → apiService.post → NestJS controller → service (saves to Mongo)
                                    ↓
                              Socket.IO gateway emits to conversation room
                                    ↓
                        Redis adapter fanout → other connected clients
```

---

## OpenSpec Workflow

Feature work is tracked through spec artifacts — **do not skip this when adding features**.

```
openspec/
├── changes/
│   ├── <active-change>/        # In-progress: proposal.md, tasks.md, specs/
│   └── archive/YYYY-MM-DD-*/   # Completed changes
└── specs/
    └── <capability>/spec.md    # Current living specs
```

Available skills (invoke with `/<name>`):
- `/proposal` — create new change artifacts
- `/apply` — implement tasks from a change
- `/verify` — validate implementation matches spec
- `/archive` — finalize and move to archive
- `/autopilot` — runs proposal → apply → verify → archive autonomously

**Rule:** For non-trivial features, create a proposal first. Bug fixes and chores can skip this.

---

## Conventions

- TypeScript strict on both ends
- Backend tests: `*.spec.ts` colocated with source in `src/`
- DTOs use `class-validator` decorators (`whitelist` strips unknown props)
- Mongoose schemas define indexes via `schema.index()` — avoid `index: true` on the decorator (duplicate warning)
- Socket events: use typed payloads; include `conversationId` so Redis adapter can route
- Env: backend reads from `chat-backend/.env` (see `infra-local/backend/.env.example`)

---

## Gotchas

| Issue | Fix |
|-------|-----|
| Android build fails with `allowBackup` manifest merger error | `tools:replace="android:allowBackup"` already set in `AndroidManifest.xml` — don't remove |
| Emulator can't reach backend | Run `adb reverse tcp:3000 tcp:3000` (emulator uses default 10.0.2.2 from dev-config.example.json) |
| Login returns "Thông tin không hợp lệ" with no server response | Backend not running — start `npm run start:dev` in `chat-backend/` |
| MongoDB "Duplicate schema index" warning | Harmless, comes from `Media` schema using both `index: true` and `schema.index()` |
| Gradle build says `gradlew.bat` not recognized | Run from `ChatApp/android/` using `./gradlew.bat app:installDebug` (forward slash) |
| Coturn on Windows Docker Desktop | STUN/TURN won't work locally — test calls on Linux/WSL or Proxmox |

---

## Self-Check Before Finishing

Before declaring a task done:

- [ ] Backend: `npm run lint` + `npm test` pass
- [ ] Mobile: `npm run tsc` + `npm run lint` pass
- [ ] No new `any` types introduced without justification
- [ ] If feature touched OpenSpec change, tasks in `tasks.md` are marked complete
- [ ] No commits created unless the user explicitly asked

---

## Never Do

- **Never** modify `.env` files or commit secrets
- **Never** run `docker compose down -v` without confirming — it wipes MongoDB data
- **Never** bypass `ValidationPipe` in backend (no `@SkipValidation` hacks)
- **Never** use `find`/`grep` bash commands when `Glob`/`Grep` tools are available
- **Never** force-push to `master` without explicit request

## Context Engine — Auto Bridge (Harness Rule)

This harness has **no native MCP manager** — `.mcp.json` (`/mcp-repo/d__desktop_app_koola`) is not auto-loaded.
Context Engine runs at `http://127.0.0.1:6699`. You **MUST** load the bridge as the **first action in every new session**
before any codebase question or edit, so `codebase-retrieval` works like Claude Code per `CLAUDE.md §6-9`:

```python
exec(open("scripts/context-engine-bridge.py", encoding="utf-8").read())
ce("natural language question — e.g. How does AuthContext restore session and connect socket?")
# -> snippets with file#L, then Read the returned ranges before editing
```

If `ce()` fails with connection error, tell the user to start/restart Context Engine (tray icon → `127.0.0.1:6699` listening).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **koola_app** (11424 symbols, 19441 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

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
