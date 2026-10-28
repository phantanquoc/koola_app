import { ShieldAlert } from 'lucide-react';
import { TwoFactorPanel } from './TwoFactorPanel';

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
 * Dùng lại `TwoFactorPanel` thay vì viết form riêng: panel đã lo setup → quét
 * QR → xác nhận mã → hiện recovery code, và chỉ thao tác trên chính người gọi.
 */
export function MfaRequiredWall({ userId }: { userId?: string }) {
  return (
    <section className="mfa-wall" role="region" aria-labelledby="mfa-wall-title">
      <div className="mfa-wall-card">
        <div className="mfa-wall-head">
          <span className="mfa-wall-icon" aria-hidden="true">
            <ShieldAlert size={22} />
          </span>
          <div>
            <h1 id="mfa-wall-title" className="page-title">
              Bật xác thực hai lớp để tiếp tục
            </h1>
            <p className="page-description">
              Hệ thống đang bắt buộc 2FA cho tài khoản quản trị. Mọi trang và thao tác
              đang bị chặn cho tới khi bật xong — mật khẩu một mình không đủ để bảo vệ
              dữ liệu người dùng.
            </p>
          </div>
        </div>

        {userId ? (
          <TwoFactorPanel userId={userId} />
        ) : (
          <p className="alert" role="alert">
            Không đọc được id tài khoản. Tải lại trang; nếu vẫn lỗi, liên hệ quản trị
            viên khác để kiểm tra.
          </p>
        )}

        <div className="table-actions">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            // Bật xong thì server mới trả twoFactorEnabled=true; tải lại để
            // /admin/me và wall cùng đọc trạng thái mới, không đoán ở client.
            onClick={() => window.location.reload()}
          >
            Tôi đã bật xong — tải lại
          </button>
        </div>
        <p className="cell-meta">
          Mất mã khôi phục và ứng dụng xác thực? Nhờ một super admin khác xử lý; đừng
          tắt 2FA hộ người khác.
        </p>
      </div>
    </section>
  );
}
