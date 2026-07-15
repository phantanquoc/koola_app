## Why

Authentication screens can be obscured by the keyboard on compact devices, cap text scaling below common accessibility expectations, and do not provide consistent password visibility or field-level error semantics. These defects can block account access before users reach the rest of the app.

## What Changes

- Make login, registration, password recovery, and OTP screens scroll safely with the keyboard open.
- Add accessible show/hide controls for secure password inputs.
- Connect validation errors to their input state, announcement, and focus behavior.
- Support large text without overlap, clipping, or unreachable actions.
- Verify normal text and primary-action contrast against WCAG AA targets.
- Preserve existing auth API, OTP, token, and validation semantics.

## Capabilities

### New Capabilities
- `mobile-auth-experience`: Covers mobile authentication form accessibility, keyboard behavior, secure-input controls, validation feedback, and responsive text layout.

### Modified Capabilities

None.

## Impact

- Mobile Login, Register, Forgot Password, OTP, shared text input, and auth form layout components.
- Theme colors or text-scaling defaults only where needed to meet measurable accessibility requirements.
- No backend auth endpoint, password policy, token, or OTP contract changes.
