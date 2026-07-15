## Context

The current mobile UI includes English headings and errors inside otherwise Vietnamese flows, abbreviations such as `2tu` and `2th`, and empty states that describe a problem but offer no direct recovery action. Several event handlers log errors without giving user-visible feedback.

## Goals

- Make production copy predictable and natural for the app's Vietnamese locale.
- Turn recoverable empty/error states into usable next steps.
- Improve text resilience without another visual redesign.

## Non-Goals

- Introducing a full multi-language localization platform.
- Rewriting marketing content or backend error catalogs.
- Changing feature availability, navigation architecture, or data semantics.

## Decisions

### Vietnamese production baseline

All production mobile surfaces in this change SHALL use Vietnamese user-facing copy. Technical logs may remain English. Server messages SHALL be mapped to stable Vietnamese presentation when raw English errors would otherwise leak to users.

### Shared time formatter

Conversation and search timestamps SHALL use one locale-aware formatter. Compact output may use `ph`, `giờ`, or calendar dates, but SHALL not use ambiguous units such as `tu` or `th` without words.

### Actionable states

An empty/error state SHALL provide the most relevant inline action when the user can resolve it, such as clear filters, retry, create, search, or refresh. When no action exists, the copy SHALL state the condition without instructing the user to perform an unavailable action.

### Visible action failure

Failures from user-initiated operations SHALL produce non-blocking visible feedback and a retry route when safe. `console.warn` may supplement diagnostics but SHALL NOT be the only feedback.

### Compact hierarchy

Page-level headings may remain prominent, but tab panels, cards, and lists SHALL use compact type appropriate for repeated use. Text SHALL wrap or truncate intentionally and SHALL not overlap adjacent actions.

## Verification Strategy

- Static scan for known mixed-language and ambiguous time strings in production screen code.
- Formatter unit tests across seconds, days, weeks, months, and calendar-year boundaries.
- Component tests for actionable empty/error states and long Vietnamese copy.
- Screenshot review for Messages, Moments, Connect, Profile, and search-related states.
