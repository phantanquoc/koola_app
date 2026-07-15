## 1. Availability Inventory

- [x] 1.1 Inventory every visible Shopping, Services, Shorts, and chat composer action and classify it as ready, preview, or unavailable
- [x] 1.2 Run GitNexus upstream impact analysis for shared availability hooks/components and each action handler before editing
- [x] 1.3 Record which counters, badges, alerts, and local mutations currently imply false success

## 2. Availability Policy

- [x] 2.1 Add a typed availability source with user-facing Vietnamese labels where centralization reduces duplication
- [x] 2.2 Add shared preview/upcoming presentation that is visible and accessible before activation
- [x] 2.3 Test ready, preview, and unavailable rendering without adding a heavy feature-flag dependency

## 3. Surface Remediation

- [x] 3.1 Mark Shopping sample data as preview and remove fake cart/order success behavior
- [x] 3.2 Remove or replace fabricated platform metrics in Shopping mock data: fake sold counts ("Da ban 1.2k"), star ratings (4.8), verified badges, and time-urgency promos (`shoppingMockData.ts:51-52`, `ShoppingHomeScreen.tsx`)
- [x] 3.3 Mark Services sample data as preview and remove fake request/booking success behavior
- [x] 3.4 Remove or replace fabricated platform metrics in Services mock data: fake ratings, verified badges on providers (`servicesMockData.ts`, `ServicesHomeScreen.tsx:208-209`)
- [x] 3.5 Add visible preview/demo indicators to Shopping and Services surfaces before user interaction
- [x] 3.6 Remove Shorts from primary navigation or expose it through an explicit preview entry consistent with the navigation change
- [x] 3.7 Hide or disable unavailable emoji and voice composer actions without affecting text, attachment, or send behavior

## 4. Verification

- [x] 4.1 Add focused tests proving preview actions cannot create fake counters or success states
- [x] 4.2 Run `cd ChatApp && npm run tsc`
- [x] 4.3 Run `cd ChatApp && npm run lint`
- [ ] 4.4 Capture light/dark screenshots for every remediated surface (deferred-manual: device screenshot capture not automatable in CI)
- [x] 4.5 Run `openspec validate enforce-mobile-feature-integrity --type change --strict --no-interactive`
- [x] 4.6 Run GitNexus change detection before any requested commit and confirm no unsupported backend workflow was introduced
