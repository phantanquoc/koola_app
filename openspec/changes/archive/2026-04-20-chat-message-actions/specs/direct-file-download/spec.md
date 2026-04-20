## ADDED Requirements

### Requirement: Download files directly to device storage
The system SHALL download files directly to the device's Downloads folder using react-native-blob-util instead of opening a browser. A Toast confirmation SHALL be shown on success.

#### Scenario: Successful file download
- **WHEN** user taps the download button on a file attachment
- **THEN** the file is downloaded to the Downloads folder, a Toast shows "Đã tải về", and the file is visible in the device's file manager

#### Scenario: Download failure
- **WHEN** the download fails (network error, invalid URL)
- **THEN** an Alert shows "Không thể tải tệp"

#### Scenario: Download in progress
- **WHEN** the download is in progress
- **THEN** the download button shows a spinner instead of the download icon
