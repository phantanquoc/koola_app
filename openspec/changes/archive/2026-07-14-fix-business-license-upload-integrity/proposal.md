## Why

The living business-account-registration specification already requires logo and business-license images to use the media upload flow. The current account UI instead generates a fake license key and reports that upload succeeded, violating the specification and creating a serious trust and verification defect.

## What Changes

- Replace simulated license selection/upload with the existing mobile media picker and upload flow.
- Treat upload as complete only after the media service returns a persistent object key.
- Submit the confirmed `licenseImageKey` to business-account creation.
- Provide truthful cancel, permission-denied, progress, retry, failure, and replacement states.
- Prevent submission while required evidence is absent or still uploading.
- Add focused tests for false-success prevention and request payload integrity.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `business-account-registration`: Strengthens the existing account-list/create UI requirement so license success must correspond to a completed media upload and persisted object key.

## Impact

- Mobile account creation/list UI, media picker integration, upload service usage, and business creation request assembly.
- Existing media and `POST /accounts/business` contracts should be reused; backend changes are allowed only if validation reveals a documented contract defect.
- No change to verification approval semantics or owner account limits.
