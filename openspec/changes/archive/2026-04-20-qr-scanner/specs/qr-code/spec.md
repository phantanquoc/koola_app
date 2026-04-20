## ADDED Requirements

### Requirement: QR Modal opens from header icon
The system SHALL open a fullscreen modal when the user presses the QR icon in KoolaHeader. The modal SHALL contain two Material Top Tabs: "Quét QR" and "Mã QR của tôi". The modal SHALL be dismissible via a close button in the top-right corner.

#### Scenario: Open QR modal
- **WHEN** user presses the QR icon button in KoolaHeader
- **THEN** a fullscreen modal appears with two swipeable tabs: "Quét QR" (active by default) and "Mã QR của tôi"

#### Scenario: Close QR modal
- **WHEN** user presses the close button (X) in the modal header
- **THEN** the modal closes and returns to the previous screen

### Requirement: QR Scanner tab scans QR codes via camera
The system SHALL display a live camera viewfinder in the "Quét QR" tab. The system SHALL request camera permission before activating the camera. When a QR code is detected, the system SHALL process the scanned value.

#### Scenario: Camera permission granted
- **WHEN** user navigates to "Quét QR" tab and camera permission is granted
- **THEN** the camera viewfinder activates and scans for QR codes

#### Scenario: Camera permission denied
- **WHEN** user navigates to "Quét QR" tab and camera permission is denied
- **THEN** the system shows an alert with message "Cần quyền camera để quét mã QR" and a button "Mở Cài đặt" that calls `Linking.openSettings()`

#### Scenario: Camera permission not yet requested
- **WHEN** user navigates to "Quét QR" tab for the first time
- **THEN** the system requests camera permission via the OS permission dialog

### Requirement: Scanned QR code is validated and processed
The system SHALL validate the scanned QR value as a valid MongoDB ObjectId (24-character hex string). The system SHALL check if the userId matches the current user. The system SHALL verify the user exists via API.

#### Scenario: Valid QR code of another user
- **WHEN** a QR code is scanned containing a valid userId that is not the current user AND the user exists
- **THEN** the system shows an alert with the user's display name and three buttons: "Xem hồ sơ" (navigates to ProfileScreen), "Nhắn tin" (creates direct chat and navigates to ChatScreen), and "Hủy" (dismisses alert)

#### Scenario: QR code contains current user's ID
- **WHEN** a QR code is scanned containing the current user's own userId
- **THEN** the system shows an alert with message "Bạn không thể quét mã của chính mình"

#### Scenario: QR code contains invalid format
- **WHEN** a QR code is scanned containing a value that is not a valid 24-character hex string
- **THEN** the system shows an alert with message "Mã QR không hợp lệ"

#### Scenario: QR code contains valid format but user not found
- **WHEN** a QR code is scanned containing a valid ObjectId format but no matching user exists
- **THEN** the system shows an alert with message "Không tìm thấy người dùng"

### Requirement: Post-scan action — View Profile
The system SHALL navigate to the ProfileScreen with the scanned userId when the user selects "Xem hồ sơ". The QR modal SHALL close before navigation.

#### Scenario: Navigate to profile after scan
- **WHEN** user selects "Xem hồ sơ" from the scan result alert
- **THEN** the QR modal closes AND the app navigates to ProfileScreen with `{ userId: scannedUserId }`

### Requirement: Post-scan action — Send Message
The system SHALL create or find a direct conversation and navigate to ChatScreen when the user selects "Nhắn tin". The QR modal SHALL close before navigation.

#### Scenario: Navigate to chat after scan
- **WHEN** user selects "Nhắn tin" from the scan result alert
- **THEN** the QR modal closes AND the system calls `conversationsApi.startDirectChat(scannedUserId)` AND navigates to ChatScreen with the conversation ID

### Requirement: My QR Code tab displays user's QR code
The system SHALL display a QR code encoding the current user's `_id` in the "Mã QR của tôi" tab. The tab SHALL also display the user's avatar and display name above the QR code.

#### Scenario: Display my QR code
- **WHEN** user navigates to "Mã QR của tôi" tab
- **THEN** the system displays the current user's avatar, display name, and a QR code image encoding their userId

#### Scenario: User not authenticated
- **WHEN** user navigates to "Mã QR của tôi" tab but user data is unavailable
- **THEN** the system displays a fallback message "Không thể tải mã QR"
