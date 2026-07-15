## 1. Baseline and Impact

- [x] 1.1 Audit command affordance, session data, health data, every dialog/drawer, and business verification action lifecycle
- [x] 1.2 Run GitNexus upstream impact analysis for AppLayout, shared overlays, user operations, and business verification handlers before editing
- [ ] 1.3 Record keyboard focus paths and desktop/500px screenshots before changes (deferred-manual: device screenshot capture not automatable in CI)

## 2. Honest Operations Shell

- [x] 2.1 Implement a functional command/search interaction with shortcut handling or remove its interactive/shortcut presentation
- [x] 2.2 Bind displayed admin identity to authenticated session data with a safe loading fallback
- [x] 2.3 Bind health status to measured data with freshness/error state or remove the static Live badge
- [x] 2.4 Replace narrow full-sidebar stacking with compact accessible navigation

## 3. Overlay Accessibility

- [x] 3.1 Create a lightweight shared dialog/drawer primitive with labelled semantics, initial focus, focus trap, Escape policy, focus return, and scroll lock
- [x] 3.2 Migrate Users and Businesses overlays without changing API semantics
- [x] 3.3 Add keyboard tests proving focus cannot move behind an open overlay

## 4. Operation and Verification Workflow

- [x] 4.1 Add confirmation dialog to approve action (`BusinessesPage.tsx:77-88` fires immediately without confirm — must match reject's confirm pattern)
- [x] 4.2 Replace browser `alert()` error/success feedback with accessible in-app notification components using ARIA live regions (`BusinessesPage.tsx:84`, `UsersPage.tsx:100,118`)
- [x] 4.3 Standardize approve/reject/ban/unban confirmation, pending, success, failure, and duplicate-submit behavior
- [x] 4.4 Add business queue search/filter state and stable pagination using existing data or a separately tested minimal query extension
- [x] 4.5 Add in-context license preview with original inspection and expired/missing evidence recovery
- [x] 4.6 Preserve filters, page, and focus when review opens, closes, or completes
- [x] 4.7 Add backdrop-click close support to all admin dialogs/drawers

## 5. Verification

- [x] 5.1 Add focused React tests for shell truthfulness, overlay focus, operation lifecycle, filters, and evidence preview
- [x] 5.2 Run `cd admin-web && npm run lint`
- [x] 5.3 Run `cd admin-web && npm run build`
- [ ] 5.4 Run desktop/500px keyboard and screenshot smoke tests for Dashboard, Users, and Businesses (deferred-manual: device screenshot capture not automatable in CI)
- [x] 5.5 Run any scoped backend tests if queue query parameters were added
- [x] 5.6 Run `openspec validate harden-admin-operations-ux --type change --strict --no-interactive`
- [x] 5.7 Run GitNexus change detection before any requested commit and confirm admin authorization/status semantics remain unchanged
