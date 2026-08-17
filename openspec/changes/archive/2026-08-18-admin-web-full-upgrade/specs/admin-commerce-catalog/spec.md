## ADDED Requirements

### Requirement: Commerce catalog admin CRUD and public read

The system SHALL provide a `CommerceModule` with `CommerceProduct` (`name`, `price`, `imageKey`, `category`, `storeId`, `createdAt`), `CommerceStore`, and `CommerceService` schemas. Admin endpoints `POST|PATCH|DELETE /admin/commerce/products|services|stores` (JwtAuthGuard+AdminGuard, audit-logged) manage the catalog; public endpoints `GET /commerce/products` and `GET /commerce/services` (paginated, optional `category`/`storeId` filter, `@Public()`) serve consumers with `Cache-Control` headers.

#### Scenario: Admin creates a product
- **WHEN** an admin posts a valid product to `POST /admin/commerce/products`
- **THEN** it SHALL be persisted and visible via `GET /commerce/products`

#### Scenario: Public read is unauthenticated and paginated
- **WHEN** any client calls `GET /commerce/products?page=1&limit=20`
- **THEN** paginated products SHALL be returned without authentication

#### Scenario: Non-admin cannot write catalog
- **WHEN** a non-admin calls `POST /admin/commerce/products`
- **THEN** the system SHALL return 403

#### Scenario: Seed from mobile mocks
- **WHEN** `scripts/seed-commerce-from-mocks.ts` is run
- **THEN** products/services from `shoppingMockData.ts`/`servicesMockData.ts` SHALL be seeded idempotently

#### Scenario: Mobile graduates from preview to ready
- **WHEN** public commerce endpoints are live and seeded
- **THEN** `ChatApp` Shopping/Services SHALL read from `GET /commerce/*` and `featureAvailability` `shopping`/`services` SHALL be `ready`
