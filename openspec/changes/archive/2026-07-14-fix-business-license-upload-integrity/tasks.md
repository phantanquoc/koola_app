## 1. Contract and Impact Audit

- [x] 1.1 Trace the current business-account form, picker utilities, media upload service, media limits, and request DTO
- [x] 1.2 Run GitNexus upstream impact analysis for the license handler, upload service methods, and business submit handler before editing
- [x] 1.3 Confirm the exact media response field that is valid for `licenseImageKey` and document any backend mismatch before changing contracts
- [x] 1.4 Audit whether the LOGO upload in `AccountListScreen.tsx` uses the same fake-key fabrication pattern as the license upload; if so, apply the same real-upload rule to logo
- [x] 1.5 Lock the media contract: confirm the exact media-service response field becomes `licenseImageKey`, verify that `POST /accounts/business` DTO expects that exact field name (check `chat-backend/src/accounts` + `chat-backend/src/media`), and document any field-name mismatch that the implementer must reconcile

## 2. Real Upload Flow

- [x] 2.1 Remove timestamp/local fake license-key generation
- [x] 2.2 Integrate the existing image picker with permission and cancel handling
- [x] 2.3 Upload through the existing media service and store only the confirmed persistent object key
- [x] 2.4 Render idle, selecting, uploading, uploaded, replacing, and failed states with accessible progress/status feedback
- [x] 2.5 Disable business submission until required evidence is confirmed and no upload is active

## 3. Integrity Tests

- [x] 3.1 Test picker cancellation and permission denial produce no success state or fabricated key
- [x] 3.2 Test upload failure, retry, successful replacement, and preservation of a prior valid key
- [x] 3.3 Test that business creation receives the exact upload response key and is not called during upload

## 4. End-to-End Verification

- [x] 4.1 Run focused account, media upload, and request-assembly tests
- [x] 4.2 Run `cd ChatApp && npm run tsc`
- [x] 4.3 Run `cd ChatApp && npm run lint`
- [ ] 4.4 Upload a real test license, create a pending business, and confirm admin can open the evidence URL
- [x] 4.5 Run `openspec validate fix-business-license-upload-integrity --type change --strict --no-interactive`
- [x] 4.6 Run GitNexus change detection before any requested commit and confirm verification semantics remain unchanged
