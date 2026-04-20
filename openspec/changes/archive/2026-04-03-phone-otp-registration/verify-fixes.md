## [2026-04-03] Round 1 (from spx-apply auto-verify)

### spx-arch-verifier
- Fixed: [CRITICAL] WebRTC gateway AuthSocketData interface still had `email` instead of `phone` — updated to `{ sub: string; phone: string }` in webrtc.gateway.ts
- Fixed: [CRITICAL] Dead file `register.dto.ts` removed — old email-based DTO no longer referenced
- Fixed: [CRITICAL] PlivoService now injects ConfigService instead of reading process.env directly — consistent with project convention
- Fixed: [WARNING] Removed duplicate phone index definition in user.schema.ts — @Prop already creates the index
- Fixed: [WARNING] Created ResendOtpDto with phone validation for register/resend endpoint — was previously accepting unvalidated input
- Fixed: [WARNING] Removed dead RegisterResponse type from frontend types/index.ts
- Fixed: [WARNING] Updated search users API description and DTO comment from "email" to "phone"
