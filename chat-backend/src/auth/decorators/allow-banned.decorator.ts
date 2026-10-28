import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const ALLOW_BANNED_KEY = 'allowBannedAccount';

/**
 * Cho phép tài khoản **đang bị cấm** gọi route này.
 *
 * Mặc định `JwtAuthGuard` chặn mọi request của tài khoản bị cấm: ban phải có hiệu
 * lực ngay, không đợi access token hết hạn (1h). Trước đây ban chỉ revoke refresh
 * token, nên người bị cấm vẫn gọi được mọi API trong tối đa 1 giờ.
 *
 * Chỉ dùng cho đúng những route mà người bị cấm **phải** gọi được — hiện là
 * `POST /appeals` (tự bảo vệ mình). Thêm route vào đây là mở đường cho tài khoản
 * bị cấm, nên mỗi lần thêm phải có lý do.
 */
export const AllowBanned = (): CustomDecorator<string> =>
  SetMetadata(ALLOW_BANNED_KEY, true);
