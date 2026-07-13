## 1. Baseline

- [x] 1.1 Run `npm run ui:audit` from `ChatApp/` and record the before counts (baseline: koolaColors 14, rawText 27, touchable 34, hardcodedHex 38) so the after-drop is measurable.

## 2. KoolaHeader (highest blast radius — do first)

- [x] 2.1 `ChatApp/src/components/KoolaHeader.tsx`: migrate static `koolaColors` → `useTheme().tokens` via `makeStyles(tokens)`; keep KoolaLogo/KoolaIconButton; search bar fill/text/icon from tokens; keep existing a11y. ← (verify: renders correctly on a home tab in BOTH light and dark — no white bar in dark; blast radius is every home tab)

## 3. Contacts

- [x] 3.1 `ChatApp/src/screens/main/ContactsScreen.tsx`: tokens + `makeStyles(tokens)`; raw `<Text>`→`KoolaText`; `Touchable*`→`Pressable` + press feedback; use `KoolaEmptyState`/`KoolaErrorState` for states; Vietnamese-ize ("Retry"→"Thử lại", "Search for people by name or email"→VN, Alert "Error"/"Failed to start chat"→VN).
- [x] 3.2 `ChatApp/src/components/ContactItem.tsx`: tokens + `KoolaText` + `Pressable`; `KoolaAvatar` for the avatar; `accessibilityRole`/`accessibilityLabel` on the row.
- [x] 3.3 `ChatApp/src/components/ContactSearchBar.tsx`: tokens; use `KoolaSearchField` if the layout fits, else inline token migration with `underlineColorAndroid="transparent"` + `accessibilityLabel`. ← (verify: dark-mode legible; no English copy remains; press feedback present)

## 4. Calls

- [x] 4.1 `ChatApp/src/screens/main/CallsScreen.tsx`: tokens + `KoolaText` + `Pressable`; status colors from tokens; add `accessibilityRole="button"` + descriptive `accessibilityLabel` on call-log items (currently none). ← (verify: dark-mode legible; call-log items are screen-reader labeled)

## 5. Universal Search

- [x] 5.1 `ChatApp/src/screens/main/UniversalSearchScreen.tsx`: tokens + `KoolaText` + `Pressable`; `KoolaSearchField` if it fits; input `underlineColorAndroid="transparent"` + `accessibilityLabel`.
- [x] 5.2 `ChatApp/src/components/search/ContactResultItem.tsx` + `ConversationResultItem.tsx` + `MessageResultItem.tsx`: tokens + `KoolaText` + `Pressable` + row a11y. ← (verify: dark-mode legible across all three result types; input labeled)

## 6. QR Scanner

- [x] 6.1 `ChatApp/src/screens/main/QrScannerModal.tsx`: tokens + `KoolaText`; add `accessibilityRole="tablist"`/`"tab"` + `accessibilityState={{ selected }}` on the My-QR/Scan tabs; FIX wrong Material blue `#2196F3` → `tokens.semantic.action.primary`; close-button role/label. ← (verify: brand blue is now #2563EB/action.primary not #2196F3; tabs announce selection; dark-mode legible)

## 7. Chat reply/quote chrome

- [x] 7.1 `ChatApp/src/screens/chat/components/QuoteBubble.tsx`: tokens + `KoolaText` (fixes illegible `#555` on dark).
- [x] 7.2 `ChatApp/src/screens/chat/components/ReplyPreview.tsx`: tokens + `KoolaText`.
- [x] 7.3 `ChatApp/src/screens/chat/components/SwipeableBubble.tsx`: arrow `#2196F3` → tokens; KEEP its direct-manipulation gesture spring (allowed by ui-dna). ← (verify: reply/quote chrome legible in dark; swipe-to-reply gesture still works)

## 8. Shared chrome

- [x] 8.1 `ChatApp/src/components/OfflineBanner.tsx` + `ChatApp/src/components/LoadingFooter.tsx`: static `koolaColors` → tokens.

## 9. CallScreen (WebRTC-safe: text/a11y/color ONLY)

- [x] 9.1 `ChatApp/src/screens/call/CallScreen.tsx`: translate ALL English labels ("Mute"/"Unmute"→"Tắt tiếng"/"Bật tiếng", "Speaker"/"Earpiece", "End"→"Kết thúc", "Connecting..."→"Đang kết nối...", "Call Failed"/"Call Ended", "Flip"/"Show"/"Hide"/"Back"/"Close and Redial"→VN); add `accessibilityRole="button"` + `accessibilityLabel` on every control button (mute/speaker/end/flip/toggle-camera); raw `<Text>`→`KoolaText` where practical; danger/success hex → tokens. Do NOT change WebRTC signaling, ICE/SDP, or call-lifecycle logic. ← (verify: diff touches ONLY JSX text / style-token / a11y props — no signaling/lifecycle/handler-body change; all labels Vietnamese; every control button labeled)

## 10. IncomingCallScreen (WebRTC-safe)

- [x] 10.1 `ChatApp/src/screens/call/IncomingCallScreen.tsx`: translate labels ("Decline"/"Accept"/"Video Call"/"Audio Call"→VN); keep existing accept/decline a11y; danger/success → tokens; raw `<Text>`→`KoolaText`. Same WebRTC guardrail. ← (verify: labels Vietnamese; no signaling/lifecycle change)

## 11. Governance + verification

- [x] 11.1 In `ChatApp/eslint.config.mjs`, escalate design-lint rules to `error` for any directory now fully clean for a specific rule (per the ratchet); do NOT flip any new rule to `error` project-wide.
- [x] 11.2 Run tsc, eslint, jest, and `npm run ui:audit` from `ChatApp/`. Confirm: audit counts DROPPED vs baseline (record before/after) with no regression; no token rescale/rename; no new NativeWind className; no new dependency; GroupInfoScreen + media viewers untouched. ← (verify: all four audit counts lower than 14/27/34/38; tsc+eslint+jest green; WebRTC/GiftedChat/freezeOnBlur untouched)
