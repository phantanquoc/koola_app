## Context

Auth screens use keyboard avoidance but not a reliable scroll/focus strategy. Errors are often rendered outside the shared input instead of driving its error state. Secure fields have no reveal control, and current text scaling caps can prevent users from reaching their configured font size.

## Goals

- Keep every field and primary action reachable with the keyboard open.
- Make errors perceivable visually and through assistive technology.
- Support larger text without redesigning auth business logic.

## Non-Goals

- Changing password policy or auth endpoints.
- Adding social login, passkeys, or biometric login.
- Rewriting the auth navigation flow.

## Decisions

### Scrollable keyboard-safe form shell

Auth screens SHALL share a scrollable form shell with safe-area handling, keyboard-aware focus movement, and enough bottom clearance for the primary action. Decorative content may compress before form controls become unreachable.

### Secure input ownership

`KoolaTextInput` SHALL support an optional password reveal control when secure entry is requested. The control SHALL have a 44px target, state-specific accessible name, and SHALL preserve cursor/focus where the platform allows.

### Error association

Field validation SHALL use the shared input error API so border, helper text, accessibility state, and error announcement refer to the same source. On submit, focus SHALL move to the first invalid field.

### Text and contrast

Form structure SHALL remain usable at the current maximum supported font scale (~1.5x as enforced by `KoolaText` `maxFontSizeMultiplier` caps of 1.3–1.5). Controls may grow vertically and copy may wrap. Normal text SHALL target 4.5:1 contrast; focus and control boundaries SHALL target 3:1 where applicable.

> **Deferred:** Raising `maxFontSizeMultiplier` toward WCAG 200% (2.0x) is tracked by change `raise-mobile-font-scale-cap` (#9). This change verifies auth screens work at the CURRENT cap.

### Android keyboard reachability

All 5 auth screens currently use `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, which is a no-op on Android. The scrollable form shell SHALL ensure fields remain reachable on Android via scroll-to-focused-field behavior, not relying on `KeyboardAvoidingView` alone.

### Input accessibility

All `KoolaTextInput` instances SHALL expose an `accessibilityLabel` that describes the field's purpose. Validation errors SHALL be announced via `AccessibilityInfo.announceForAccessibility`. The OTP hidden input SHALL carry semantics that describe its purpose and digit count.

## Verification Strategy

- Component tests for reveal control, invalid state, and first-error focus.
- Screen tests with keyboard-open layout and compact viewport.
- Android accessibility smoke tests at default and maximum supported system font size.
- Contrast values recorded for primary button labels, links, placeholders, errors, and disabled states.
