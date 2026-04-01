# Chat App — SPX Workflow

## Overview

Mỗi module được implement theo flow chuẩn: **Plan → ff → compact → apply → compact → verify → archive**

---

## Module Checklist

| # | Module | Status | breakdown | ff | apply | verify | archive |
|---|--------|--------|----------|----|----|--------|--------|
| 1 | infra-setup | ✅ done | - | - | - | - | - |
| 2 | backend-setup | ✅ done | - | - | - | - | - |
| 3 | backend-auth | ✅ done | - | - | - | - | - |
| 4 | backend-users | ✅ done | - | - | - | - | - |
| 5 | backend-conversations | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 6 | backend-messages | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 7 | backend-media | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 8 | backend-notifications | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 9 | backend-gateway | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 10 | backend-webrtc | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 11 | backend-health | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 12 | rn-setup | ✅ done | - | - | - | - | - |
| 13 | rn-auth | ✅ done | - | - | - | - | - |
| 14 | rn-navigation | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 15 | rn-conversations | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 16 | rn-chat | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 18 | rn-offline | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 19 | rn-contacts | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 20 | rn-push | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |
| 21 | rn-call | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done | ✅ done |

---

## Per-Module Flow

### Step 1: `/spx-plan <module>/`
**Mục đích:** Explore module trước khi implement

**Thực hiện:**
1. Read `openspec/changes/chat-app/specs/<module>/spec.md`
2. Read `openspec/changes/chat-app/design.md`
3. Read existing code (check `src/` folders)
4. Tìm fog points — những thứ spec không nói rõ
5. **Ghi vào `docs/<module>-breakdown.md`:**
   - Fog points + resolution options (A/B/C)
   - Architecture decisions (locked)
   - Schema definitions
   - Edge cases table
   - Files to create
6. Nếu fog chưa resolve → hỏi user chọn option

**Output:** `docs/<module>-breakdown.md` + Zero-fog checklist passed

---

### Step 2: `/spx-ff <module>`
**Mục đích:** Tạo structured OpenSpec change với artifacts

**Thực hiện:**
1. `openspec new change "<module>"`
2. Create `proposal.md`, `design.md`, `tasks.md`
3. **Luôn kèm `/compact`** — tóm tắt ngắn gọn cho user

**Trigger compact sau ff:**
> "✅ `<module>` artifacts created. Summary: [2-3 dòng]. Files: [list]. Next: `/spx-apply <module>`"

---

### Step 3: `/spx-apply <module>`
**Mục đích:** Implement code từ tasks.md

**Thực hiện:**
1. Read breakdown + specs
2. Implement per task — mark `- [ ]` → `- [x]` ngay khi xong
3. **Milestone gate:** Sau mỗi major task group (VD: 1.x → 2.x) → run spx-verifier
4. TypeScript check: `npx tsc --noEmit`
5. Nếu dài → kèm `/compact`

**Rule:** Không implement 2 module cùng lúc trong 1 agent. Nếu muốn song song → spawn 2 separate agents.

---

### Step 4: `/spx-verify <module>`
**Mục đích:** Kiểm tra implementation

**Thực hiện:**
1. Check `docs/<module>-breakdown.md` — verify fog đã resolve đúng
2. Check specs — verify requirements đủ
3. Check edge cases — verify handle đủ
4. Check code — verify implementation khớp spec
5. Nếu fail → `/spx-apply` sửa → verify lại (loop)

---

### Step 5: `/spx-archive <module>`
**Mục đích:** Hoàn tất module, mark done trong checklist

**Thực hiện:**
1. Update checklist trong `docs/prompt.md` — mark ✅
2. `openspec archive <module>`

---

## Conventions

### Naming
- Module name: `backend-<name>` hoặc `rn-<name>` (kebab-case)
- Breakdown: `docs/<module>-breakdown.md`
- Specs: `openspec/changes/chat-app/specs/<capability>/spec.md`

### Fog Resolution Rule
```
Nếu spec không nói rõ → Ghi fog + 2-3 options (A/B/C)
→ Hỏi user chọn HOẶC tự decide nếu có "recommend"
→ Ghi vào breakdown.md
→ Không bao giờ guess mù mà implement
```

### Implement Rule
```
BE modules: Chạy song song được (nestjs-agent + react-native-agent)
RN modules: Cần tuần tự vì navigation phụ thuộc nhau
Hoặc: spawn 2 agents cùng lúc cho BE + RN riêng biệt
```

### Task Tracking
- Tasks gốc: `openspec/changes/chat-app/tasks.md`
- Update checkboxes tương ứng khi implement done
- Breakdown doc: `docs/<module>-breakdown.md` — ghi fog + resolution

---

## Architecture Principles

- NestJS: Modular monolith — 1 app, nhiều modules
- React Native: Feature-based folder structure
- MongoDB: Mongoose schemas, nest @Prop decorators
- WebSocket: Socket.io adapter, Redis for scaling
- Auth: JWT access (1h) + refresh token rotation (30d)
- File storage: MinIO S3-compatible, presigned URLs
- Push: Firebase FCM, APNs via Firebase
- WebRTC: Coturn STUN/TURN self-hosted

---

## Code Conventions

### NestJS
```typescript
// File naming
*.service.ts
*.controller.ts
*.module.ts
*.schema.ts
dto/*.dto.ts

// Decorator pattern
@Injectable()
export class XxxService

@Controller('xxx')
export class XxxController

// Error handling: NestJS built-in exceptions
throw new NotFoundException()
throw new BadRequestException()
throw new ForbiddenException()

// Schema: nestjs/mongoose decorators
@Schema()
@Prop({ required: true })
```

### React Native
```tsx
// File naming
*.tsx (components/screens)
*.ts (utils/services)

Screen: PascalCase, e.g. ConversationListScreen.tsx
Component: PascalCase, e.g. MessageBubble.tsx
Service: camelCase, e.g. apiService.ts
```

---

Last updated: 2026-04-01
