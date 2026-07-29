## Context

`KoolaHeader` delegates search, QR, and add behavior through callbacks. `ChatHomeScreen` owns the corresponding navigation and modal state and renders a custom Material top-tab bar. The redesign must preserve those ownership boundaries.

## Decisions

### Use one command dock

Universal search remains flexible while QR scanning and add-circle occupy fixed-width trailing cells inside one shared dock. Spacing, not divider lines, communicates separate touch targets. The dock is inset from the header edges so the command rail reads as a compact control rather than a full-width field. The implementation uses sibling Pressables with non-overlapping targets.

### Unify QR and add treatment

QR and add-circle use blue outline MaterialIcons glyphs at matching visual size. The add-circle treatment communicates a create action while preserving the existing `GroupCreateModal` callback; this batch changes presentation only.

### Keep the dock perimeter static

The header command dock defaults to a static neutral hairline border (`StyleSheet.hairlineWidth`, `border.subtle`) for all callers. ChatHomeScreen opts in via an `animatedDockBorder` prop to render a resting brand-gradient stroke (K=red, OOL=blue, A=green at low alpha) plus a one-shot semantic-primary comet that sweeps the perimeter once on first mount and does not repeat during the session. The rationale: the Chat home sub-tab bar and header cluster benefit from a first-visit flourish that pairs with the KoolaLogo entrance, while sibling screens (ConnectHome) keep the static neutral treatment unchanged. The effect does not add BlurView.

### Use the existing icon package

Sub-tabs use inactive/active pairs from the MaterialIcons font already bundled in the Android app: chat/forum for messages and people-outline/people for contacts. Visible text and the persistent selected pill are removed, while each compact 40dp visual slot keeps a 48dp effective touch target through hit slop and retains its descriptive accessibility label. Pressing compresses and dims the glyph briefly; selection crossfades to the filled primary-blue glyph, lifts it slightly, applies a short rebound pulse, and reveals a 2dp semantic-blue underline that expands from the center. No icon dependency, additional native font, or custom asset pipeline is added.

### Keep Koola visual DNA

Neutral surfaces remain content-first. Primary blue marks compact actions and the selected sub-tab glyph, while unread badges use the semantic unread signal. The header and sub-tab bar share one white surface without a dividing rule, and the command dock does not add perpetual animation to the header.

### Respond to conversation scrolling

The Messages list owns a shared Reanimated visibility progress value provided by `ChatHomeScreen`. After a stable upward scroll direction is detected, the icon-only sub-tab rail translates upward, fades, and collapses from 40dp to zero so no empty strip remains. Directional hysteresis prevents small finger jitter from repeatedly re-layouting the navigator. Downward deltas animate it back in. Returning to the top always reveals the rail. The effective 48dp hit target is preserved while the rail is visible, and switching to another sub-tab resets the rail to visible.

## Rollback

Revert the changes to `KoolaHeader.tsx`, `ChatHomeScreen.tsx`, and this OpenSpec change. Navigation and modal behavior require no data rollback.
