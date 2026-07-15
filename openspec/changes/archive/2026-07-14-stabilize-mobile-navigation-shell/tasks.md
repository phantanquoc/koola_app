## 1. Baseline and Impact

- [x] 1.1 Reproduce dock overlap, dark-theme mismatch, Chat return behavior, and transition artifacts with timestamped screenshots
- [x] 1.2 Run GitNexus upstream impact analysis for every navigation function/component that will change and report any HIGH or CRITICAL result before editing
- [x] 1.3 Record current route hierarchy, `freezeOnBlur`, fullscreen modal routes, dock suppression rules, and safe-area ownership as invariants

## 2. Layout and Theme

- [x] 2.1 Introduce one shared source of truth for primary dock height plus bottom safe-area clearance
- [x] 2.2 Update primary-tab scroll surfaces to consume the shared inset without double padding
- [x] 2.3 Replace light-only dock, icon, label, border, and scene-background values with semantic theme tokens
- [x] 2.4 Replace static `koolaColors.primary`/`koolaColors.muted` dock icon color imports (`MainNavigator.tsx:218`) with semantic `colors.primary`/`colors.textMuted` from `useTheme()`
- [x] 2.5 Add focused tests proving the last list item remains reachable and dark theme does not force a white navigation surface

## 3. Information Architecture

- [x] 3.1 Render visible Vietnamese labels for Chat destinations while retaining accessible names
- [x] 3.2 Wire the existing Calls screen into the labeled Chat destinations
- [x] 3.3 Implement and test deterministic Chat entry/reselection behavior
- [x] 3.4 Wire the reselect/return-to-Messages reset to propagate through both `MainNavigator` and the child `ChatHomeScreen` top-tab navigator (fix: `MainNavigator.tsx:424` no-ops when already focused; `ChatHomeScreen` TopTab has no reset listener)
- [x] 3.5 Add a visible accessible back control to AccountList and audit other headerless pushed screens

## 4. Transition Stability

- [x] 4.1 Profile the transient black transition artifact before changing animation or freeze behavior
- [x] 4.2 Remove the confirmed cause while preserving `freezeOnBlur`, fullscreen presentation, and chat back semantics
- [x] 4.3 Smoke test rapid tab changes on emulator and one physical device; document if an artifact is emulator-specific

## 5. Verification

- [x] 5.1 Run focused navigation/component tests
- [x] 5.2 Run `cd ChatApp && npm run tsc`
- [x] 5.3 Run `cd ChatApp && npm run lint`
- [x] 5.4 Capture light/dark and compact/1080x2400 screenshots with list ends fully visible
- [x] 5.5 Run `openspec validate stabilize-mobile-navigation-shell --type change --strict --no-interactive`
- [x] 5.6 Run GitNexus change detection before any requested commit and confirm only navigation-shell flows are affected
