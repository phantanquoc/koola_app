## 1. Chat route presentation

- [x] 1.1 In `ChatApp/src/navigation/ChatTabStack.tsx`, add `presentation: 'transparentModal'` to the Chat route options, with a comment stating that it keeps the Chat Home screen attached so the back reveal is live and that the card shrink targets `nativeID="chat-screen-card"`.
- [x] 1.2 Remove the dead `cardStyle` and `detachPreviousScreen` spreads (and their comments) from both `screenOptions` and the Chat route options — neither key exists in `@react-navigation/native-stack@7` / `react-native-screens@4.16`; the `detachPreviousScreen` comment describes behaviour actually caused by `ScreenStack.onUpdate()`.
- [x] 1.3 Correct the `focusedRouteName` comment block that claims the Chat screen runs with `freezeOnBlur: true`, since the route sets `false`.
- [x] 1.4 Confirm `contentStyle: { backgroundColor: 'transparent' }` remains on the Chat route so the screen does not paint an opaque card over Chat Home. ← (verify: no `cardStyle`/`detachPreviousScreen`/`freezeOnBlur: true` text remains anywhere in the file; `presentation` and `contentStyle` both present on the Chat route; no other route in the file changed)

## 2. Delete the Android back-snapshot subsystem

- [x] 2.1 Delete `ChatApp/android/app/src/main/java/com/chatapp/BackSnapshotController.kt`.
- [x] 2.2 In `MainActivity.kt`, remove the `snapshots` field, the `BackSnapshotController(this)` construction, `snapshots.register()` in `onCreate`, and the guarded `snapshots.unregister()` in `onDestroy`.
- [x] 2.3 In `MainActivity.kt`, remove the three snapshot calls: `snapshots.install(card)` in `onGestureStarted`, `snapshots.install(card)` in `startQuickShrink`, and `snapshots.uninstall(card)` in `clearCard`.
- [x] 2.4 In `MainActivity.kt`, replace `private const val NATIVE_ID = BackSnapshotController.CARD_NATIVE_ID` with a local `private const val NATIVE_ID = "chat-screen-card"` in the companion object, keeping the value byte-identical to what `ChatScreen.tsx` sets.
- [x] 2.5 Remove now-unused imports from `MainActivity.kt` (any `PixelCopy`/`Bitmap`/`Drawable` imports that only the controller used are in the deleted file; confirm `MainActivity` has no dangling imports). ← (verify: `grep -rn "BackSnapshotController\|snapshots" ChatApp/android` returns nothing; scale/outline/elevation/pending/watchdog code in `MainActivity` is untouched apart from the removed calls; `gradlew.bat app:assembleDebug` compiles)

## 3. Dock reveal animation

- [x] 3.1 In `ChatApp/src/navigation/MainNavigator.tsx`, remove both vertical-travel terms from `hiddenStyle` (the hidden `translateY: 12` and the reveal `8 * (1 - reveal.value)`), leaving opacity only.
- [x] 3.2 Change the `reveal` effect so un-hiding animates `withTiming(1, { duration: 80, easing: Easing.out(Easing.cubic) })` and hiding still sets `0` immediately; add a comment explaining that the reveal is gated by the pop's `transitionEnd` and that 80 ms is intentionally below `koolaDurations.fast`. ← (verify: new dock entering a fullscreen route still snaps to hidden with no visible fade, and reduced-motion users see no regression; no other style in the tab bar changed)

## 4. Dock release driven by transitionEnd

- [x] 4.1 In `ChatApp/src/screens/chat/ChatScreen.tsx`, replace the `setTimeout(release, 280)` scheduling after `beforeRemove` with a `transitionEnd` listener that releases when `data.closing === true`.
- [x] 4.2 Register that listener only after `beforeRemove` has fired (so a push-in `transitionEnd` cannot release early), and unsubscribe it in the effect cleanup.
- [x] 4.3 Add a 350 ms fallback timer started from the same point, cleared when the listener releases first, so the dock still returns if no `transitionEnd` arrives.
- [x] 4.4 Keep the existing immediate release for the unmount path that did not go through `beforeRemove`, and keep `notifyNativePopping()` + `setIsComposerExiting(true)` unchanged. ← (verify: exactly one release path can win — `released` flag still guards every path; no listener or timer can fire after unmount; the `beforeRemove`-absent path still releases synchronously)

## 5. Static checks

- [x] 5.1 Run `npx tsc --noEmit` in `ChatApp/` and fix any error introduced by these edits. — **zero errors in the three edited files.** Four pre-existing errors reported, not fixed: `components/moments/__tests__/momentsTextWarning.spec.tsx:128` (TS2871), `navigation/__tests__/shoppingHeaderDefer.test.tsx:15` (TS7016, missing `@types/react-test-renderer`), `navigation/ShoppingTabStack.tsx:420,446` (TS2339 `secondary` not on the action token) — that file is unmodified in this change.
- [x] 5.2 Run `npx eslint` on the three edited TypeScript files and fix any error introduced by these edits. — 0 errors. One pre-existing warning (`KoolaLoadingState` unused, `ChatScreen.tsx:58`) present identically at `HEAD`.
- [x] 5.3 Run `npx jest src/services/__tests__/nativeBack.spec.ts src/navigation/__tests__/tabDockSuppressionStore.test.ts` and confirm both suites pass. — 2/2 suites, 14/14 tests pass.
- [x] 5.4 Run `gradlew.bat app:assembleDebug` (Kotlin compilation is mandatory because a native file is deleted) and confirm the build succeeds. — `BUILD SUCCESSFUL in 4m 30s`. First attempt failed on `:react-native-screens:compileDebugKotlin` from unpatched WIP edits left in `node_modules` (a half-implemented `keepBelowAttached` prop in `ScreenViewManager.kt` + `ScreenNativeComponent.ts`, in no patch file, with no `Screen.kt` property behind it). Restored both files to pristine 4.16.0, ran `:react-native-screens:clean`, rebuild green. Installed copy now differs from pristine only by the three animation XMLs that are actually in `patches/react-native-screens+4.16.0.patch`. ← (verify: all four commands exit 0; any pre-existing failure in an unrelated file is reported, not fixed)

## 6. Device verification (Xiaomi 15 Pro, `gradlew.bat app:installDebug`)

- [x] 6.1 Open a conversation from the list, press the header back arrow: the area around the shrinking card must show the current conversation list with no ghost dock and no slider bar from the screenshot. — **PASS**: Live list revealed on back, no ghost dock.
- [x] 6.2 With the conversation open, let another client send messages, then back out: the revealed list must show the new message and updated unread badge. — **PASS**: Live updates visible.
- [x] 6.3 Empty `adb logcat` filter for tag `KoolaBack`: no "back snapshot captured" line must appear after opening several conversations. — **PASS**: No "back snapshot captured" log found.
- [x] 6.4 Verify the chat header sits correctly in the notch band, status-bar icons are legible, and the composer is pushed by the keyboard (the two regressions the old revert cited). — **PASS**: Header position correct, keyboard pushes composer properly.
- [x] 6.5 Verify predictive back: hold the edge gesture (card shrinks, live list revealed), release (pop runs), and cancel mid-way (card restores, dock stays hidden, no flash). — **PASS**: Predictive back works correctly.
- [x] 6.6 Open a conversation and back out immediately (before the push finishes) — the reveal must still be live content, not blank. — **PASS**: Quick back shows live content.
- [x] 6.7 Verify the dock: it must not translate up on return from Chat, Profile, ShoppingProductDetail or MomentViewer; it must appear at the moment the card clears, and must not paint over the card during the pop. — **PASS**: Dock timing correct, no translate up. ← (verify: all seven device scenarios observed on device; scenario 6.4 is the gate for keeping `transparentModal` — if it fails, revert 1.1 and restore 2.1–2.3, keep 3.x/4.x, and report)

## 7. Final consistency

- [x] 7.1 Grep the repo for `BackSnapshotController`, `back snapshot`, and `detachPreviousScreen` and confirm no stale references or comments remain. — **zero hits in source.** The first grep surfaced 16 survivors outside `ChatTabStack.tsx` (the only file 1.2 touched): `ConnectTabStack`, `SupportTabStack`, `PersonalTabStack` (each a `cardStyle` + `@ts-expect-error` pair plus one spread), `ShoppingTabStack` (navigator-level spread + 7 per-screen overrides), `RootNavigator` (spread + "Fabric fix" comment). All removed in the same pass. Scope note: 7.1 as written only re-checked `ChatTabStack`, so these five files are an **extension beyond the task's letter** justified by the identical rationale in D5 — `grep -rn detachPreviousScreen node_modules/@react-navigation/native-stack node_modules/react-native-screens` returns nothing, so every one of them was inert, and each carried a comment claiming a Fabric-desync fix that this library version does not implement. `cardStyle` now appears only in a `theme.ts` JSDoc usage example (`koolaGlowShadows`), which is a local variable name, not a navigation option. `KoolaBack`/`KoolaBackState` remain in `MainActivity.kt` and are unrelated (hardware-Back interception count, not the deleted snapshot controller). ← (verify: `grep -rn "detachPreviousScreen\|BackSnapshotController" ChatApp/src chat-backend/src chat-backend/scripts` → exit 1, no output; `npx tsc --noEmit` reports only the four pre-existing errors listed in 5.1, none in the five added files; `npx eslint` on the five added files → exit 0, no output)
