## Why

The Chat Home `+` button is labelled "Tạo nhóm" and jumps straight into a group-name/participant form — the only thing it can do — while starting a one-to-one chat lives in a different sub-tab and QR scanning sits next to it as a second header icon. Two separate entry points for "start something" cost a header slot and give the most common action (message one person) no home at the top level. At the same time the form it opens is visually inert (no entrance motion, no scrim transition), it registers no hardware-Back handler, it suppresses the floating tab dock one frame late, and it has no way to be dismissed while a create request is in flight. Its draft is also never reset when the caller closes it, so a second open can show the previous attempt's name and participants.

## What Changes

- **New "Bắt đầu mới" popup** on Chat Home: pressing `+` opens an in-tree dialog (never a native `<Modal>`) listing two actions — **Tạo nhóm** and **Nhắn tin mới** (which goes to the Contacts sub-tab). QR scanning keeps its standalone header dock icon next to `+` and opens the existing scanner directly. The dialog reuses the long-press conversation action sheet's exact visual language and entrance motion (scrim fade + panel fade/scale/lift, `koolaDurations.normal`, `koolaEasing.decelerate`, instant exit, reduce-motion respected). It is anchored just under the Chat sub-tab bar and covers the list and sub-tabs but never the fixed header.
- **The group form is reached from that popup**, not directly from the header. Its panel gains the same scrim fade and a slide-up entrance (`koolaDurations.slow`) instead of appearing instantly; exit stays instant per the app's dialog standard.
- **One overlay owner on Chat Home**: a single state machine (`null | 'start' | 'group' | 'qr'`), one hardware-Back handler (`acquireBackIntercept`), and one tab-dock suppression obtained synchronously the moment an overlay opens and released when it closes. A header press landing while the content subtree is absent (first-mount shell) parks the stage plus its already-held suppressor in a screen-owned slot and is adopted into the content's overlay on mount — exactly one hook instance, exactly one suppressor, no double open.
- **The QR dock icon stays** next to `+` in the Chat Home header (as before this change) and opens the scanner directly through the overlay owner. The Personal tab keeps its own QR icon.
- **Group form close semantics fixed**: every close path (backdrop, ✕, hardware Back) goes through one guarded close that resets the draft exactly once; while a create request is in flight those paths ask for confirmation ("Huỷ tạo nhóm?") instead of being disabled, so the user is never trapped. A successful create clears the draft.
- **Dead code removed**: `ConversationListScreen`'s `showGroupModal` state and its `GroupCreateModal` mount, which can never be opened.
- **Header accessibility text updated**: `+` is labelled "Tạo trò chuyện mới" with a hint naming the two actions; the QR icon keeps "Quét mã QR".

## Capabilities

### New Capabilities
- `chat-home-start-popup`: the Chat Home `+` popup — its actions, two-stage flow into the group form, dismissal and Back semantics, dock suppression, motion, anchoring and accessibility.

### Modified Capabilities
- `chat-home-navigation-chrome`: the Chat home header renders the QR dock icon next to `+`; `+` is labelled "Tạo trò chuyện mới" and opens the two-action start popup instead of the group form directly.
- `qr-code`: on Chat Home, the QR scanner is opened from the restored header dock icon (as before this change); the Personal tab entry point is unchanged.

## Impact

- **Mobile** (`ChatApp/src`): `screens/main/ChatHomeScreen.tsx`, new `components/ChatStartPopup.tsx`, new `screens/main/useChatHomeOverlay.ts` (owner hook: state machine, Back handler, dock suppression), `components/GroupCreateModal.tsx` (motion, unified guarded close, suppression removed), `screens/main/ConversationListScreen.tsx` (dead modal state removed), `screens/main/SettingsScreen.tsx` (unchanged behaviour; verify its own group modal still suppresses the dock).
- **Docs**: `openspec/ui-dna.md` motion section gains the panel-slide entrance used by the group form.
- **Tests**: new `ChatApp/src/components/__tests__/ChatStartPopup.spec.tsx`, new `ChatApp/src/components/__tests__/GroupCreateModal.spec.tsx`; existing `ConversationActionSheet.spec.tsx` must keep passing.
- No backend change, no new dependencies, no change to `ConversationActionSheet` behaviour, no change to Personal tab chrome.
