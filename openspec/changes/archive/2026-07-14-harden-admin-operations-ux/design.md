## Context

The command affordance is a static `div` displaying a keyboard shortcut, the shell profile uses hard-coded initials/name, and the `Live` badge does not represent measured health. Drawers/dialogs use role attributes but do not fully contain or restore focus. Business reviewers must leave context to inspect evidence and receive limited completion feedback.

## Goals

- Remove false operational signals.
- Make overlays keyboard and screen-reader safe.
- Make high-trust moderation actions explicit, reversible where possible, and efficient.
- Keep the admin UI lightweight and desktop-first while usable at narrow widths.

## Non-Goals

- Replacing React Router, Axios, or the current CSS system.
- Adopting a heavy component framework.
- Changing AdminGuard authorization.
- Building a full audit-log backend unless separately proposed.

## Decisions

### Honest shell signals

An element displaying `Cmd/Ctrl+K` SHALL implement keyboard activation, focus, and a useful command/search experience; otherwise the shortcut presentation SHALL be removed. Admin identity comes from the authenticated session. Health badges render only measured data and include freshness/error state.

### Accessible overlay primitive

One shared overlay primitive SHALL own labelled dialog semantics, initial focus, Tab/Shift+Tab containment, Escape close where safe, focus return, and body scroll lock. Destructive in-flight actions may temporarily prevent dismissal with a visible busy explanation.

### Explicit operation lifecycle

Approve, reject, ban, and unban SHALL show target identity, consequences, confirmation where risk warrants it, pending state, success feedback, and actionable failure. The triggering row SHALL not silently disappear before success is understood.

### Verification workspace

Business review SHALL support query/status/category/province filters as allowed by available data, stable pagination, and an in-context evidence preview. The reviewer SHALL retain queue position and filters after completing or cancelling review.

### Compact narrow navigation

At narrow widths, persistent sidebar content SHALL collapse into a compact navigation control. Profile/footer content SHALL not consume the first viewport before primary work.

## Verification Strategy

- React tests for command affordance, session identity, operation lifecycle, and retained queue state.
- Keyboard tests for focus entry, Tab loop, Escape, focus return, and background inertness.
- Business queue tests for filters, evidence preview, approval/rejection success/failure, and duplicate-submit prevention.
- Playwright screenshots and keyboard smoke tests at desktop and 500px widths.
