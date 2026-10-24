## Context

Chat Home (`ChatApp/src/screens/main/ChatHomeScreen.tsx`) renders a fixed `ChromeHeaderBox` (zIndex 20) at the screen root, and a memoized `ChatHomeContent` (:436) that hosts the four-sub-tab `TopTab.Navigator` plus two overlays: `QrScannerModal` (:502) and `GroupCreateModal` (:508). The `+` dock action calls `setGroupModalVisible(true)` directly; the QR dock action calls `setQrVisible(true)`.

`ConversationActionSheet` (`components/ConversationActionSheet.tsx`) is the app's approved dialog pattern (`openspec/ui-dna.md:245`): in-tree absolute overlay, JS-driver `Animated.Value` per layer, reset-per-open in an effect, `prefersReducedMotion()` short-circuit, `koolaDurations.normal` + `koolaEasing.decelerate`, instant exit, `BackHandler` + `acquireBackIntercept`. `useConversationQuickActions` (`screens/main/useConversationQuickActions.ts`) is the approved *ownership* pattern: dock suppression acquired synchronously inside the open handler, released exactly once in close, with an unmount safety net. The suppression store is refcounted with an idempotent release (`navigation/tabDockSuppressionStore.ts`).

Known defects in the current group form path: it is opened directly by the header, has no entrance motion, no Back handler, suppresses the dock in an effect (one frame late), disables both close affordances while `creating`, and its draft survives every caller-initiated close (`ChatHomeScreen:481` only flips the flag).

## Goals / Non-Goals

**Goals**

- `+` opens a two-action start popup that visually and kinetically matches the long-press action sheet.
- QR scanning keeps its standalone header dock icon next to `+` and opens directly through the same overlay owner.
- One overlay owner on Chat Home: one state machine, one Back handler, one suppression.
- Group form reachable only through the popup from Chat Home, with consistent motion and correct dismissal semantics at every call site.
- No draft leakage across opens; no trapped state during an in-flight create.

**Non-Goals**

- No change to `ConversationActionSheet` behaviour or visuals; it is copied, not refactored.
- No change to the Personal tab header (it keeps its own QR icon and group modal).
- No backend change, no new dependency, no navigation-graph change (Contacts stays a sub-tab).

## Decisions

### D1 — Two-stage overlay owned by one hook, not nested dialogs

`ChatHomeScreen` keeps `overlay: null | 'start' | 'group' | 'qr'` in a dedicated hook (`screens/main/useChatHomeOverlay.ts`) that also owns the suppressor ref, the `BackHandler` subscription and `acquireBackIntercept`. The hook exposes `overlay`, `open(overlay)`, `close()`, and setters used by the children.

- *Why not nest*: a dialog rendered inside another dialog's subtree would inherit the first dialog's mount lifecycle and z-order assumptions, and two `BackHandler` listeners both returning `true` is order-dependent on Android. One owner makes Back and suppression single-writer.
- *Why not keep the parent's `qrVisible`/`groupModalVisible` booleans*: they allow impossible states (`qr` and `group` open together) and give no single place to release suppression.
- *Alternative rejected*: a navigation route for the popup — it would animate the whole stack and lose the in-tree requirement.
- Suppression is acquired **synchronously in `open()`**, mirroring `useConversationQuickActions.openSheet`; `close()` releases and clears the ref; the hook's unmount cleanup releases as a safety net.
- **Ownership of suppression for the group form**: `GroupCreateModal` no longer suppresses. The start popup and group form are owned by Chat Home (suppressed by the hook). `SettingsScreen` is the one remaining caller that is not under an owner, so it acquires the suppression itself in its `handleAddPress` (synchronous, one-line change) instead of the modal doing it in an effect. This keeps the modal free of lifecycle side effects, which is the root cause of the late-suppression frame and of the double-suppression risk when the popup and form coexist.

### D2 — Popup anchoring: screen-scoped overlay below the sub-tab bar

The popup mounts inside `ChatHomeContent` as a sibling of the `TopTab.Navigator`, within a full-screen absolute wrapper (`pointerEvents: 'box-none'`). The overlay covers the scene area only if it is placed inside the screen tree without covering the header — the header is outside `ChatHomeContent` and above it in z-order, so the scrim naturally stops at the sub-tab bar.

- Panel geometry copies `ConversationActionSheet` exactly: `maxWidth 340`, `surface.level1`, `koolaRadii.lg`, `elevation 8`, same shadow, title row with a 44dp ✕, rows `minHeight 48`, 28dp icon shell with `*Soft` tint, hairline dividers, `koolaSpacing.md` bottom pad on the last row.
- Vertical placement: `justifyContent: 'flex-start'` with a top offset of the Chat Home content inset (`ChatHomeHeaderInsetContext`) **minus `CHAT_SUB_TAB_BAR_HEIGHT`**, plus a small gap token (`koolaSpacing.sm`) — the overlay begins at the top of the content subtree (below the header chrome), so subtracting the bar height is what makes the panel sit flush just under the sub-tab bar rather than one full bar height lower. The offset is read from the existing context rather than recomputed.
- *Alternative rejected*: rendering the popup at `ChatHomeScreen` root (above the header). It would cover the wordmark and dock and would make the popup appear to float over the scroll chrome it belongs to.

### D3 — Motion: sheet standard for the popup, slide for the tall form

- **Start popup**: identical to `ConversationActionSheet` — two `Animated.Value`s, both `timing` to 1 with `koolaDurations.normal` / `koolaEasing.decelerate` / `useNativeDriver: true`; scrim binds to opacity, panel binds opacity + `scale 0.94→1` + `translateY 12→0`; reset on every open; reduce-motion jumps to 1. Exit instant. Both timings use the native driver because they animate only opacity/transform (no layout), so they run on the UI thread even while the content subtree is still settling after a cold start.
- **Group form**: scrim fades over `normal`; panel `translateY` from its own height to 0 over `koolaDurations.slow` with `decelerate`; both on the native driver (the translator is a transform, the panel height is only read via `onLayout`). The panel is near-full-height (`maxHeight 92%`), so a 0.94 scale reads as a jitter rather than a deliberate zoom.
- **Exit stays instant for both** — this is the documented app standard (`ui-dna.md:245`); adding an exit would insert lag before the next surface (a navigation or a native confirm) takes over.
- The form's entrance is driven by the same reset-per-open effect as the popup, so the existing early `return null` must become "render null only when `!visible`" with the effect mounted before the early return (the `ConversationActionSheet` precedent: effects declared before `if (!visible) return null`).

### D4 — Guarded close and draft lifecycle in `GroupCreateModal`

- One internal `requestClose()` used by backdrop, ✕ and the owner's Back handler: if `creating` → open a native confirm via the app's confirm host ("Huỷ tạo nhóm?" with "Tiếp tục tạo" / "Huỷ và đóng"); on confirm → cancel-in-flight is *not* implemented (the HTTP request is not aborted), the modal closes and the result is ignored through the existing `searchRequestRef`-style generation counter pattern; otherwise → `resetState()` + `onClose()`.
- **Two generations, not one**: the *session* generation decides whether a result may touch the form (navigate, show an error, change the draft); the *request* generation decides who clears `creating`. The form is always mounted on Chat Home, so a discarded request must still release its own spinner in `finally` — gating that on the session leaves `creating: true` behind for the next open. A newer request owns the flag; older ones never touch it. `resetState()` (called on discard and on the `visible` rising edge) bumps both, so a caller that hides the form without closing through `requestClose()` also opens clean.
- The owner's Back handler does not close the group form itself; it delegates to a ref exposed by the modal (`requestCloseRef`), so both Back and tap share one guard. This keeps `GroupCreateModal` free of `BackHandler` (D1) while still giving Back the confirmation behaviour the spec requires.
- Backdrop and ✕ are no longer `disabled` while creating; they stay operable and route through `requestClose()`.
- Draft resets: on close, and after a successful create (`onCreated` then reset). The popup's owner resets by unmounting the form when the overlay leaves `'group'` — with state held inside the modal, unmount is a sufficient reset and removes the need for a reset API.
- *Alternative rejected*: keeping the draft across opens (some chat apps do) — the spec locks "draft does not leak"; consistency across the three call sites favours a clean form every time.

### D5 — Restoring the QR dock action alongside the dead-mount removal

- `ConversationListScreen`'s `showGroupModal` is never set to `true`; the state and the `<GroupCreateModal>` mount are deleted. `handleGroupCreated` in that file becomes unused and is deleted with it. This is a deletion in a file the change already touches; it is surfaced in tasks rather than done silently.
- Chat Home keeps the QR `HeaderDockAction` (`qr-code-scanner`, label "Quét mã QR") as a standalone dock icon next to `+`, exactly as before this change; QR opens the scanner directly through the overlay owner (`open('qr')` / parked `'qr'`). The start popup offers only the two creation rows. `HeaderSearchDock`'s deprecated `onQrPress`/`onAddPress` props stay (Personal still uses them).

### D6 — Accessibility

`+` gets label "Tạo trò chuyện mới" and a hint naming the two actions ("Mở bảng tạo nhóm hoặc nhắn tin mới"). The popup panel gets `accessibilityViewIsModal`; the backdrop is a `Pressable` with `accessibilityRole="button"` and label "Đóng bảng bắt đầu mới"; each row gets `accessibilityRole="button"` and a distinct label matching its visible text. Rows keep `android_ripple` per the design system.

## Risks / Trade-offs

- **Back handler ordering with `QrScannerModal`** → The QR scanner registers its own `BackHandler` while visible. Because Chat Home's owner releases suppression and drops its own listener when `overlay` leaves `'qr'`, the two listeners never coexist; Chat Home's handler is only mounted for `'start'` and `'group'`.
- **`ChatHomeContent` is `React.memo`** → New overlay state must be consumed where it changes. The owner hook is called inside `ChatHomeContent` (not at the header), so popup state never re-renders the header or the memo boundary's parent.
- **Header press vs. first-mount shell** → `ChatHomeContent` is not mounted while `contentReady` is false (`ChatHomeShell` shows instead), so a ref published by the content would silently drop any `+` press in that window — it is the most likely window for the *first* press after mount. `ChatHomeScreen` therefore owns the parked slot itself (`parkedRef`: the stage plus the synchronously-acquired suppression release — never a hook instance, of which exactly one exists: the content's, the sole renderer). A press with no published trigger parks there; the content consumes the slot on mount into its own overlay via `adoptParked`, which transfers the held suppressor instead of acquiring a second one. Consuming a ref (not state) makes adoption exactly-once under StrictMode double-effects. A second press while parked is dropped (no second suppressor); Back while parked is handled by a screen-level listener that releases the held suppressor and clears the slot, so a later mount adopts nothing. Publishing the trigger and adopting happen in one content effect, in that order, so no press can slip between them.
- **Panel slide on a tall form can clip the scrim edge** → translate from a measured or `onLayout`-captured height with a fallback constant, not from a percentage, so the panel starts fully below the screen edge on all densities.
- **Discarding during an in-flight create leaves a server-side group** → Accepted and documented: the request is not aborted; the conversation will appear on the next sync. Closing is a client-side discard only. This matches the spec ("form stays open if the user cancels") and avoids adding `AbortController` plumbing to `conversationsApi.createGroup`.
- **Saving the draft per open is gone for users who accidentally dismiss** → Mitigated by the scrim being a deliberate tap target and by the confirm during create; the app's other compose surfaces also discard on dismiss.

## Migration Plan

No data or API migration. Ship in one change; rollback is reverting the touched files (no state or schema persists).

## Open Questions

None.
