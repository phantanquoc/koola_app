# UI/UX Remediation Plan

## Objective

Convert the 2026-07-14 UI/UX audit findings into independently applicable and testable OpenSpec changes. Each change has one primary product concern, explicit non-goals, acceptance scenarios, and a local verification gate.

This plan follows the existing `uiux-modernization-roadmap` instead of reopening it. The earlier change established the design system and broad modernization work; these changes address residual runtime defects and incomplete user journeys found after that work.

## Ordered Changes

| Order | Change | Primary outcome | Dependency |
|---|---|---|---|
| 1 | `stabilize-mobile-navigation-shell` | Stable, theme-aware navigation without content overlap | None |
| 2 | `clarify-chat-message-feedback` | Legible bubbles, exactly one delivery indicator, distinct read visual | Change 1 baseline verified |
| 3 | `enforce-mobile-feature-integrity` | Preview/incomplete features never impersonate working features or platform metrics | None |
| 4 | `fix-business-license-upload-integrity` | License upload success reflects persisted evidence | Change 3 truthfulness rules |
| 5 | `improve-mobile-auth-accessibility` | Keyboard-safe, scalable (1.5x cap), accessible authentication | Stable shared UI primitives |
| 6 | `improve-mobile-search-and-contacts` | Search opens exact context (with backend extension) and contacts have clear semantics | Change 1 routes stable |
| 7 | `standardize-mobile-content-ux` | Consistent Vietnamese copy, empty states, timestamps, and density | Changes 1, 3, and 6 |
| 8 | `harden-admin-operations-ux` | Keyboard-safe and trustworthy admin operations | Independent of mobile changes |
| 9 | `raise-mobile-font-scale-cap` | WCAG 200% (2.0x) font scale with app-wide overflow protection | Change 5 complete (deferred) |
| 10 | `fix-row-gap-flex-layout` | Eliminate Hermes gap+flex:1 row layout bug across 28 files | None (chore, independent) |

## Apply Policy

1. Apply only one change at a time.
2. Before editing a symbol, run GitNexus upstream impact analysis and report HIGH or CRITICAL risk.
3. Do not begin the next change until the current change passes its automated checks and manual smoke checklist.
4. Keep backend/API changes out of a mobile-only change unless its proposal explicitly includes them.
   - **Exception:** Change #6 (`improve-mobile-search-and-contacts`) includes a narrowly-scoped backend extension for bidirectional message-context retrieval. This is documented in its proposal with explicit justification (current messages API only paginates backward; scroll-to-message requires bounded context loading that is architecturally unsound without server support).
5. Capture before/after screenshots for every affected light and dark mobile surface, and desktop plus narrow admin surfaces.
6. Run `gitnexus_detect_changes()` before any requested commit and verify that changed flows match the active change.

### Scope Notes

- **Change #5** targets auth accessibility at the CURRENT maximum font scale (~1.5x as enforced by `KoolaText` `maxFontSizeMultiplier`). Raising the cap toward WCAG 200% (2.0x) is deferred to change #9 (`raise-mobile-font-scale-cap`).
- **Change #9** is a deferred follow-up to #5 — it should only begin after #5 is archived and its baseline is stable.
- **Change #10** is an independent chore (gap+flex:1 layout fix) that can be applied at any point without dependency on other changes.

## Common Verification Gates

### Mobile changes

- `cd ChatApp && npm run tsc`
- `cd ChatApp && npm run lint`
- Focused Jest tests for the touched navigation, screen, or component behavior
- Android smoke test at 1080x2400 and one compact viewport, in light and dark themes where applicable
- Large-font and keyboard-open checks for form changes

### Admin changes

- `cd admin-web && npm run lint`
- `cd admin-web && npm run build`
- Keyboard-only dialog/drawer test
- Desktop and 500px-wide responsive smoke test

### OpenSpec changes

- `openspec validate <change-id> --type change --strict --no-interactive`
- Mark a task complete only after its inline verification statement passes

## Release Gate

The UI/UX remediation program is complete only when all ten changes are archived, all manual smoke checklists have recorded evidence, and no incomplete feature can report a false success state.
