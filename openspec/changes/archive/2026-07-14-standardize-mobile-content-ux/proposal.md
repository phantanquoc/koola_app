## Why

After the structural fixes, the mobile experience still mixes Vietnamese and English, uses ambiguous timestamp abbreviations, presents empty states without a next action, and sometimes logs recoverable failures without informing the user. These inconsistencies reduce comprehension and make otherwise working screens feel unfinished.

## What Changes

- Standardize user-facing production copy to Vietnamese across audited mobile surfaces.
- Replace ambiguous compact timestamps with understandable Vietnamese relative or calendar formats.
- Give empty and error states a relevant recovery or next-step action when one exists.
- Surface recoverable action failures instead of relying only on console logging.
- Normalize compact screen hierarchy and text wrapping without changing business logic.
- Add a copy/state inventory test so new obvious placeholder or mixed-language labels are caught.

## Capabilities

### New Capabilities
- `mobile-content-consistency`: Covers production-language consistency, human-readable time labels, actionable state copy, failure feedback, and resilient text layout.

### Modified Capabilities

None.

## Impact

- Conversation list timestamps/previews, Moments headings, Connect empty/error states, profile/search error messages, and other audited production copy.
- Shared date/copy/state helpers where they reduce duplication.
- No API, persistence, navigation structure, or feature-availability changes.
