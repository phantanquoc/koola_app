## Context

`merge-calls-into-chat` removed the global Calls tab and exposed per-conversation history only via `GroupInfo`/`Profile → BottomSheet` filtered by `GET /call-logs?conversationId`. Inside `ChatScreen`, the GiftedChat list is driven by `useMessagesFromDb` reading SQLite `messageRepository`; `call-logs` are never merged, so the user sees only text bubbles (screenshot with Quoc). Zalo's screenshot shows call cards interleaved with messages (missed/ended, duration, "GỌI LẠI").

## Goals / Non-Goals

**Goals:**
- Show call history inline in `ChatScreen`, merged chronologically with messages, matching Zalo card visuals (direction/status, duration, relative time, "GỌI LẠI").
- Reuse existing `GET /call-logs?conversationId` (no new backend); reuse sheet/quick-call call-back logic.

**Non-Goals:**
- No backend message creation for calls (no `Message.type=call`); no WebRTC gateway changes.
- No new global history UI; sheet remains as secondary surface.

## Decisions

### D1 — Client-side merge of two sources
**Decision:** `ChatScreen` owns merging: `messages: IMessage[]` (SQLite) + `callLogs: CallLogEntry[]` (fetch) → `timeline: (IMessage | CallCardItem)[]` sorted by `createdAt/startedAt` descending (GiftedChat newest-first). Render via `renderMessage` branching on item type; call items use `CallMessageCard`.
**Rationale:** Keeps call-log and message storage separate (call-log already server-filtered/paginated). Avoids writing synthetic messages to SQLite.
**Alternative:** BE writes `Message` for each call — rejected, touches gateway + schema + sync.

### D2 — Dedicated hook owns call-log fetching
**Decision:** `useInlineCallLogs(conversationId)` fetches `callLogsApi.getHistory({ conversationId, page:1, limit:50 })` on mount/focus/refresh, exposes `callLogs`, `loading`, `refresh`, `loadMore`. Initial limit 50 covers typical inline density without paging complexity; paging can be extended later.
**Rationale:** Isolates network concern from merge/sort; matches `ConversationCallHistorySheet` fetch pattern.
**Alternative:** Fetch inside `ChatScreen` directly — rejected, mixes concerns.

### D3 — CallMessageCard reuses sheet visuals
**Decision:** Card: white rounded bubble, status line ("Bạn bị nhỡ" red / "Cuộc gọi video đi" / "Cuộc gọi thoại đến"), duration (formatDuration), relative timestamp, phone icon, divider, "GỌI LẠI" tappable text (primary color). On press, same `webrtcService.initiateCall(otherUserId, conversationId, callType)` with settled/cleanup/timeout.
**Rationale:** Visual parity with Zalo screenshot; reuses `getStatusInfo`/`formatDuration` already proven in sheet.

### D4 — Sort key
**Decision:** Sort by `startedAt` for calls vs `createdAt` for messages, both as epoch ms, descending. When equal, messages first.
**Rationale:** Chronological interleave is what user perceives; server timestamps are source of truth.

## Risks / Trade-offs

- **Two-source staleness** → Mitigation: refresh call-logs on `useFocusEffect` and after `call_ended`/`call_missed` socket events; pull-to-refresh re-fetches.
- **Large call history (50+ calls) dominates initial fetch** → Mitigation: cap initial 50; timeline still usable; pagination can extend to "load earlier" later.
- **Group call "GỌI LẠI" ambiguous** → Mitigation: for group, call-back uses same logic as quick-call (disabled or toast "Gọi nhóm đang phát triển").

## Migration Plan

1. Add `useInlineCallLogs` + `CallMessageCard` (mobile only).
2. Update `ChatScreen` to merge and render.
3. Verify: tsc both ends, jest, manual inline cards + "GỌI LẠI" works, sheet still works.
4. Rollback: revert `ChatScreen` merge + remove two new files; no DB change.

## Open Questions

- Should inline cards be paginated via "load earlier" (fetch older call-logs when scrolling to top)? Deferred — initial 50 covers v1.
