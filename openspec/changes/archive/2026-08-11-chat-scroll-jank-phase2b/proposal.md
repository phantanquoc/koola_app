## Why

Scrolling the ChatScreen stutters badly on a real 120Hz device, and the cause is now measured rather than guessed. On a Xiaomi 2410DPN6CC (Android 16, 120Hz, 8.3 ms frame budget), automated-swipe measurement puts ChatScreen at **38–43 % janky frames (legacy counter)**; framestats over 112 frames shows **42/112 = 37.5 % of frames exceed the 8.3 ms budget**, with a worst frame of **135.29 ms**. The conversation list — same app, same debug build, same automated gesture — measures only **7.83–7.99 %**, and the stock Android Settings app measures **0.14 %**, so neither the device nor the app in general is at fault.

Frame-phase breakdown isolates where the time goes: **`draw→sync` costs 40.45 / 48.66 / 51.22 ms** on slow frames (dominant), `anim→trav` costs 5.31 / 5.43 / 17.76 ms (secondary), and every other phase stays under 3 ms. `draw→sync` is the Fabric shadow-tree commit window, and its cost scales with the number of native views mounted per frame. A plain text row currently builds **~17 native views** (device average 25.5 including own-message ticks and media layers) versus **~12** for a conversation-list row — roughly 2× the views producing ~5× the jank. Six of those layers render nothing at all.

The user-visible symptom matches the measurement exactly: `SplineOverScroller` logs `mFlingDistance 2208 px, mVelocity -4799` alongside 37 occurrences of `animation - last more than 100ms Jank!`, meaning fling animations are interrupted mid-flight — the list travels far less than the gesture asked for, which is precisely the reported "scrolling continuously but it barely moves".

## What Changes

- Replace GiftedChat's `Bubble` component inside `MessageItem` with a minimal view tree that drops three structurally empty layers: `View (fill+container)`, `TouchableWithoutFeedback`, and `View (inner)`.
- Mount the retry affordance (`TouchableOpacity`) and its wrapper `View` **only when the message is in the failed state**. Today both layers mount for every message with `undefined` styles, contributing nothing for the overwhelmingly common success case.
- Re-host the long-press gesture onto the row's outer wrapper. GiftedChat's `TouchableWithoutFeedback` is currently what *triggers* long-press; removing it without re-hosting would silently kill the reaction / reply / pin context menu. The screen-level callback (`ChatScreen.tsx:353`) ignores its `_context` argument and consumes only `message`, so the gesture can move safely.
- Keep GiftedChat's `MessageText` component. It owns `url` / `phone` / `email` linkification plus the `WWW_URL_PATTERN` scheme-repair and `Linking` failure fallback; hand-porting it risks silently dropping tappable links. It is publicly exported at `lib/GiftedChat/index.d.ts:301` — the same path `MessageItem` already imports `Bubble` and `Message` from — and its only context dependency (`actionSheet`) is satisfied because rows render inside `<GiftedChat>`.
- Remove the redundant `borderRadius` on `MediaImage`'s `Animated.Image`. The parent container already applies the same radius with `overflow: 'hidden'`, and the duplicate currently emits 46 `WrappingUtils: Don't know how to round that drawable` warnings on the main thread.
- Record the measured baseline and the measurement method in the spec so future work does not have to re-derive them, including the five hypotheses this investigation falsified.

Not a breaking change: every visual and interactive behavior is preserved. Only the number of native view nodes per row changes.

## Capabilities

### New Capabilities
- `chat-scroll-performance`: Per-row native view budget for the chat message list, the gfxinfo/framestats measurement method that validates it, and the recorded device baseline against which regressions are judged.

### Modified Capabilities
- `chat-message-presentation`: Bubble geometry (alignment, opposite-margin inset, minimum height) and outbound delivery-state ownership become explicit requirements rather than properties inherited implicitly from GiftedChat's `Bubble` stylesheet, because this change stops rendering that component.
- `message-context-menu`: The long-press trigger's owning layer becomes an explicit requirement, since the gesture moves off GiftedChat's internal touchable onto the row wrapper.

## Impact

**Code**
- `ChatApp/src/screens/chat/components/MessageItem.tsx` — primary change: bubble tree replacement, conditional failed-state layers, long-press re-host.
- `ChatApp/src/components/MediaImage.tsx` — remove duplicate `borderRadius` on the animated image.
- `ChatApp/src/screens/chat/components/__tests__/` — new tests for conditional failed-state mounting and long-press survival.

**Dependencies** — none added or upgraded. `react-native-gifted-chat` stays pinned at `^2.8.1`; `MessageText`, `Message`, and `Item` remain in use. No `patch-package`, no list-engine replacement.

**Type-level guard** — `MessageItemProps` is policed by `messageItemEquality.ts` through `ComparedPropKey` / `UncomparedPropKey` and `MustBeNever` assertions. Adding or removing a prop fails `tsc --noEmit` until it is declared in that ledger. This is deliberate and must not be bypassed with a cast or an index signature.

**Measurement** — validation requires the physical device `7999fd53` and the same automated gesture used for the baseline. Reaching the sub-5 % target is **not achievable on a debug build**: the already-lean conversation list still measures 7.83 % there, so 5 % sits below the dev-bundle floor. The debug-build target is therefore ≤8 % (parity with the conversation list), with sub-5 % confirmation deferred to a `perf` build whose infrastructure already exists (`dotenv.gradle` wiring, `perf` build type, `android/app/src/perf/AndroidManifest.xml`, `ChatApp/.env.perf`).

**Risk** — this touches the render path of *every* message, so a regression is broadly visible. The known trap (long-press trigger) is identified and has a verified safe re-host. Bubble geometry must be carried over exactly or bubbles will span the full screen width.
