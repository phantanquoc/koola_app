## 1. Copy and State Inventory

- [x] 1.1 Inventory mixed-language production strings, ambiguous time units, console-only action failures, and empty states without usable actions
- [x] 1.2 Run GitNexus upstream impact analysis for shared time/state helpers and every modified action handler before editing
- [x] 1.3 Define the approved Vietnamese terminology for Messages, Calls, Moments, people search, Connect, business, and status labels

## 2. Shared Content Rules

- [x] 2.1 Add or consolidate one locale-aware mobile timestamp formatter with boundary tests
- [x] 2.2 Add reusable inline retry/clear-filter state actions where the existing Koola state primitive is insufficient
- [x] 2.3 Add stable Vietnamese fallbacks for user-visible unmapped failures while preserving diagnostic logging

## 3. Screen Remediation

- [x] 3.1 Replace ambiguous conversation/search timestamps and mixed-language message/profile errors
- [x] 3.2 Fix "1n" day/year ambiguity (`ConversationListItem.tsx:25,31`), "5g" hour abbreviation (`:22`), and CallsScreen dates missing year (`CallsScreen.tsx:69`)
- [x] 3.3 Standardize Moments production headings and action labels to Vietnamese
- [x] 3.4 Correct Connect empty-state copy and add clear-filter/retry/next-step actions
- [x] 3.5 Fix `EmptyConnect` blind spot where province/sort filters are NOT passed to the empty-state component, so `hasActiveFilter` is wrong and clear-filters action is absent when filters are actually active (`ConnectHomeScreen.tsx:365-367`)
- [x] 3.6 Surface visible failure feedback for user-initiated conversation/business actions in `BusinessSearchScreen.tsx:70-71` and `BusinessProfileScreen.tsx:79-80` (currently handled only by console.log, beyond the existing `ConnectHomeScreen` coverage)
- [x] 3.7 Surface visible failure feedback for other user-initiated actions currently handled only by logs
- [x] 3.8 Review compact heading, card, row, and long-label behavior on touched screens

## 4. Verification

- [x] 4.1 Add formatter, empty/error state, and long-copy component tests
- [x] 4.2 Run a static scan for the audited English strings and `tu`/`th` timestamp abbreviations
- [x] 4.3 Run `cd ChatApp && npm run tsc`
- [x] 4.4 Run `cd ChatApp && npm run lint`
- [ ] 4.5 Capture Messages, Moments, Connect, Profile, and search screenshots with long/empty/error data (deferred-manual: device screenshot capture not automatable in CI)
- [x] 4.6 Run `openspec validate standardize-mobile-content-ux --type change --strict --no-interactive`
- [x] 4.7 Run GitNexus change detection before any requested commit and confirm no business behavior changed
