## Context

Backing out of a conversation on Android runs a hand-built, three-part choreography:

1. **Native card motion** (`MainActivity`): the conversation card is scaled to 0.92, given a
   20 dp outline radius and 16 dp elevation, then slid out with the patched
   `rns_ios_from_right_foreground_close` tween (200 ms, `decelerate_cubic`). Predictive back
   drives the same values from the gesture's progress; a cancel animates back to identity.
2. **Reveal background**: because the Chat route uses `push`, `ScreenStack.onUpdate()`
   removes the Chat Home fragment from the window for the whole conversation
   (`ScreenStack.kt:242`). `BackSnapshotController` compensates by `PixelCopy`-ing the window
   region of the `ScreenStack` when the Chat fragment is created and later assigning that
   bitmap as `ScreenStack.background`.
3. **Dock return**: `ChatScreen` acquires a tab-dock suppression on mount and releases it
   280 ms after `beforeRemove`; `CustomKoolaTabBar` reacts by fading and translating the dock
   up from 12 px.

`PixelCopy` captures composited window pixels, and the dock is a sibling drawn *above* the
`ScreenStack` (`zIndex: 20`), so the dock is baked into the bitmap. The real dock is still
suppressed when that bitmap is shown, then appears separately. Hence: two docks, two states.
The bitmap additionally freezes the conversation list at open time, and its lifetime is tied
to pop *start* (`uninstallOn` runs from `onFragmentViewCreated` of the re-attached screen)
while the real dock returns at pop *end + 280 ms* — three visible states in ~500 ms.

`Screen.isTranslucent()` (`Screen.kt:279-286`) returns `true` only for `TRANSPARENT_MODAL`
and `FORM_SHEET`, and `ScreenStack.onUpdate()` computes
`visibleBottom = wrappers.dropWhile { isTranslucent }.firstOrNull().takeUnless { it === newTop }`
before removing everything above it. A translucent Chat therefore keeps Chat Home attached.

The dock is a sibling of the whole tab screen container, not a descendant of Chat Home, so
it can never be part of the reveal surface without moving Chat above the tab navigator.

## Goals / Non-Goals

**Goals:**

- The back reveal shows live Chat Home content — correct after the conversation mutated the
  list, and free of any baked-in dock.
- Remove the snapshot subsystem entirely rather than patch around it.
- Make the dock's return start at the real end of the pop transition and drop its vertical
  travel, so it reads as one continuous motion instead of a second arrival.
- Keep the native card shrink / hold / restore behaviour byte-for-byte identical.

**Non-Goals:**

- Moving the Chat route above the tab navigator (would make the dock part of the reveal
  substrate, but requires a root-navigation restructure across all five tabs).
- Changing card geometry or the `react-native-screens` animation patch.
- Changing how the dock is styled, laid out, or suppressed by overlays/sheets.

## Decisions

### D1 — Present Chat as a translucent stack screen

Set `presentation: 'transparentModal'` on the Chat route.

Rationale: this is the only supported lever that makes `ScreenStack` keep the screen below
attached, which is what removes the need for a bitmap. `ScreenStack.adapt()`
(`ScreenStack.kt:57-61`) returns `ScreenStackFragment` for every presentation, so the route
still lives in the main window — the commit that reverted this option (`a5d5830`, 2026-10-06)
attributes the regression to a separate Dialog window, which this library version cannot
produce (`ScreenModalFragment`, the only dialog-hosted fragment, is never instantiated in the
repo). The original regression cause is therefore unknown and must be re-tested on a device.

Alternatives considered:

- *Keep `push` and paint Chat Home's content into the reveal* — impossible without keeping the
  view attached; that is exactly what `push` prevents.
- *Re-attach Chat Home into `ScreenStack.background` as a real view* — mutating the Fabric
  child tree from native code is the class of change that produces child-count desyncs; the
  existing controller deliberately avoids it.
- *Freeze the snapshot earlier (before the dock renders)* — would remove the ghost dock but
  keeps a stale list and keeps 223 lines of native bitmap lifecycle.

### D2 — Delete the snapshot subsystem instead of disabling it

Remove `BackSnapshotController.kt` and its six `MainActivity` references; move
`CARD_NATIVE_ID` onto `MainActivity`'s companion object.

Rationale: with Chat Home attached the controller has no consumer. Leaving it registered
would keep a `FragmentLifecycleCallbacks` registration and a `PixelCopy` request per
conversation for a bitmap nothing installs. `CARD_NATIVE_ID` must survive because
`findTopChatCard()` still locates the card for the shrink.

### D3 — Dock returns on `transitionEnd`, not on a timer

`ChatScreen` keeps its `beforeRemove` listener (which also informs native that the pop is
committed and starts the composer exit), but instead of scheduling the dock release at
280 ms it registers a `transitionEnd` listener and releases when `data.closing === true`. A
350 ms fallback timer covers paths where the event is not delivered.

Rationale: `NativeStackView` emits `transitionEnd` from the native screen's `onDisappear`
(`NativeStackView.native.tsx:578-584`), which for Chat fires when the 200 ms
`foreground_close` tween ends — the exact frame the card stops moving. 280 ms was a guess
tuned against a different animation; the emitted event is the real signal. The fallback keeps
the dock from staying hidden forever when the pop is interrupted or the event is dropped
(gesture cancel paths are known to skip `transitionEnd` in this library).

Alternatives considered:

- *Release on `beforeRemove` immediately* — the dock would paint over the card for the whole
  200 ms slide, covering the composer.
- *Poll `navigation.isFocused()`* — no frame-accurate signal; would reintroduce a guess.

### D4 — Fade-only dock reveal, 80 ms

`hiddenStyle` drops the `translateY` term (both the hidden 12 px offset and the reveal
`8 * (1 - reveal)` term), keeping only opacity; the `reveal` effect animates `0 → 1` over
80 ms with `Easing.out(cubic)` when un-hiding, and still snaps to `0` immediately when
hiding.

Rationale: with no translation, the dock simply becomes present at pop end — the smallest
possible second arrival. 80 ms is short enough to read as "already there" at the moment the
card clears, and long enough to avoid a hard pop. Reduced-motion is respected by the existing
`prefersReducedMotion()` gate elsewhere in the dock; the reveal duration is below the
`koolaDurations.fast` (120 ms) token, so the value is inlined with a comment rather than
added to the token set.

### D5 — Remove dead navigation options while touching the file

`cardStyle` and `detachPreviousScreen` are `@react-navigation/stack` options; neither appears
anywhere in `@react-navigation/native-stack@7` or `react-native-screens@4.16` sources, so both
were always ignored. The accompanying comment claims they prevent a Fabric child-count
desync, which is misleading — the detachment it describes is `ScreenStack.kt:242`. Removing
them keeps the file honest and avoids future readers "restoring" them.

## Risks / Trade-offs

- **Translucent presentation regresses header, keyboard or safe-area handling** → The 2026-10-06
  revert cites exactly this. Cause is unverified for this library version, so device
  verification is mandatory before the change is considered done (tasks 6.x). Rollback is a
  single line: drop `presentation` from the Chat route. If that rollback is taken, the
  snapshot subsystem must be restored as well, and the dock fixes (D3, D4) stay valid.
- **Predictive back behaves differently under a translucent screen** → The shrink is applied to
  the `nativeID="chat-screen-card"` view inside the top screen, which the translucent
  presentation does not change. Verify gesture hold, release and cancel on device.
- **Chat Home now renders during the conversation** (it was detached before) → extra live
  work under the chat card: socket-driven list updates re-render a screen nobody sees. The
  list is already `React.memo`-bounded and the dock/header chrome are static; verify frame
  health with the perf build during a busy conversation.
- **Live Chat Home invalidates the "frozen frame" assumption elsewhere** → nothing else depends
  on the snapshot, but the `screenListeners.focus` handler now fires for Chat Home on every
  pop of any Chat-stack route (it already did). No change expected.
- **Dock fade timing is device-tuned guesswork at 80 ms** → It is bounded by the pop end, so the
  worst case is a slightly softer or harder appearance, not a desync. Adjustable in one place.
- **Removing `detachPreviousScreen` looks like a behaviour change** → It was inert; the diff
  removes a no-op and its comment. No runtime effect, verified by the absence of the key in
  the installed navigator/screens packages.

## Migration Plan

No data or API migration. The change ships in one mobile build:

1. Land the TypeScript + Kotlin edits together — the Kotlin deletion and the presentation
   change are coupled (deleting the snapshot without the translucent presentation would leave
   the reveal surface empty).
2. Rollback: restore `presentation` removal **and** re-add the snapshot subsystem together;
   the dock-timing changes (D3/D4) are independent and can stay.
3. No feature flag: the coupling above makes a partial rollout worse than a full one.

## Open Questions

- Does the translucent presentation change the status-bar icon colour handling
  (`statusBarStyle` on the Chat route) on Android 15? Resolve during device verification
  (task 6.4); if it does, pin the style on the Chat route explicitly.
