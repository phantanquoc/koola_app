# TESTING

Quy tac chung: viet test truoc khi sua (TDD RED-GREEN-REFACTOR), chay test cua module minh cham truoc khi commit, giu coverage >= 80% cho code moi.

## Vi tri test

- Backend (`chat-backend/`): file `*.spec.ts` dat canh source. Vi du: `src/messages/messages.service.spec.ts`, `src/moments/moments.integration.spec.ts`.
- Mobile (`ChatApp/`): test dat trong thu muc `__tests__` colocated theo feature (`src/services/__tests__/`, `src/components/__tests__/`, ...). Chay duoc ca `*.spec.*` / `*.test.*`.
- Admin-web (`admin-web/`): test TẬP TRUNG trong `src/__tests__/*.test.ts(x)`, setup chung ở
  `src/__tests__/setup.ts`. CẤM đặt test cạnh page/component (`src/pages/*.test.tsx`) —
  một chỗ duy nhất để chạy, mock và review; auditor kiểm tra bằng `ls src/__tests__`.
  Đặt tên mirror source: test cho `src/pages/HealthPage.tsx` là `src/__tests__/HealthPage.test.tsx`,
  import tương đối (`../pages/HealthPage`).

## Lenh chay

```bash
# Backend — tu chat-backend/
npm test                # unit (jest, rootDir=src, *.spec.ts)
npm run test:watch      # watch mode khi phat trien
npm run test:cov        # kem coverage (target >= 80%)
npm run test:e2e        # e2e (test/*.e2e-spec.ts, config test/jest-e2e.json)

# Chi chay 1 file
npx jest src/messages/messages.service.spec.ts

# Mobile — tu ChatApp/
npm test                # jest, preset react-native
npm run test:integration # integration spec (jest.integration.config.js)
npx tsc --noEmit        # typecheck, chay truoc khi gui PR

# Admin-web — tu admin-web/
npm test                # vitest run (jsdom)
```

## Cach viet test backend

- Dung `@nestjs/testing` + mock Mongoose model qua `getModelToken`, khong dung Mongo/Redis that trong unit test. Xem mau `src/messages/messages.service.spec.ts` (mock `findById`, `create`, `findOne`...).
- Test integration-level (nhu `moments.integration.spec.ts`) van mock dependency nhung bao phu full logic service: TTL, race, rollback, cache invalidation.
- Gateway/WebRTC test: mock socket client, assert event + room (`conv:<id>`), khong `io.emit()` global.

## Cach viet test mobile

- Mock native module o ranh gioi test (xem `jest/mocks/`: op-sqlite, webrtc, incall-manager, react-native-config).
- Uu tien assert hanh vi nguoi dung thay vi chi tiet implementation; query theo role/label/text.
- Coverage tap trung `src/services/db/**` va `src/services/sync/**`.

## Cach viet test admin-web

- Test validation client phai mirror rule server (mau `commerce-products.test.ts` mirror spec commerce-catalog + admin DTO).
- E2E trinh duyet (Playwright) chua co trong repo — them khi co flow admin on dinh dau tien can bao ve (xem muc E2E).

## TDD workflow

1. RED: viet test that bai mo ta dung hanh vi can co.
2. GREEN: viet code toi thieu cho test pass.
3. REFACTOR: gon code, giu test xanh.
4. Chay lai full suite cua module + `test:cov` neu them logic nhanh.

## Seed data cho dev/test

Script seed nam o `chat-backend/scripts/seed-*.ts`, chay tu `chat-backend/`:

```bash
npx ts-node -r tsconfig-paths/register scripts/seed-conversations.ts          # 50 user seed-NN@koola.dev + conversations mau
npx ts-node -r tsconfig-paths/register scripts/seed-conversations.ts --wipe  # xoa CHI data da seed roi seed lai
npx ts-node -r tsconfig-paths/register scripts/seed-commerce-catalog.ts
npx ts-node -r tsconfig-paths/register scripts/seed-connect-businesses.ts
npx ts-node -r tsconfig-paths/register scripts/seed-admin-reports.ts
npx ts-node -r tsconfig-paths/register scripts/seed-music-tracks.ts
```

- Mat khau / OTP test: dung user `seed-NN@koola.dev`; khong hardcode credential that trong script.
- `--wipe` chi xoa data khop pattern seed — khong bao gio chay seed co `--wipe` ngoai DB dev.

## Quy tac test DB

- Unit/integration test KHONG cham DB that: mock model nhu mau co san.
- Seed va test tay chi chay tren DB dev (MONGODB_URI trong `.env` local). Kiem tra URI truoc khi chay — tuyet doi khong seed/test vao prod.
- E2E (`test:e2e`) chay tren DB/Redis rieng cho test; khong dung chung voi dev dang co du lieu.

## E2E flow chinh (bao ve khi them Playwright / mo rong e2e backend)

1. Login: OTP phone/email -> refresh token -> access token -> `GET /users/me` 200.
2. Gui tin nhan: `POST /conversations/:id/messages` -> persist DB -> nhan `message.new` tren socket room `conv:<id>` o client thu hai.
3. Approve-business (admin): duyet business -> trang thai doi -> business hien thi dung cho client.
4. Sync offline: gui khi mat mang -> reconnect -> `/messages/sync` tra du thieu, khong trung lap.
