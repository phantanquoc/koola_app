import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogOut, Loader2, Monitor } from 'lucide-react';
import apiClient from '../apiClient';
import { ConfirmDialog } from './ConfirmDialog';
import { apiErrorMessage, formatDateTime } from './formatters';
import { useToast } from './Toast';
import type { AdminUser } from './UserDetail';

/** Phiên thiết bị — mirror AdminSessionItem ở AdminSessionService. */
export interface AdminSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** Backend luôn trả false: không suy ra được phiên đang dùng từ token id. */
  current: boolean;
}

/**
 * Danh sách phiên đăng nhập của một tài khoản + thu hồi từng phiên.
 *
 * Tách khỏi UserDetail để drawer/trang chi tiết chỉ phải bày khối; nút "Thu hồi
 * mọi phiên" ở bottombar giữ nguyên, đây là đường hẹp hơn khi chỉ một thiết bị
 * bị lộ.
 */
export function UserDevices({ user }: { user: AdminUser }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [revokeTarget, setRevokeTarget] = useState<AdminSession | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['user-sessions', user._id],
    queryFn: async () =>
      (await apiClient.get<AdminSession[]>(`/admin/users/${user._id}/sessions`)).data,
    enabled: Boolean(user._id),
  });

  // Phiên đã thu hồi vẫn nằm trong response (backend lọc theo expiresAt) — hiện
  // như đã đăng xuất thay vì mời bấm một nút không còn tác dụng.
  const sessions = Array.isArray(data) ? data : [];

  async function revoke() {
    if (!revokeTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.delete(`/admin/users/${user._id}/sessions/${revokeTarget.id}`);
      addToast('success', 'Đã thu hồi phiên. Thiết bị đó phải đăng nhập lại.');
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['user-sessions', user._id] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Thu hồi phiên thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="detail-section" aria-label="Thiết bị và phiên">
      <h3 className="detail-section-title">Thiết bị &amp; phiên ({sessions.length})</h3>

      {isLoading && (
        <p className="cell-meta" role="status">
          <Loader2 size={13} className="state-icon-spin" aria-hidden /> Đang tải phiên đăng nhập.
        </p>
      )}
      {isError && (
        <p className="cell-meta" role="alert">
          {apiErrorMessage(error, 'Không tải được danh sách phiên.')}{' '}
          <button className="cell-link" type="button" onClick={() => void refetch()}>Thử lại</button>
        </p>
      )}
      {!isLoading && !isError && sessions.length === 0 && (
        <p className="cell-meta">Không có phiên hoạt động.</p>
      )}

      {sessions.length > 0 && (
        <ul className="device-list">
          {sessions.map((s) => {
            const revoked = Boolean(s.revokedAt);
            return (
              <li key={s.id} className="device-row">
                <Monitor size={16} aria-hidden />
                <div className="device-meta">
                  <span>Tạo {formatDateTime(s.createdAt)}</span>
                  <span className="cell-meta">
                    <Clock size={12} aria-hidden /> Hết hạn {formatDateTime(s.expiresAt)}
                    {revoked && <> · Đã thu hồi {formatDateTime(s.revokedAt)}</>}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm" type="button"
                  disabled={busy || revoked}
                  onClick={() => setRevokeTarget(s)}
                  aria-label={`Thu hồi phiên tạo ${formatDateTime(s.createdAt)}`}
                >
                  <LogOut size={13} aria-hidden /> {revoked ? 'Đã thu hồi' : 'Thu hồi'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Thu hồi phiên này?"
        description="Refresh token của phiên bị vô hiệu; thiết bị phải đăng nhập lại. Access token đang mở vẫn dùng được tới khi hết hạn (tối đa 1 giờ)."
        confirmLabel="Thu hồi phiên"
        busy={busy}
        onConfirm={revoke}
      />
    </section>
  );
}
