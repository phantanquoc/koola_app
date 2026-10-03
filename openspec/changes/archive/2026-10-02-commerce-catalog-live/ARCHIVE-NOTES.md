# Archive notes — commerce-catalog-live (archived 2026-10-02)

Verification at archive: CRITICAL 0, WARNING 4 (2 pre-existing gate items confirmed
via git: ChatApp `text.secondary` tsc errors and jest failures in untouched files;
1 home-card image-refetch gap — FIXED post-report via one-time detail refetch in
`ShoppingHomeScreen.tsx` + new test `ShoppingHomeScreen.imageRefresh.spec.tsx`;
1 seed/manual device pass pending = task 10.3). Suggestion 2 (minor, non-blocking).

## Pending manual follow-up (not a blocker)

Task 10.3 in `tasks.md` remains unchecked on purpose: run
`chat-backend/scripts/seed-commerce-catalog.ts` with a tester email, browse
Home/PDP/Storefront on device, add to cart across 2 shops, restart app,
deactivate a product in admin-web and reopen cart.

## Cleanup awaiting user confirmation

`ChatApp/src/api/commerceApi.ts` is now a re-export with no importers.
Deletion is for the user to confirm — do NOT delete autonomously.
