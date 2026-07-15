## Why

The mobile navigation shell currently allows content to pass behind the floating dock, uses light-only dock styling in dark mode, exposes unlabeled icon tabs, and leaves important routes such as calls and account management difficult to enter or exit. These issues affect every mobile workflow and must be stabilized before screen-level polish continues.

## What Changes

- Reserve safe layout space for the primary tab bar so scrollable content is never obscured.
- Make the tab bar, active state, and navigation transition surfaces use semantic theme tokens in light and dark modes.
- Give Chat sub-destinations persistent visible labels and expose Calls as a reachable primary Chat destination.
- Define deterministic Chat-tab entry/reselection behavior instead of reopening an unfinished destination unexpectedly.
- Require an in-app back affordance on pushed account-management screens.
- Remove transient black or stale transition surfaces without changing chat data lifecycle behavior.

## Capabilities

### New Capabilities
- `mobile-navigation-shell`: Covers primary and nested mobile navigation layout, labeling, theme behavior, route reachability, and transition stability.

### Modified Capabilities

None.

## Impact

- Mobile navigation under `ChatApp/src/navigation/`.
- Chat home tab metadata and account-management entry surfaces.
- Shared safe-area and theme primitives only where required by the shell.
- No backend API, database, Socket.IO, WebRTC, message-sync, or media contract changes.
