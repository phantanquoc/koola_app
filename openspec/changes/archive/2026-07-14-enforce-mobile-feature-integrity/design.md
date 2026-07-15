## Context

Mock commerce/service cards currently present prices, counts, and action buttons with production-like styling. Some chat and media entry actions are visible even though activating them only opens an alert. The UI needs one product-level rule for incomplete functionality.

## Goals

- Ensure the interface never implies that an unavailable operation succeeded.
- Preserve useful preview/discovery work without misleading users.
- Make future feature rollout controlled and testable.

## Non-Goals

- Building commerce checkout, service booking, Shorts publishing, voice messages, or emoji infrastructure.
- Adding remote-config infrastructure unless a current feature flag mechanism is insufficient.
- Changing business-license upload, which is handled by a separate change.

## Decisions

### Three availability states

Features SHALL resolve to `ready`, `preview`, or `unavailable`. Ready enables real actions; preview may show clearly labeled sample content but cannot perform durable-looking mutations; unavailable does not occupy primary navigation or present an enabled primary action.

### Truth before promotion

Preview labeling SHALL be visible before interaction, not only after a tap. Sample product/provider data SHALL be identified as demo content. Badges and counters SHALL represent real state or be omitted.

### Honest action behavior

Unavailable actions SHALL be hidden when they have no discovery value. When an action must remain visible for roadmap communication, it SHALL be disabled or marked "Sắp ra mắt" with an accessible explanation. A generic blocking alert after an enabled action is not sufficient.

### Central policy, local rendering

A small typed feature-availability registry MAY centralize state and labels. Screens remain responsible for their domain layout, but they SHALL NOT invent conflicting readiness rules.

## Verification Strategy

- Unit tests for availability-to-UI mapping.
- Component tests assert preview labeling is visible and primary actions cannot mutate fake state.
- Navigation tests assert unavailable destinations do not occupy primary slots.
- Android screenshots cover Shopping, Services, Shorts entry, and composer in light/dark themes.
