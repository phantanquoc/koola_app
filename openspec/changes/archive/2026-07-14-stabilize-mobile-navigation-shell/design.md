## Context

The app has five primary destinations and a second Chat destination row. The current custom dock is visually overlaid, partly hard-coded for a light background, and separated from the scroll views that must account for it. Runtime checks also showed short-lived black transition blocks on the emulator. Calls exists as a screen but is not reachable from the current Chat information architecture.

## Goals

- Make navigation predictable and readable without obscuring content.
- Preserve current React Navigation stack ownership and high-risk chat lifecycle protections.
- Make light/dark and safe-area behavior measurable through screenshots and component tests.

## Non-Goals

- Rewriting the entire navigation hierarchy.
- Changing authentication, messaging, call signaling, or feature data semantics.
- Adding blur or animation dependencies.
- Completing Shorts, Shopping, or Services features.

## Decisions

### Layout-owned dock clearance

The navigator SHALL own the dock height and safe-area clearance. Screen lists MAY consume a shared inset token, but individual screens SHALL NOT guess at magic padding values. The final visible item must be fully reachable above the dock at every supported viewport.

### Theme-owned navigation surfaces

Dock, header, transition, icon, and label colors SHALL come from the active semantic palette. `ChatTabStack` SHALL NOT force a white scene background while dark mode is active.

### Labeled Chat destinations

Chat destinations SHALL display both icon and short visible label. Calls SHALL replace or outrank any unfinished primary Chat destination. An unfinished destination may remain accessible only through the feature-availability policy defined by `enforce-mobile-feature-integrity`.

### Deterministic Chat entry

Selecting Chat from another primary destination SHALL open Messages. Reselecting Chat while already inside the Chat area SHALL return to Messages without duplicating routes. Normal stack back navigation SHALL otherwise retain its current semantics.

### Transition diagnosis

Implementation begins with a profiler/screenshot reproduction. Any fix must preserve `freezeOnBlur`, fullscreen route presentation, and chat back behavior. Emulator-only artifacts must be documented rather than hidden through arbitrary delays.

## Verification Strategy

- Focused navigation tests for Chat entry/reselection, Calls reachability, and account back behavior.
- Layout tests for shared bottom inset ownership.
- Android screenshot matrix: Messages scrolled to end, Shopping/Services preview, light/dark dock, rapid tab switching.
- Physical-device smoke test if transition artifacts cannot be reproduced deterministically in Jest or emulator automation.

## Rollback

The change is limited to navigation shell files and shared shell tokens. It can be reverted without changing any feature service or persisted data.
