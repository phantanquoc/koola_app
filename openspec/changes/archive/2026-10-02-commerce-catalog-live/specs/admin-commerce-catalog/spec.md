## MODIFIED Requirements

### Requirement: Commerce catalog admin CRUD and public read

The system SHALL provide a `CommerceModule` with `CommerceProduct`, `CommerceStore`, and `CommerceService` schemas. `CommerceProduct` SHALL follow the seller-owned data model defined by the `commerce-catalog` capability (`sellerId` referencing a verified business account, plus `description`, `originalPrice`, `imageKeys`, `tags`, `deliveryText`, `active`, `soldCount`). Admin endpoints `POST|PATCH|DELETE /admin/commerce/products|services|stores` (JwtAuthGuard+AdminGuard, audit-logged) manage the catalog with validated DTOs; public endpoints `GET /commerce/products` (seller-visible products only, server-side search/filter/sort/pagination per `commerce-catalog`) and `GET /commerce/services` (paginated, optional `category` filter, `@Public()`) serve consumers with `Cache-Control` headers. `CommerceStore` remains for admin/legacy use and SHALL NOT be used to resolve product sellers.

#### Scenario: Admin creates a product
- **WHEN** an admin posts a valid product with a verified business `sellerId` to `POST /admin/commerce/products`
- **THEN** it SHALL be persisted and visible via `GET /commerce/products`

#### Scenario: Public read is unauthenticated and paginated
- **WHEN** any client calls `GET /commerce/products?page=1&limit=20`
- **THEN** paginated seller-visible products SHALL be returned without authentication

#### Scenario: Non-admin cannot write catalog
- **WHEN** a non-admin calls `POST /admin/commerce/products`
- **THEN** the system SHALL return 403

#### Scenario: Seed from mobile mocks
- **WHEN** `scripts/seed-commerce-catalog.ts --owner-email <email>` is run
- **THEN** the products from `shoppingMockData.ts` SHALL be seeded idempotently under verified retail business sellers, and `scripts/seed-commerce-from-mocks.ts` SHALL no longer seed products (services seeding MAY remain)

#### Scenario: Mobile reads the live catalog while ordering is pending
- **WHEN** public commerce endpoints are live and seeded
- **THEN** `ChatApp` Shopping SHALL read products from `GET /commerce/*`, and `featureAvailability.shopping` SHALL remain `preview` until the `commerce-orders` capability ships real ordering
