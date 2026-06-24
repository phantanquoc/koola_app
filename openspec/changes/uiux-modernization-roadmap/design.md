## Context

APP_KOOLA is a realtime chat platform with a React Native mobile app as the primary surface and a React/Vite admin web console as the secondary surface. The mobile app already has a `Koola` UI foundation under `ChatApp/src/ui`, custom navigation and tab-dock behavior, a complex chat surface, and a Moments feature with feed, rings, viewer, composer, and music picker. The admin web app already has tokenized CSS and page-level patterns, but limited component abstraction.

The user explicitly requested that UI/UX work be planned and implemented in small batches so each change is easy to review and revert if it causes a regression. The change therefore treats incremental delivery, safety boundaries, and validation gates as part of the design rather than as after-the-fact process notes.

Key constraints from the current app:

- Chat navigation uses `freezeOnBlur` to avoid pop-back flicker; this must not be removed in UI polish work.
- `ChatComposer` intentionally uses an uncontrolled input to protect Vietnamese IME and Fabric behavior; it must not be converted to a controlled input as part of UI modernization.
- Faux-glass surfaces avoid unsafe `BlurView` usage in sensitive tab/chat surfaces; UI polish must not reintroduce `BlurView` there.
- Moments viewer/composer/music involve timers, media, audio preview, gestures, and navigation lifecycle; visual changes must avoid changing media semantics unless a specific bug is being fixed.
- Admin web should become more reusable and operationally clear without adopting a heavy enterprise UI kit by default.

## Goals / Non-Goals

**Goals:**

- Modernize the product UI/UX through small, reviewable, reversible batches.
- Strengthen mobile `Koola` primitives before applying broader screen-level polish.
- Improve Moments entry, ring, viewer, composer, and music picker UX while preserving data and media behavior.
- Improve chat composer and visible message-state clarity without changing message synchronization semantics.
- Improve admin web hierarchy, reusable primitives, and business verification trust UX.
- Add accessibility, performance, and regression gates that run at the end of each relevant batch.
- Keep implementation aligned with `openspec/ui-dna.md`: tokenized colors, `KoolaText`, `Pressable`, touch targets, Android input underline suppression, and restrained motion.

**Non-Goals:**

- No full app redesign in one pass.
- No navigation stack rewrite.
- No removal of chat `freezeOnBlur` behavior.
- No conversion of `ChatComposer` to controlled text input.
- No backend API, database schema, Socket.IO event, auth, or service semantics changes for UI polish.
- No `BlurView` reintroduction in sensitive tab dock or chat composer surfaces.
- No heavy dependency adoption or UI framework replacement without a separate decision.
- No dark mode implementation until semantic tokens and contrast expectations are agreed.
- No rewriting Moments media/audio lifecycle unless a specific defect is confirmed and scoped.

## Decisions

### Decision 1: Use incremental batch delivery instead of a broad redesign

The implementation will proceed in small batches, each with a clear scope, non-scope, risk level, and verification step. This is preferred over a broad redesign because chat, Moments, navigation, media, and admin workflows have different risk profiles and failure modes.

Alternatives considered:

- Full redesign in one pass: rejected because it is difficult to review and revert, and it increases the chance of regressions in realtime/media flows.
- Pure audit without implementation: rejected because the user asked to continue with UI changes where safe.

### Decision 2: Harden existing `Koola` primitives before adding new visual systems

The mobile design should keep using the existing `KoolaText`, `KoolaButton`, `KoolaIconButton`, `KoolaSurface`, `KoolaState`, `KoolaSkeleton`, and `KoolaTextInput` primitives. Initial foundation work should improve accessibility and platform correctness in those primitives rather than replacing them.

Alternatives considered:

- Add a third-party mobile UI kit: rejected for initial phases because it would conflict with existing app style and increase migration risk.
- Rewrite styling with NativeWind: rejected for this change because current code is StyleSheet/token based and already has a working design system.

### Decision 3: Defer new dependencies unless a batch explicitly justifies them

The initial phases should avoid new dependencies. Lightweight dependencies such as SVG icons, charts, or haptics can be considered later only when the user approves them for a specific batch.

Alternatives considered:

- Add gradient, chart, and haptic libraries immediately: rejected because the first phases can deliver safer improvements using the current stack.
- Ban all dependencies permanently: rejected because admin charts, icons, and haptics may become justified later.

### Decision 4: Start screen-level mobile polish with Moments entry before chat

Moments entry and ring polish provide visible user-facing improvement with lower risk than chat synchronization changes. Chat UX work should follow after the foundation and Moments entry are stable.

Alternatives considered:

- Start with Chat: rejected for the first screen-level batch because `ChatScreen` combines sockets, offline queue, media, navigation, and message rendering.
- Start with Admin: rejected as the first implementation target because mobile is the primary surface and the user is currently reviewing mobile UI changes.

### Decision 5: Preserve behavior and improve presentation in the first pass

For Moments, Chat, and Admin, the first pass should change presentation, copy, component boundaries, and accessibility, not service/API/data behavior.

Alternatives considered:

- Refactor services alongside UI: rejected because it mixes visual improvements with behavioral risk.
- Build new UX states before confirming current state data supports them: rejected because it can create fake states or inconsistent UI.

### Decision 6: Admin web should grow a small internal component layer

Admin web should extract reusable primitives such as page headers, panels, metric cards, status badges, table shells, empty states, and confirm dialogs from existing page patterns. This is preferred over adding a heavy enterprise framework.

Alternatives considered:

- Migrate to MUI/Ant Design: rejected for initial phases because current CSS tokens are already coherent and the admin scope does not yet require a full framework.
- Keep all patterns page-local: rejected because dashboard, users, and businesses already duplicate table, badge, empty, loading, and action patterns.

## Risks / Trade-offs

- Shared primitive change breaks many screens → Mitigate by keeping primitive changes additive, running mobile TypeScript checks, and not changing default sizes or variants unless explicitly scoped.
- Moments viewer/media polish causes audio/video lifecycle regressions → Mitigate by separating entry/ring polish from viewer/composer/music work and testing close, background, preview stop, and rapid open/close behavior.
- Chat UX polish accidentally changes message synchronization behavior → Mitigate by preserving hooks and service contracts, keeping the composer uncontrolled, and limiting first chat pass to presentation and state clarity.
- Navigation polish reintroduces flicker or tab dock crashes → Mitigate by preserving `freezeOnBlur`, route structure, and faux-glass strategy; avoid `BlurView` and perpetual animation loops in sensitive surfaces.
- Admin component extraction causes visual churn → Mitigate by extracting one primitive family at a time and preserving existing CSS token values.
- Accessibility changes alter layout unexpectedly → Mitigate by adding accessibility state/labels without changing size first, then fixing target size screen-by-screen when needed.
- New dependencies increase build risk → Mitigate by deferring dependency decisions and requiring explicit approval for each new visual dependency.
- Incremental approach takes longer than a single redesign → Accept as a trade-off because reviewability and rollback safety are primary user requirements.

## Migration Plan

1. Create the OpenSpec artifacts for the UI/UX modernization roadmap.
2. Continue implementation in small batches that map to the task list.
3. For each batch:
   - Announce scope and non-scope before editing.
   - Modify only the intended files.
   - Run the relevant verification command or explain why it was skipped.
   - Report the result and pause for review when the batch changes a user-visible surface.
4. If a batch causes a visual or behavioral regression, revert that batch only; do not roll back unrelated completed batches.
5. Archive the change only after the implemented batches and verification tasks are complete.

## Open Questions

- ~~Should later Moments ring polish use only existing flat tokens, `react-native-svg`, or a native gradient dependency?~~ **Resolved:** `react-native-svg` đã tồn tại từ trước change này (thêm ở commit c84d610, 2026-05-08), đang dùng ACTIVE cho faux-glass (MainNavigator tab dock + ChatComposer), KHÔNG phải dependency mới — không vi phạm non-goal "no new dependency". Ngoài ra: `@react-native-community/blur` đã được gỡ HẲN trong batch cuối (lý do: flash pop-back + crash removeViewAt logout; thay bằng faux-glass tĩnh vĩnh viễn).
- Should admin icon/chart work use lightweight dependencies such as `lucide-react` and `recharts`, or remain CSS-only initially?
- Should haptic feedback be introduced later for send, reaction, and story interactions?
- When should dark mode move from a prepared token direction into implementation scope?
- Which device matrix will be used for release-like mobile smoke testing: Android emulator only, physical Android, iOS simulator/device, or a combination?
