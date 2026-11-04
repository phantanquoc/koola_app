/**
 * Error copy for the business-members screens.
 *
 * The backend's member/invite/session routes reject with meaningful,
 * user-facing reasons ("Cannot remove last owner", "Pending invite already
 * exists for this email", "This invite is for a different email address"). A
 * generic "Có lỗi xảy ra" would throw that away and leave the user guessing,
 * so `describeApiError` prefers the server's message and falls back to the
 * caller's copy only when there isn't one.
 */

/** Known English server messages → Vietnamese copy. */
const TRANSLATIONS: Array<[RegExp, string]> = [
  [/already a member/i, 'Người này đã là thành viên của doanh nghiệp.'],
  [/pending invite already exists/i, 'Email này đã có lời mời đang chờ.'],
  [/different email address/i,
    'Lời mời này dành cho một email khác. Hãy đăng nhập bằng email được mời.'],
  [/invite has expired/i, 'Lời mời đã hết hạn. Hãy yêu cầu gửi lại.'],
  [/invalid or expired invite token/i,
    'Liên kết mời không hợp lệ hoặc đã hết hạn.'],
  [/invite not found/i, 'Lời mời không còn hiệu lực (đã dùng hoặc bị thu hồi).'],
  [/cannot revoke an accepted invite/i,
    'Lời mời đã được chấp nhận, không thể thu hồi.'],
  [/can only resend pending invites/i,
    'Chỉ gửi lại được lời mời đang chờ.'],
  [/at least one owner|cannot remove last owner/i,
    'Doanh nghiệp phải có ít nhất một chủ sở hữu.'],
  [/cannot change your own role/i, 'Bạn không thể tự đổi vai trò của mình.'],
  [/cannot remove yourself/i,
    'Bạn không thể tự xoá mình. Hãy chuyển quyền sở hữu trước.'],
  [/cannot force logout your own session/i,
    'Đây là thiết bị bạn đang dùng. Hãy đăng xuất thay vì buộc đăng xuất.'],
  [/member not found/i, 'Không tìm thấy thành viên này.'],
  [/session not found/i, 'Phiên đăng nhập này không còn tồn tại.'],
  [/requires .*role|requires business account/i,
    'Bạn không có quyền thực hiện hành động này.'],
  [/business account not found|target account not found/i,
    'Không tìm thấy tài khoản kinh doanh.'],
];

/** Network/HTTP error shape from axios, narrowed without importing axios. */
type MaybeAxiosError = {
  message?: unknown;
  response?: { status?: number; data?: { message?: unknown } };
};

function serverMessage(err: unknown): string | null {
  const e = err as MaybeAxiosError;
  const raw = e?.response?.data?.message;
  // Nest's ValidationPipe returns an array of constraint messages.
  if (Array.isArray(raw)) {
    const first = raw.find((m) => typeof m === 'string');
    return typeof first === 'string' ? first : null;
  }
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

/**
 * Human-readable Vietnamese message for a failed business API call.
 *
 * @param fallback What to say when the server gave no usable reason (offline,
 *   timeout, 500 with an empty body).
 */
export function describeApiError(err: unknown, fallback: string): string {
  const msg = serverMessage(err);
  if (msg) {
    for (const [pattern, vi] of TRANSLATIONS) {
      if (pattern.test(msg)) return vi;
    }
    // An untranslated server message still beats generic copy: it is specific,
    // and these routes answer in plain sentences rather than error codes.
    return msg;
  }

  const status = (err as MaybeAxiosError)?.response?.status;
  if (status === 403) return 'Bạn không có quyền thực hiện hành động này.';
  if (status === 404) return 'Không tìm thấy dữ liệu.';
  if (!status) return `${fallback} Kiểm tra kết nối mạng và thử lại.`;
  return fallback;
}
