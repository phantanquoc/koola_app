## MODIFIED Requirements

### Requirement: QR Modal opens from header icon
The system SHALL open a fullscreen modal when the user activates a QR entry point: the dedicated QR icon in the Chat home header, or the dedicated QR icon in the Personal tab header. The modal SHALL contain two Material Top Tabs: "Quét QR" and "Mã QR của tôi". The modal SHALL be dismissible via a close button in the top-right corner.

#### Scenario: Open QR modal
- **WHEN** user presses the QR icon button in the Chat home header or in the Personal tab header
- **THEN** a fullscreen modal appears with two swipeable tabs: "Quét QR" (active by default) and "Mã QR của tôi"

#### Scenario: Close QR modal
- **WHEN** user presses the close button (X) in the modal header
- **THEN** the modal closes and returns to the previous screen
