## Why

The admin web app contains controls that appear interactive but are static, displays hard-coded identity and live-status signals, lacks complete keyboard focus management in overlays, and makes business verification slower and less explicit than a high-trust operation requires.

## What Changes

- Make the command/search affordance functional or render it as non-interactive information without a shortcut claim.
- Bind admin identity and system-health indicators to real state, or remove misleading placeholders.
- Add a reusable accessible dialog/drawer foundation with focus trap, Escape handling, focus return, and background scroll control.
- Require confirmation, duplicate-submit protection, and visible completion feedback for approve/reject/ban operations.
- Improve business verification with searchable/filterable queue state and in-context license review.
- Replace the narrow-viewport full sidebar block with compact, operable navigation.
- Preserve current admin authorization and business-verification APIs unless pagination/filtering requires a scoped extension.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `admin-web-app`: Admin shell controls, identity/health truthfulness, overlay accessibility, and narrow navigation become explicit requirements.
- `admin-business-verification`: Verification queue discovery, evidence review, action confirmation, and completion feedback become explicit requirements.

## Impact

- `admin-web/src/AppLayout.tsx`, shared primitives/styles, Users, Businesses, Dashboard, and Login-adjacent session display.
- Admin query parameters may be extended only if client-side filtering cannot satisfy the queue size and correctness requirements.
- No change to AdminGuard authority, verification status semantics, or audit ownership.
