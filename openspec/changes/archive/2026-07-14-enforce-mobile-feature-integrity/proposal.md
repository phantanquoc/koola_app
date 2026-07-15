## Why

Several mobile surfaces look fully operational but use mock data or respond to primary actions with a generic "under development" alert. This creates false affordances and makes users unable to distinguish a preview from a real transaction-capable feature.

## What Changes

- Introduce a consistent availability model for ready, preview, and unavailable mobile features.
- Mark mock Shopping and Services data as preview content and prevent fake cart, order, request, or count mutations.
- Remove unfinished Shorts from primary navigation or expose it only as an explicitly labeled preview.
- Hide or disable unavailable chat composer actions before the user attempts them.
- Require unavailable actions to explain their state without reporting success or changing durable-looking UI.
- Add tests that detect false success, fake counters, and unlabeled preview data.

## Capabilities

### New Capabilities
- `mobile-feature-availability`: Covers truthful presentation and interaction rules for ready, preview, and unavailable mobile features.

### Modified Capabilities

None.

## Impact

- Shopping, Services, Shorts, chat composer availability, and shared unavailable-feature feedback.
- Navigation metadata may consume feature availability but route stabilization remains owned by `stabilize-mobile-navigation-shell`.
- No commerce, service-booking, Shorts backend, or payment implementation is introduced.
