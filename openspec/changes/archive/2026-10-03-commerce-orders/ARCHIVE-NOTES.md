# Archive Notes — commerce-orders (2026-10-03)

## Verification gates (at archive time)
- chat-backend build: PASS
- chat-backend jest: 157 tests (commerce/messaging/notifications) PASS
- admin-web tsc: PASS
- ChatApp tsc: only 6 pre-existing errors in text.secondary (Connect/Shopping/SupportTabStack), present in HEAD — not introduced by this change (confirmed via `git show HEAD`)
- FrameRequestCallback / KoolaSheet / variant soft errors: fixed in-session
- CRITICALs from verify fixed: OrderCard role gating, App deep-link, cron conversationId, useNetworkStatus

## Manual task kept as pending
- `tasks.md` 6.3 — Manual device pass (user): buyer places order for 2 shops → 2 orders + 2 chat cards; seller confirms with fee → buyer sees update; ship with tracking → carrier page; receive → soldCount; 24h/7d cron (or fake timers). Kept as `[ ]` in archived tasks.md — not a blocker for archive.

## Spec sync performed during archive
- Created `openspec/specs/commerce-orders/spec.md` (new capability) with Purpose header added.
- Updated `openspec/specs/commerce-catalog/spec.md`: reconciled Cart revalidation requirement to include the "Đặt hàng" checkout entry per group (from delta), removed the interim "Nhắn tin với shop" requirement whose lifecycle ended with this change, and added the "Checkout entry per group" scenario.

## Follow-ups / tech debt (not blockers)
- `ChatApp/src/api/commerceApi.ts` re-export pattern: currently re-exports/bridges commerce order helpers via the shared api surface; if duplicated or circular, consolidate into a single `commerceApi` module and update imports.
- Carrier tracking URL formats (GHN/GHTK/VTP) — plain https links verified at implementation; re-verify if carriers change URL schemes (fallback: carrier homepage).
- Gateway `message_updated` wiring for order card live refresh — uses existing callback pattern; fallback documented as system-line-only refresh on focus if wiring proves invasive (primary path used).
- No code changes made during archive; scope limited to `openspec/` paths per archive guardrails. No commit performed (as instructed).
