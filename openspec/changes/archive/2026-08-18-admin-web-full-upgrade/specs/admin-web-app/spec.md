## ADDED Requirements

### Requirement: Admin shell primitives and functional search

Admin-web SHALL provide reusable primitives (`TableShell`, `EmptyState`, `Pagination`, `PageHeader`, `ConfirmDialog`, `SearchInput`, `BulkBar`) sharing `--koola-*` tokens, a functional topbar search that navigates to `GET /admin/users` or `GET /admin/messages/search`, and bulk action bars on business and user tables.

#### Scenario: Functional topbar search
- **WHEN** an admin types in the topbar and submits
- **THEN** the app SHALL navigate to the appropriate search results (users or messages) and SHALL be keyboard operable

#### Scenario: Primitives share tokens
- **WHEN** any new page renders its table/empty/pagination/dialog
- **THEN** styling SHALL use `--koola-*` tokens without introducing a new design system
