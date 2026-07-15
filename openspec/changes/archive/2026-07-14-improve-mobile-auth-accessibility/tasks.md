## 1. Baseline and Impact

- [x] 1.1 Audit Login, Register, Forgot Password, OTP, and shared input behavior at compact height and maximum system font size
- [x] 1.2 Run GitNexus upstream impact analysis for shared auth form/input components and each touched screen before editing
- [x] 1.3 Record current validation sources, focus refs, keyboard behavior, and primary color contrast values

## 2. Form Infrastructure

- [x] 2.1 Add a shared scrollable keyboard-safe auth form shell without changing route or submit semantics
- [x] 2.2 Extend the shared secure input with a 44px accessible reveal/hide control
- [x] 2.3 Route field errors through the shared input error API and focus the first invalid field on submit
- [x] 2.4 Ensure loading/busy state prevents duplicate submissions and errors remain recoverable

## 3. Responsive Accessibility

- [x] 3.1 Adjust layout constraints so long Vietnamese labels and errors wrap without overlap at the current maximum supported scale (~1.5x)
- [x] 3.2 Ensure Android `KeyboardAvoidingView` is NOT the only mechanism keeping fields reachable — add a scroll-based solution since `behavior={undefined}` (current code in all 5 auth screens) is a no-op on Android
- [x] 3.3 Add `accessibilityLabel` to all `KoolaTextInput` instances on auth screens (currently only placeholder is read by screen readers)
- [x] 3.4 Announce validation errors via `AccessibilityInfo.announceForAccessibility` on submit failure
- [x] 3.5 Make OTP hidden input accessible: add semantic `accessibilityLabel`, ensure operable via screen reader without sighted interaction
- [x] 3.6 Correct any primary button, link, error, placeholder, or disabled-state contrast below the target
- [x] 3.7 Add a note to design.md that raising scale cap toward 200% (2.0x) is deferred to change `raise-mobile-font-scale-cap` (#9)

## 4. Verification

- [x] 4.1 Add focused component and screen tests for keyboard scroll, reveal state, errors, focus, and busy state
- [x] 4.2 Run `cd ChatApp && npm run tsc`
- [x] 4.3 Run `cd ChatApp && npm run lint`
- [x] 4.4 Smoke test all auth screens at default/maximum font size with the Android keyboard open
- [x] 4.5 Run `openspec validate improve-mobile-auth-accessibility --type change --strict --no-interactive`
- [x] 4.6 Run GitNexus change detection before any requested commit and confirm auth service contracts are unchanged
