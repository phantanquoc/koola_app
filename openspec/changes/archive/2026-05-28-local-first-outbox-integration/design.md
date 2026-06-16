## Context

Change A landed the SQLite outbox infrastructure: schema v2, `outboxRepository`, `outboxProcessor` with watchdog/backoff/dispatcher, AsyncStorage backfill, structured `[outbox]` logs. Change A's verification confirmed 197 tests passing, but `enqueue()` has zero callers in production code paths. The five mobile write methods that motivated the work — `sendMessage`, `sendMediaMessage`, `reactToMessage`, `deleteMessage`, `softDeleteForUser`, `markAsRead` — all bypass the outbox. The backend reactions endpoint is still toggle semantics, which is non-idempotent and incompatible with retry; this was tagged as a Change B blocker in Change A's design (Decision 9).

Change A's design also locked: backend has no Sentry/Datadog (verified by reading `chat-backend/package.json`), so threshold-driven soft-rollback runs on `Logger` + in-app `__DEV__` panel only.

App has not shipped Play Store / TestFlight (user-confirmed during Change A brainstorm), so the reactions BREAKING change has no external clients to coordinate.

## Goals / Non-Goals

**Goals:**
- Activate `outboxRepository.enqueue()` from all 5 mobile write paths in `useMessagesFromDb`.
- Make backend reactions idempotent so retry is safe.
- Surface dead-letter rows in the UI so users can retry or discard failed sends.
- Replace `OfflineQueueService` AsyncStorage backing with the outbox; keep public API compatible for any remaining consumers.
- Wire threshold-driven soft-rollback (2%/3%/5%) and a `__DEV__` panel showing counters and rate.

**Non-Goals:**
- Background processing (outbox stays foreground-only — Change A decision 18).
- Encryption (sqlcipher), FTS5 search, CRDT multi-device — separate changes.
- Sentry / Datadog wiring — separate change.
- Pre-logout "unsent messages" dialog — separate UX change.
- New outbox op_types (edit / pin / forward) — separate change when those features land.
- Schema changes — outbox table shape stays as Change A locked it; no migration v3.

## Decisions

### D1. Optimistic UI race when `enqueue` itself throws

**Problem**: `insertOptimistic(temp_xxx, status='pending')` runs before `enqueue`. If `enqueue` throws (DB full, malformed payload, UNIQUE conflict not caught) → the messages row exists with no outbox row backing it → user sees "sending" forever.

**Decision**: hook wraps the enqueue call in try/catch. On failure, the hook calls `messageRepository.markFailed(temp_xxx, errorJson)` so the row flips to `status='failed'` immediately, and the UI shows the dead-letter bubble. The hook does NOT swallow the error — it logs `[outbox.enqueue:error]` with the failure reason.

**Alternatives considered**:
- *Reverse order: enqueue first, then insertOptimistic.* Rejected — UI feels slow; user taps send and waits for DB write before seeing the bubble.
- *Idempotent enqueue that retries internally.* Rejected — pushes complexity into the repo; transient SQLite errors are real and the hook is the right place to know how to surface them.

### D2. `markPendingForRetry` API surface

**Problem**: User-initiated retry from the bubble UI needs to reset state cleanly. Watchdog already does pending-reset for stuck `in_flight`, but that path also keeps `retry_count` to maintain backoff history; user retry should clear it.

**Decision**: add `outboxRepository.markPendingForRetry(id)` that sets `state='pending'`, `last_error=NULL`, `retry_count=0`, `next_retry_at=NULL`, `in_flight_at=NULL`, `updated_at=now()`. This signals "user wants this tried fresh, ignore prior backoff history." The processor picks it up on next `scheduleTick` (foreground / NetInfo trigger / explicit kick).

**Alternatives considered**:
- *Reuse existing `markPending` from watchdog path.* Rejected — that one preserves `retry_count` and `last_error` for telemetry. User retry has different semantics.
- *Just delete and re-enqueue.* Rejected — loses the original `created_at` (intent ordering reference) and the `clientMessageId` already on the messages row.

### D3. Cascade reply chain on retry

**Problem**: Parent `send_message` dies → BFS marks every child `dead_letter` with `code='PARENT_FAILED'`. User retries the parent. Should children auto-resume?

**Decision**: NO. User must explicit retry each. Reasoning:
- Time gap may have made the reply context out-of-date (user's intent might have changed).
- Auto-resume hides what's actually happening; explicit retry surfaces the chain to the user.
- BFS-resume is complex to implement correctly (need to walk DOWN, not UP, and reset each child) — implementation cost not justified.

The bubble UX shows each child its own retry button. Users can also use the `__DEV__` panel for batch retry if needed.

### D4. `markAsRead` coalesce key

**Problem**: User scrolls and crosses many messages; throttled `markAsRead` calls fire frequently.

**Decision**: dedup_key = `<conversationId>` (no userId — outbox is per-device per-account). Coalesce strategy: UPSERT taking MAX of `payload.upToTimestamp`. Result: one row per conversation regardless of how many scroll events fire. Backend receives the latest position, not all intermediates.

**Alternatives considered**:
- *No coalesce.* Rejected — generates one outbox row per scroll throttle (50ms debounce on hook = ~20 rows/sec when actively scrolling).
- *Coalesce by `(conversationId, userId)`.* Same effect since outbox is per-device per-account; the userId field in payload is redundant for dedup.

### D5. Backend reactions: rename or keep method name?

**Problem**: `toggleReaction` → `setReaction` makes intent clearer, but renaming affects controller method name and may confuse code review history.

**Decision**: rename to `setReaction`. Worth the diff noise because the semantics genuinely change. Old name actively misleads future readers. Any internal callers (none found in Change A scan, will re-grep) update with the rename.

**Alternatives considered**:
- *Keep `toggleReaction` name with new semantics.* Rejected — name lies.

### D6. Soft rollback granularity: pause processor or pause specific op_types?

**Problem**: 5% dead_letter_rate triggers rollback. If only `react` is failing (e.g., backend rolled out a regression in `setReaction`), pausing all op_types blocks `send_message` too — overkill.

**Decision** for Change B: pause everything (`outboxProcessor.pause()`). Per-op-type granularity is a follow-up if needed. Reasoning:
- Simpler to reason about: one switch.
- 5% is already a disaster threshold — the whole system is in trouble, not just one op.
- Per-op pause introduces matrix of states that's hard to test correctly without real production telemetry to drive the design.

If Change B's first month of dogfooding shows per-op rollback would help, follow-up change can refine.

**Alternatives considered**:
- *Per-op-type rate computation + per-op pause.* Deferred — premature without data.
- *Hard rollback (auto-flip `LOCAL_FIRST_SQLITE` flag false).* Rejected — too aggressive; user pending data orphaned. Soft pause keeps data visible and recoverable.

### D7. `__DEV__` panel scope

**Problem**: Where does the dev panel live? Existing settings screens? New screen?

**Decision**: new `ChatApp/src/screens/dev/OutboxDevPanel.tsx`, registered in `MainNavigator` only when `__DEV__` is true. Counters + dead-letter rows list with retry/discard buttons + "Pause / Resume processor" toggle. No production-user access.

Routing entry: a hidden link in existing `__DEV__` debug section if one exists, else added to a long-press easter egg on the splash screen — confirmed during implementation.

### D8. Dead-letter UX: visual treatment

**Problem**: How obtrusive should the failed bubble be?

**Decision**:
- Failed `send_message` bubble: red 1px left border + small red text "Failed — tap to retry" below the content, no banner. Tap anywhere on bubble → retry. Long-press → Discard option in the existing message action sheet.
- Match KOOLA's existing error pattern (`koola_screen.png` shows similar muted-red error treatment in the connect screen).
- No haptic feedback on dead-letter (avoid spamming user during burst failures).

**Alternatives considered**:
- *Red banner above the conversation.* Rejected — over-prominent; user already sees the bubble.
- *Auto-retry on every conversation re-open.* Rejected — kicks the watchdog/backoff, conflicts with backoff design.

### D9. Backend BREAKING coordinated rollout

**Problem**: Backend `setReaction` + mobile `enqueue('react', ...)` are coupled. If mobile ships first with new body shape, backend still expects toggle body → reactions break. If backend ships first, old mobile clients still send toggle-style body but backend interprets as "set" → user thinks they toggled off but actually replaced with empty.

**Decision**: backend MUST merge first. Tasks order: Phase 6 (backend) before Phase 5 (hook). Both phases land in the same change so reviewers can verify the contract. Branch protection: rebase/merge only after the backend portion is on master.

### D10. Error surface for non-message ops

**Problem**: react/delete/delete_for_me/mark_read dead-letter rows have no associated UI bubble (the action target is a message that already exists). Where does the error go?

**Decision**: structured `[outbox.dead_letter:react]` (and similar) log only. No user-visible UI. Reasoning:
- These are best-effort secondary actions; the original message is intact.
- Showing a toast for every failed read receipt would be noise.
- `__DEV__` panel is the dev affordance.

If users complain later (post-launch dogfooding), follow-up change can add per-op user UI.

## Risks / Trade-offs

- **Backend BREAKING — coordinated merge required**. → Mitigation: D9, single change containing both halves; tasks.md marks Phase 6 as a hard prerequisite for Phase 5 task 5.5 (`reactToMessage` enqueue).
- **`markPendingForRetry` could mask actual broken op**. If user retries forever and op consistently 4xx-fails, dead_letter happens again, user retries again → loop. → Mitigation: error classifier already routes 4xx to terminal immediately; user retry resets to pending but next attempt re-classifies. Worst case: user discards.
- **Cascade dead_letter UX confusion**: user may not understand why child reply also failed when parent failed. → Mitigation: "Failed — tap to retry" label is per-bubble; user retries each. Acceptable for v1.
- **`__DEV__` panel could leak to production builds via misconfigured Metro env**. → Mitigation: gated by `if (__DEV__)` and not registered in `MainNavigator` outside dev. Add an explicit guard test.
- **Threshold computation is in-process only**. App restart wipes `outbox_metrics` counter window. → Mitigation: counters live in `outbox_metrics` SQLite table (persistent across restarts; Change A locked). Rate computation reads the table, not in-memory totals. Acceptable.
- **Soft-rollback when paused**: pending rows accumulate. If user does not see the `__DEV__` panel and the threshold persists, they're stuck offline-feeling. → Mitigation: pause is `__DEV__`-visible; auth re-init (logout/login) calls `resume()` automatically; dogfooding will surface real rates.

## Migration Plan

### Deploy order
1. Backend Phase 6 lands first (toggle → set semantics).
2. Mobile Phase 5 hook integration lands after.
3. Mobile Phase 7 (OfflineQueueService rewrite + AsyncStorage migration v→2 already in Change A).
4. Mobile Phase 8 (UX) and Phase 9 (telemetry) land in any order after Phase 5.

### Pre-deploy checks
- Re-grep backend codebase for callers of `toggleReaction` (Change A scan found none, re-confirm).
- Re-grep mobile codebase for callers of `useOfflineQueue` hook to ensure rewrite preserves contracts.
- Run mobile + backend test suites.

### Rollback
- Mobile-only regression: revert mobile commits (backend `setReaction` is forward-compatible — old mobile clients don't exist).
- Backend-only regression: revert backend commits, mobile already-deployed clients see 400/500 on react until backend restored. Acceptable since app pre-launch.
- Dead-letter rate >5%: `outboxProcessor.pause()` automatic; dev triages via `__DEV__` panel; investigate and fix root cause.

## Open Questions

- **Q1**: Does the existing `MessageBubble.tsx` (or whatever owns bubble render) already accept a status prop for `failed`? — Resolve in Phase 8 implementation by reading the file. If not, extend; minimal blast radius.
- **Q2**: Does `useOfflineQueue` hook still have callers? — Phase 7 task 7.1 grep first; if zero callers, delete `OfflineQueueService` instead of rewrite.
- **Q3**: Does `MainNavigator` already have a `__DEV__` debug section? — Phase 8 task 8.7 inspect; default is to add a guarded screen entry.
- **Q4**: Should processor pause persist across app restarts? — Decided NO for v1: pause is in-memory, app restart auto-resumes, watchdog handles stuck rows. Dev needs to investigate why threshold tripped during the foreground session, not after restart.
