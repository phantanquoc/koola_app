import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const MFA_EXEMPT_KEY = 'mfaExempt';

/**
 * Miễn kiểm tra "bắt buộc 2FA" cho route này (vẫn đòi JWT + quyền admin).
 *
 * Chỉ dùng cho route mà admin **chưa bật 2FA vẫn phải gọi được**, nếu không sẽ
 * tự khoá mình:
 * - `GET /admin/me`: client cần biết trạng thái để hiện màn hình bật 2FA.
 * - `/auth/2fa/*`: đã nằm ngoài AdminGuard nên không cần, nhưng để đây cho
 *   người đọc thấy chủ đích.
 *
 * KHÔNG miễn cho route đọc/ghi dữ liệu thật — miễn là hở.
 */
export const MfaExempt = (): CustomDecorator<string> =>
  SetMetadata(MFA_EXEMPT_KEY, true);
