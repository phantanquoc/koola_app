## MODIFIED Requirements

### Requirement: Discovery Filters Preserved

The discovery surface SHALL preserve the existing filtering and navigation: relationship sub-menu items (`partner` / `supplier` via `relationshipType`), province filter, category filter (`businessCategory`), sort, and text search by business name.

The relationship items SHALL be labelled `Tất cả`, `Yêu cầu mua` (slug `partner`), and `Yêu cầu bán` (slug `supplier`). These display labels SHALL come from a single shared label map, and every surface that renders a business's `relationshipType` SHALL read from that same map so the field never displays two different names for the same value. The underlying slugs and the backend `relationshipType` enum SHALL remain `'partner' | 'supplier'`.

When a relationship filter other than `all` is active, businesses that carry no `relationshipType` SHALL be excluded from the displayed list. This SHALL hold for both API-supplied and mock-supplied businesses.

#### Scenario: Filter by relationship type

- **WHEN** the user selects the "Yêu cầu mua" sub-menu item
- **THEN** the list SHALL contain only verified business accounts with `relationshipType: 'partner'`

#### Scenario: Business without a relationship is excluded when filtering

- **WHEN** a relationship filter other than `all` is active and a business has no `relationshipType`
- **THEN** that business SHALL NOT appear in the displayed list

#### Scenario: Filter by province and category

- **WHEN** the user applies a province and a category filter
- **THEN** the list SHALL contain only verified business accounts matching both filters

#### Scenario: Search by name

- **WHEN** the user searches a business name substring
- **THEN** the list SHALL contain matching verified business accounts

#### Scenario: Relationship label is consistent across surfaces

- **WHEN** a business has `relationshipType: 'supplier'`
- **THEN** every surface that renders its relationship name SHALL display `Yêu cầu bán`

## REMOVED Requirements

### Requirement: Connect Home Header Uses Shared Frosted Box With Search-Only Dock

**Reason**: Superseded by the new `connect-home-navigation-chrome` capability. The search-only dock clause existed only because per-tab dock actions were deferred; that follow-up is this change, so the constraint is now inverted — Connect is required to carry QR and filter actions.

**Migration**: The header geometry, no-double-wordmark, and list-inset clauses of this requirement are carried forward with updated values in `connect-home-navigation-chrome` (unified chrome, 40dp sub-menu reserve) and in `shared-frosted-header-box` (glass-less header box plus shared glass sheet). The search-only dock clause is replaced by `Connect Home Dock Carries QR And Filter Actions`.