# Tasks

> **Stacking**: depends on `admin-conversations-redesign` landing first (its delta defines the detail-route requirement this change modifies). Design has no open questions blocking (see design.md Open Questions).

## 1. Audit constants (foundation for every mutation below)

- [x] 1.1 Add `unpin_message`, `restore_message`, `update_conversation_note`, `change_member_role`, `remove_member` to `ADMIN_AUDIT_ACTIONS` + Vietnamese labels in `audit-labels.ts`; verify with `npx jest src/admin` still green and `npm run lint` on touched files ← (verify: one source per DESIGN §5.2.2 — label lookup works for every new action, no `as unknown as` casts)

## 2. Backend — message restore (admin-message-moderation delta)

- [x] 2.1 `POST /admin/messages/:id/restore`: clear `deleted` only when currently deleted (idempotent no-op otherwise), audit `restore_message` ONLY on actual change, emit `message_restored` to `conversation:<conversationId>` AFTER the DB write; verify with colocated jest: state flips + emit + audit, restore-already-restored = 200 with no second audit, unknown id 404, non-admin 403 ← (verify: soft-delete → restore round-trip restores observable state and spec "Restore is idempotent" scenario)

## 3. Backend — conversation ops endpoints (admin-conversation-moderation delta)

- [x] 3.1 Optional `senderId` on `ConversationDetailDto` + `msgFilter.senderId` on `GET /admin/conversations/:id`; verify jest: filtered `recentMessages` contains only that sender, absent param unchanged
- [x] 3.2 `Conversation.internalNote` schema field (≤500) + `PATCH /admin/conversations/:id/note` (`@IsString @MaxLength(500)`, empty clears, audit `update_conversation_note` WITHOUT note body in payload); verify jest: persist/clear/400-over-500 + audit shape ← (verify: spec "Internal note update" scenario incl. empty-string clear)
- [x] 3.3 Admin unpin `DELETE /admin/conversations/:id/pin/:messageId` reusing `ConversationsService` unpin (membership rules stay in service layer), audit `unpin_message`, 404 when pin absent; verify jest
- [x] 3.4 Group membership: `POST .../members/:userId/role` (`@IsIn(['member','admin'])`) + `DELETE .../members/:userId` — direct conversation → 400, unknown/not-member target → 404, kick of last remaining member → 400, audit `change_member_role`/`remove_member`; reuse service membership mutations (thin wrapper, never duplicate membership logic in controller); verify jest covering every branch ← (verify: all four spec scenarios in admin-conversation-moderation delta; guards = controller-level JwtAuthGuard+AdminGuard inherited)
- [x] 3.5 Backend gates for groups 1–3: `cd chat-backend && npx jest src/admin && npx jest src/conversations && ./node_modules/.bin/tsc --noEmit` all pass ← (verify: `npx jest src/conversations` only required if service files were touched — otherwise note "not touched" in the task)

## 4. Frontend — message reports in place, copy fix, report links (workbench A0–A2)

- [x] 4.1 Per-message badge click → lazy `GET /admin/reports?targetType=message&targetId=<mid>&status=pending` panel + ConfirmDialog resolve/dismiss (same copy pattern as conversation-level); invalidate `['reports']`, `['conversation', id]`, `['conversations']`, `['conversations-stats']`; verify vitest: badge → dialog (0 POST before confirm) → POST → badge count refreshes; outgoing params scoped to the message
- [x] 4.2 Fix stale copy: bottom-bar note (soft-delete works on the row — replace "Mở tin nhắn để gỡ…") + soft-delete confirm copy now says reversible (pairs with restore); verify vitest asserts new strings and absence of the stale line
- [x] 4.3 "Xem báo cáo" link on pending + history report cards → `/reports/:id`; verify vitest href; run `npx vitest run src/__tests__/conversations.test.tsx` green for group 4 ← (verify: A0 flow end-to-end in test — resolve a message report from the transcript without leaving the route)

## 5. Frontend — reported jump + sender filter (workbench A4 + B2)

- [x] 5.1 Prev/next reported-message controls over `reportedMessageCounts` ∩ loaded rows (reuse `msgRowRefs` scroll); verify vitest: two reported rows → "next" activates/scrolls to the second, wraps at ends
- [x] 5.2 Sender filter select built from `members` → `senderId` in `['conversation', id, senderId]` query key + request params; clear restores; verify vitest: params carry senderId, key change refetches; run vitest file green

## 6. Frontend — unpin, internal note, member actions, restore (workbench B1 + C3 + C1 + B3)

- [x] 6.1 "Bỏ ghim" button per pin card → ConfirmDialog → admin DELETE endpoint → invalidate `['conversation', id]`; verify vitest: confirm-before-POST, card disappears after success
- [x] 6.2 Internal-note editor card (init `?? ''`, ≤500 chars, busy-guarded save) → PATCH note → toast + invalidate conversation; verify vitest: save, empty clears, over-500 blocked client-side
- [x] 6.3 Member chip restructure: identity stays a `Link`, role/kick buttons are SIBLINGS (no nested interactive) rendered only for group conversations → ConfirmDialogs → role/kick endpoints; verify vitest: direct conversation hides controls, kick dialog before POST, role change updates chip badge ← (verify: a11y — no `<button>` inside `<a>`; DOM query asserts structure)
- [x] 6.4 "Hoàn tác gỡ" on soft-deleted rows → ConfirmDialog (copy: reversible) → restore endpoint → row returns to normal + toast; verify vitest round-trip mock: restore POST + row update; run full `npx vitest run` green for groups 4–6 ← (verify: soft-delete/restore pair matches admin-message-moderation spec scenarios)

## 7. Integration verification

- [x] 7.1 Full gates: `cd admin-web && npx vitest run && npx tsc -b && npx eslint <changed files>` (0 new errors) ; `cd chat-backend && npx jest src/admin && ./node_modules/.bin/tsc --noEmit` + eslint delta ≤0 vs baseline ← (kết quả: vitest 211 pass, backend jest 269 pass, backend tsc sạch, eslint file của change sạch + delta 0. `npx tsc -b` còn **12 lỗi có sẵn** ở 9 file ngoài phạm vi — AppLayout, AuditLogDetail, UserDetail, BusinessDetailDrawer, useBusinessDecision, BusinessesPage, CommerceOrdersPage, CommerceProductsPage, structured-input.test — **0 lỗi ở file của change**)
- [x] 7.2 Browser pass on real data: badge-resolve a message report, unpin, save note, change role + kick on a seeded group (create group via existing user flow or seed), restore a deleted message; widths 1440/860 spot-check for chip restructure; 0 console errors ← (verify: every new endpoint exercised live (network panel shows audited POST/PATCH/DELETE), copy claims match behavior)
  - Kết quả: trên nhóm seed "Nhóm Dự Án Koola" — badge→panel→Giải quyết (`POST /admin/reports/:id/resolve`), Bỏ ghim (`DELETE .../pin/:messageId`), lưu ghi chú (`PATCH .../note`), đổi vai trò + mời ra (`POST .../role`, `DELETE .../members/:userId`), khôi phục tin đã gỡ (`POST /admin/messages/:id/restore`), lọc theo người gửi (4/12 tin của 1 người), nhảy tới tin bị báo cáo (0/2 → 2/2). Chip member 275–339px @1440 và @860, không tràn, `documentElement.scrollWidth` không vượt viewport. Console: 0 error (chỉ 1 issue a11y **có sẵn** ở ô tìm-trong-hội-thoại thiếu id/name).
  - Phát hiện khi chạy live: `pullPin` kiểm `modifiedCount` nên unpin-giữa-không-có-pin trả 200 thay vì 404 (schema `timestamps` bump `updatedAt` kể cả khi `$pull` không khớp) → đã sửa sang `matchedCount` + filter `pinnedMessages.messageId`, thêm test hồi quy.
  - Dữ liệu test đã dọn: xoá 3 báo cáo `test72-*`, xoá ghi chú test, khôi phục thành viên bị mời ra trong lúc kiểm thử.
- [x] 7.3 Update `admin-web/AGENTS.md` conversations row with new ops endpoints/actions; run `openspec validate admin-conversation-detail-ops` and confirm each spec scenario maps to a passing test or the manual checks in 7.2 ← (verify: validate passes; scenario↔test matrix holds for all 3 capability deltas)