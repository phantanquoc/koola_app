import { LogOut, ShieldAlert } from 'lucide-react';
import { TwoFactorPanel } from './TwoFactorPanel';
import { useAuth } from '../useAuth';

/**
 * Chặn toàn bộ nội dung admin khi máy chủ bật `ADMIN_MFA_REQUIRED` mà tài khoản
 * chưa có 2FA.
 *
 * Vì sao là "wall" chứ không phải chặn ở trang đăng nhập: bật 2FA cần access
 * token (gọi `/auth/2fa/setup` rồi `/auth/2fa/enable`). Từ chối đăng nhập là
 * khoá luôn đường tự bật — admin không có token nào để dùng. Ở đây admin đã
 * đăng nhập nhưng không đọc/ghi được dữ liệu nào cho tới khi bật xong, và
 * `AdminGuard` phía server cũng trả 403 `mfa_required` cho mọi route khác, nên
 * wall này là lời giải thích cho một chặn đã có thật — không phải lớp bảo vệ
 * duy nhất.
 *
 * Không có nút "tôi đã bật xong — tải lại": bật xong thì `TwoFactorPanel` tự gọi
 * `refreshIdentity()`, `AppLayout` đọc lại identity và wall tự mở. Nút tải lại
 * chỉ là lời thú nhận app không tự cập nhật được (§0.7: không có nút giả).
 */
export function MfaRequiredWall({ userId }: { userId?: string }) {
  const { logout } = useAuth();

  return (
    <section className="mfa-wall" role="region" aria-labelledby="mfa-wall-title">
      <div className="mfa-wall-card">
        <div className="mfa-wall-head">
          <span className="mfa-wall-icon" aria-hidden="true">
            <ShieldAlert size={22} />
          </span>
          <div className="mfa-wall-copy">
            <p className="page-eyebrow">Bắt buộc bảo mật</p>
            <h1 id="mfa-wall-title" className="page-title">
              Bật xác thực hai lớp để tiếp tục
            </h1>
            <p className="page-description">
              Mọi trang và thao tác đang bị chặn cho tới khi bật xong. Mật khẩu một
              mình không đủ để bảo vệ dữ liệu người dùng.
            </p>
          </div>
        </div>

        <ol className="mfa-wall-steps" aria-label="Ba bước bật 2FA">
          <li>
            <span className="mfa-wall-step-n" aria-hidden="true">1</span>
            Thêm khoá bên dưới vào ứng dụng xác thực (Google Authenticator, 1Password…).
          </li>
          <li>
            <span className="mfa-wall-step-n" aria-hidden="true">2</span>
            Nhập mã 6 số ứng dụng hiện ra để xác nhận.
          </li>
          <li>
            <span className="mfa-wall-step-n" aria-hidden="true">3</span>
            Lưu bộ mã khôi phục — chỉ hiện một lần.
          </li>
        </ol>

        {userId ? (
          <TwoFactorPanel userId={userId} />
        ) : (
          <p className="alert" role="alert">
            Không đọc được id tài khoản. Đăng xuất rồi đăng nhập lại; nếu vẫn lỗi,
            liên hệ super admin khác.
          </p>
        )}

        <div className="mfa-wall-footer">
          <p className="cell-meta">
            Bộ phận hỗ trợ không tắt 2FA hộ. Mất mã khôi phục và ứng dụng xác thực thì
            nhờ một super admin khác cấp lại quyền.
          </p>
          {/* Lối thoát: admin không muốn bật lúc này vẫn đăng xuất được thay vì
              bị kẹt ở một màn hình duy nhất. */}
          <button className="btn btn-ghost btn-sm" type="button" onClick={logout}>
            <LogOut size={14} aria-hidden /> Đăng xuất
          </button>
        </div>
      </div>
    </section>
  );
}
