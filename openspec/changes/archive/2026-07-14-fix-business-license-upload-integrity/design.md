## Context

`business-account-registration` requires `licenseImageKey` and explicitly says the client uploads the license through the existing media flow. The current UI synthesizes a path based on time and immediately shows success without selecting or uploading a file.

## Goals

- Make every displayed upload state match real media state.
- Prevent creation requests containing fabricated or incomplete evidence keys.
- Reuse the established media limits, picker, presigned upload, and error conventions.

## Non-Goals

- Changing business verification policy.
- Building OCR, document validation, cropping, or multi-page license support.
- Changing MinIO exposure or adding a new upload provider.

## Decisions

### Existing media pipeline

The client SHALL use the existing picker and presigned media upload service. The returned persistent object key, not a local URI or timestamp-generated string, becomes `licenseImageKey`.

### Explicit state machine

The UI SHALL distinguish idle, selecting, uploading, uploaded, failed, and replacing states. Cancel returns to the prior valid state. Failure never renders the uploaded state.

### Submission integrity

Business submission SHALL remain disabled while no confirmed key exists or an upload is active. The final request payload SHALL be assembled from the confirmed server key.

### Replacement and orphan handling

Replacing an already uploaded document SHALL retain the previous valid key until the replacement succeeds. Best-effort orphan cleanup may be added only through an existing supported media deletion contract; lack of deletion support SHALL be documented rather than hidden.

## Verification Strategy

- Mock picker and upload service tests for cancel, permission denial, progress, failure, retry, replacement, and success.
- Request test asserts `POST /accounts/business` receives the exact returned object key.
- Integration smoke test uploads an inspectable image and confirms the pending admin queue can open it.
