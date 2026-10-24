## 1. Overlay owner hook

- [x] 1.1 New `ChatApp/src/screens/main/useChatHomeOverlay.ts`: `overlay: null | 'start' | 'group' | 'qr'`, `open(next)`, `close()`, `requestGroupCloseRef`; acquires dock suppression synchronously inside `open()` (release ref, idempotent release), releases exactly once in `close()`, and releases in an unmount safety net (design D1)
- [x] 1.2 One `BackHandler` + `acquireBackIntercept` inside the hook, mounted only while `overlay === 'start' | 'group'`: `'start'` → close; `'group'` → delegate to `requestGroupCloseRef.current()` (silent no-op if unset)
- [x] 1.3 Switch `open()` targets that leave the screen (`qr`, `'Nhắn tin mới'`) so the overlay is cleared before the destination opens, never after ← (verify: suppression is not left held after opening QR or Contacts; `open`/`close` release count is exactly one per open)

## 2. Start popup component

- [x] 2.1 New `ChatApp/src/components/ChatStartPopup.tsx`: props `visible`, `onClose`, `onGroupPress`, `onNewMessagePress`; full-screen absolute wrapper scoped inside `ChatHomeContent` (sibling of `TopTab.Navigator`), panel top offset taken from `ChatHomeHeaderInsetContext` (design D2)
- [x] 2.2 Panel + rows styled from the `ConversationActionSheet` token set (maxWidth 340, `surface.level1`, `koolaRadii.lg`, elevation 8 + shadow, 44dp ✕, 48dp rows, 28dp `*Soft` icon shells, hairline dividers, last-row `md` pad)
- [x] 2.3 Two rows: Tạo nhóm (`group-add`), Nhắn tin mới (`chat`) — QR lives in the header dock, not the popup
- [x] 2.4 Entrance: scrim fade + panel fade/scale 0.94→1/lift 12 over `koolaDurations.normal` with `koolaEasing.decelerate`, native driver, reset per open, `prefersReducedMotion()` short-circuit, instant exit (design D3)
- [x] 2.5 Accessibility: `accessibilityViewIsModal` on panel, backdrop `Pressable` labelled "Đóng bảng bắt đầu mới", row `accessibilityRole="button"` + labels ← (verify: dialog is inert to the list underneath via the scrim, Back closes it, both rows fire their callbacks once)

## 3. Chat Home wiring

- [x] 3.1 `ChatHomeScreen.tsx`: replace `qrVisible`/`groupModalVisible` state with `useChatHomeOverlay()` called inside `ChatHomeContent`; remove the now-unused props from `ChatHomeContentProps`
- [x] 3.2 `+` `HeaderDockAction`: label "Tạo trò chuyện mới", hint "Mở bảng tạo nhóm hoặc nhắn tin mới", `onPress` → park/`open('start')`; QR `HeaderDockAction` (`qr-code-scanner`, "Quét mã QR") restored next to `+`, `onPress` → park/`open('qr')`
- [x] 3.3 Chat Home dock renders both actions: QR icon + `+` (QR restored as before this change)
- [x] 3.4 Mount `ChatStartPopup` (visible only when `overlay === 'start'`) and `GroupCreateModal` (visible only when `overlay === 'group'`) and `QrScannerModal` (visible only when `overlay === 'qr'`) inside `ChatHomeContent`; "Tạo nhóm" → `open('group')`; "Nhắn tin mới" → `topTabNavRef.current?.navigate('Contacts')` then `close()`
- [x] 3.5 Pass the guarded-close ref into `GroupCreateModal` and clear it on unmount ← (verify: overlay state machine has no impossible states, header still renders one dock action, `ChatHomeContent` memo boundary unchanged, Contacts sub-tab becomes active after "Nhắn tin mới")

## 4. Group creation modal

- [x] 4.1 `GroupCreateModal.tsx`: remove the `suppressTabDock` effect and the `useTabDockSuppression` import; take `requestCloseRef` as an optional prop and assign `requestClose` into it (design D1/D4)
- [x] 4.2 Add `requestClose()`: while `creating` → `koolaConfirm` "Huỷ tạo nhóm?" ("Tiếp tục tạo" / "Huỷ và đóng"), close only on confirm, ignore the late create result via the request-generation counter; otherwise `resetState()` + `onClose()`
- [x] 4.3 Route backdrop and ✕ through `requestClose()` and stop disabling them while `creating` (keep the row/inputs disabled)
- [x] 4.4 Entrance motion: scrim fade over `koolaDurations.normal`; panel `translateY` (measured height, constant fallback) → 0 over `koolaDurations.slow` + `koolaEasing.decelerate`; reset per open; reduce-motion short-circuit; exit instant (design D3)
- [x] 4.5 `SettingsScreen.tsx`: acquire dock suppression synchronously in `handleAddPress` (release when the modal closes / screen unmounts) since it is the only caller not under an overlay owner ← (verify: dock hidden on the same frame the form paints, from both Chat Home and Personal; confirming discard during create closes the form and a late success does not navigate)

## 5. Dead code and docs

- [x] 5.1 `ConversationListScreen.tsx`: delete the never-opened `showGroupModal` state, its `<GroupCreateModal>` mount and the now-unused `handleGroupCreated` (surface the deletion in the apply report)
- [x] 5.2 `openspec/ui-dna.md` motion section: document the tall-panel slide entrance (`slow`, decelerate) alongside the dialog scale entrance

## 6. Verification

- [x] 6.1 New `ChatApp/src/components/__tests__/ChatStartPopup.spec.tsx`: renders null when not visible; two labelled rows; each row invokes its callback exactly once; Back/backdrop dismiss without a row action; reduce-motion path renders at final state
- [x] 6.2 New `ChatApp/src/components/__tests__/GroupCreateModal.spec.tsx`: backdrop/✕ close without a create leaves the draft cleared on the next open; while `creating` the ✕ stays enabled and shows the discard confirm; confirming closes, cancelling keeps the form open
- [x] 6.3 `npx tsc --noEmit` and `npx jest ConversationActionSheet ChatStartPopup GroupCreateModal` in `ChatApp/` pass; existing `ConversationActionSheet.spec.tsx` unchanged and green ← (verify: run the suite, confirm no new failures in the moments/dbguntracked tests already red before this change, and that no file outside the task list above was modified)

## 7. Verify follow-ups (CRITICAL)

- [x] 7.1 `GroupCreateModal`: per-REQUEST create generation (`createRequestRef`) so a discarded request's own `finally` clears `creating` (and never navigates/applies), plus a reset on the `visible` rising edge; regression test "discarding an in-flight create does not leave 'creating' stuck on the next open" and the Back-while-creating test
- [x] 7.2 `useChatHomeOverlay` + `ChatHomeScreen`: exactly ONE hook instance (the content's, the sole renderer); the parked press lives in a screen-owned slot (`parkedRef`: stage + already-held suppressor) and is adopted into the content overlay via `adoptParked` (suppressor transferred, never stacked); screen-level Back + unmount net for the parked window; second press while parked dropped; StrictMode-safe ref consumption; new `ChatApp/src/screens/main/__tests__/useChatHomeOverlay.spec.tsx` two-role handoff regression (park → mount adopts into content, bystander never paints, one suppressor, Back-on-parked clears)
- [x] 7.3 Motion wording reconciled with the native driver (design D3, `ChatStartPopup`/`GroupCreateModal` comments)
