## ADDED Requirements

### Requirement: System logs all business actions to audit trail

The system SHALL record all business account actions to audit log with actor, action, timestamp, and device metadata.

#### Scenario: Product creation logged
- **WHEN** member creates product via POST /commerce/products
- **THEN** system logs event {type: "product.created", actorId, businessId, resourceId: productId, deviceId, timestamp}

#### Scenario: Product update logged
- **WHEN** member updates product via PUT /commerce/products/:id
- **THEN** system logs event {type: "product.updated", actorId, businessId, resourceId: productId, changes: {field: {old, new}}, deviceId, timestamp}

#### Scenario: Product deletion logged
- **WHEN** member deletes product via DELETE /commerce/products/:id
- **THEN** system logs event {type: "product.deleted", actorId, businessId, resourceId: productId, deviceId, timestamp}

#### Scenario: Order status change logged
- **WHEN** member updates order status
- **THEN** system logs event {type: "order.status_changed", actorId, businessId, resourceId: orderId, changes: {status: {old, new}}, deviceId, timestamp}

#### Scenario: Member invite logged
- **WHEN** owner/admin invites member
- **THEN** system logs event {type: "member.invited", actorId, businessId, metadata: {email, role}, deviceId, timestamp}

#### Scenario: Member role change logged
- **WHEN** owner/admin changes member role
- **THEN** system logs event {type: "member.role_changed", actorId, businessId, resourceId: targetUserId, changes: {role: {old, new}}, deviceId, timestamp}

#### Scenario: Member removal logged
- **WHEN** owner/admin removes member
- **THEN** system logs event {type: "member.removed", actorId, businessId, resourceId: targetUserId, deviceId, timestamp}

#### Scenario: Business settings change logged
- **WHEN** owner updates business settings
- **THEN** system logs event {type: "business.settings_changed", actorId, businessId, changes: {field: {old, new}}, deviceId, timestamp}

### Requirement: Audit logs queryable by filters

The system SHALL allow owners and admins to query audit logs with filters for time range, event type, and actor.

#### Scenario: Query by time range
- **WHEN** owner/admin requests logs with startDate and endDate
- **THEN** system returns events within that range, newest first

#### Scenario: Query by event type
- **WHEN** owner/admin requests logs with eventType filter (e.g., "product.*")
- **THEN** system returns only events matching type pattern

#### Scenario: Query by actor
- **WHEN** owner/admin requests logs with actorId filter
- **THEN** system returns only events performed by that member

#### Scenario: Pagination supported
- **WHEN** owner/admin requests logs with page and limit params
- **THEN** system returns paginated results with total count

#### Scenario: Non-owner/admin cannot access logs
- **WHEN** editor or viewer requests audit logs
- **THEN** system returns 403 Forbidden

### Requirement: Audit logs include device metadata

The system SHALL enrich audit events with device information for forensics.

#### Scenario: Event includes device model
- **WHEN** audit event logged
- **THEN** record includes deviceId, deviceModel (e.g., "iPhone 14 Pro"), OS version, app version

#### Scenario: Event includes IP address
- **WHEN** audit event logged from backend API
- **THEN** record includes client IP address (for web/API access)

#### Scenario: Event includes location
- **WHEN** audit event logged and client sends coordinates
- **THEN** record includes latitude, longitude (optional, privacy-respecting)

### Requirement: Audit logs auto-expire after 90 days

The system SHALL automatically delete audit logs older than 90 days via TTL index.

#### Scenario: Old logs deleted automatically
- **WHEN** audit log reaches 90 days old
- **THEN** MongoDB TTL index removes document without manual intervention

#### Scenario: Retention period configurable
- **WHEN** system configured with different TTL value
- **THEN** logs expire after configured period instead of default 90 days

### Requirement: Audit logs immutable after creation

The system SHALL prevent modification or deletion of audit events (except TTL expiry).

#### Scenario: Cannot update audit log
- **WHEN** any user attempts to PUT /audit-logs/:id
- **THEN** system returns 405 Method Not Allowed

#### Scenario: Cannot delete audit log
- **WHEN** any user (including owner) attempts to DELETE /audit-logs/:id
- **THEN** system returns 405 Method Not Allowed

#### Scenario: Read-only API
- **WHEN** audit log API accessed
- **THEN** only GET endpoints exist (list, retrieve), no POST/PUT/DELETE

### Requirement: Sensitive changes trigger notifications

The system SHALL send push notifications to owner for high-risk audit events.

#### Scenario: Member removal notifies owner
- **WHEN** admin removes member
- **THEN** system sends notification to all owners with message "Member [Name] was removed by [Admin]"

#### Scenario: Role change to owner notifies existing owners
- **WHEN** owner promotes member to owner role
- **THEN** system sends notification to all owners with message "New owner added: [Name]"

#### Scenario: Business deletion notifies all members
- **WHEN** owner deletes business
- **THEN** system sends notification to all members with message "[Business] has been deleted"
