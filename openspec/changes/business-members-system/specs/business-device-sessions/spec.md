## ADDED Requirements

### Requirement: One active session per business member

The system SHALL enforce one active device session per member per business, force-logging-out previous device on new login.

#### Scenario: First login creates session
- **WHEN** member switches into business account from device A
- **THEN** system creates session record with (businessId, userId, deviceId_A, createdAt)

#### Scenario: Second login from different device force-logs-out first
- **WHEN** member switches into same business from device B
- **THEN** system invalidates session for device A, creates new session for device B, sends push notification to device A

#### Scenario: Same device login reuses session
- **WHEN** member switches into business from same deviceId as existing session
- **THEN** system updates lastActiveAt on existing session, does not create duplicate

#### Scenario: Logout removes session
- **WHEN** member explicitly logs out or switches to different account
- **THEN** system deletes session record for that (businessId, userId) pair

#### Scenario: Session survives app restart
- **WHEN** member closes app and reopens without logging out
- **THEN** session persists (deviceId stored in AsyncStorage survives restart)

### Requirement: Device ID generated on client

The system SHALL use client-generated UUID persisted in AsyncStorage as device identifier.

#### Scenario: First app launch generates device ID
- **WHEN** app launches on fresh install
- **THEN** client generates UUID and stores in AsyncStorage under key "deviceId"

#### Scenario: Device ID persists across sessions
- **WHEN** user logs out and logs back in
- **THEN** client reuses same deviceId from AsyncStorage

#### Scenario: Device ID sent with all business operations
- **WHEN** client makes any API call while switched into business account
- **THEN** client includes X-Device-ID header with stored UUID

### Requirement: Force logout notification sent to old device

The system SHALL send push notification to previous device when force-logged-out by new login.

#### Scenario: Push notification content
- **WHEN** device A force-logged-out by device B login
- **THEN** system sends FCM notification to device A with title "Account accessed from new device" and body "[Business Name] was accessed from [Device B model]"

#### Scenario: Notification includes timestamp
- **WHEN** push notification sent
- **THEN** notification payload includes login timestamp and device model

#### Scenario: Notification action opens security screen
- **WHEN** user taps notification on device A
- **THEN** app opens "Active Sessions" screen showing device B is now active

### Requirement: Owner/Admin can view active sessions

The system SHALL allow owners and admins to view all active sessions for their business.

#### Scenario: List active sessions
- **WHEN** owner/admin requests GET /businesses/:id/sessions
- **THEN** system returns all active sessions with userId, displayName, deviceId, deviceModel, lastActiveAt

#### Scenario: Session shows device metadata
- **WHEN** session listed
- **THEN** response includes device model (e.g., "iPhone 14 Pro"), OS version, app version

#### Scenario: Non-owner/admin cannot view sessions
- **WHEN** editor or viewer requests session list
- **THEN** system returns 403 Forbidden

### Requirement: Owner/Admin can force logout any session

The system SHALL allow owners and admins to remotely terminate any member's session.

#### Scenario: Successful force logout
- **WHEN** owner/admin deletes session via DELETE /businesses/:id/sessions/:sessionId
- **THEN** system deletes session record, target device receives 401 on next API call

#### Scenario: Force logout sends notification
- **WHEN** owner/admin force-logs-out member
- **THEN** system sends push notification to member's device with message "Your session was ended by [Admin Name]"

#### Scenario: Cannot force logout own session
- **WHEN** owner/admin attempts to delete their own active session
- **THEN** system returns 400 Bad Request with message "Use logout endpoint to end your own session"
