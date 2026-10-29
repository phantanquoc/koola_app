import { useQuery } from '@tanstack/react-query';
import {
  CircleDollarSign, Copy, Flag, KeyRound, MonitorSmartphone, ShieldCheck, ShieldOff,
} from 'lucide-react';
import apiClient from '../apiClient';
import { StatusBadge, VerificationBadge } from './StatusBadge';
import { useToast } from './Toast';
import { formatNumber, initials } from './formatters';
import { accountTypeLabel, banBadge } from './user-labels';
import type { AdminUser } from './UserDetail';
import type { AdminSession } from './UserDevices';

/**
 * Rail trái của hồ sơ người dùng: danh tính + tín hiệu tin cậy.
 *
 * Tách khỏi `UserDetail` vì hai lý do: file đó đã 773 dòng (vượt ngưỡng 800 nếu
 * nhét thêm), và rail là khối *đọc* — mọi hành động vẫn nằm ở cột phải/bottom
 * bar. Moderator mở hồ sơ để trả lời "có nên cấm người này không"; câu trả lời
 * nằm ở đây, không nằm trong danh sách field.
 */
export function UserDetailRail({ user }: { user: AdminUser }) {
  const { addToast } = useToast();
  // Cùng query key với `UserDevices` → TanStack Query dedupe, không thêm request.
  const sessions = useQuery({
    queryKey: ['user-sessions', user._id],
    queryFn: async () =>
      (await apiClient.get<AdminSession[]>(`/admin/users/${user._id}/sessions`)).data,
    enabled: Boolean(user._id),
  });
  const activeSessions = Array.isArray(sessions.data)
    ? sessions.data.filter((s) => !s.revokedAt).length
    : null;

  const commerce = user.commerceStats;
  const reports = user.reportStats;
  const isBusiness = user.accountType === 'business';
  const hasCommerce = Boolean(commerce && (commerce.ordersAsBuyer || commerce.ordersAsSeller));

  return (
    <aside className="user-rail" aria-label="Tóm tắt tài khoản">
      <div className="user-rail-identity">
        {user.avatarUrl ? (
          <img className="user-rail-avatar" src={user.avatarUrl} alt="" width={56} height={56} />
        ) : (
          <div className="user-rail-avatar user-rail-avatar--initial" aria-hidden="true">
            {initials(user.displayName, 'U')}
          </div>
        )}
        <div className="user-rail-name">
          <h2 className="user-rail-title">{user.displayName}</h2>
          <p className="cell-meta">
            {accountTypeLabel(user.accountType)}
            {user.isPlatformAdmin && ' · Quản trị nền tảng'}
          </p>
        </div>
        <div className="user-rail-badges">
          {user.deletedAt ? <StatusBadge tone="muted" label="Đã xoá" /> : banBadge(user)}
          {isBusiness && <VerificationBadge status={user.verificationStatus} />}
        </div>
      </div>

      <dl className="user-rail-signals">
        <div className="user-rail-signal">
          <dt>
            <Flag size={14} aria-hidden /> Báo cáo
          </dt>
          <dd>
            {reports && reports.total > 0 ? (
              <>
                <strong>{formatNumber(reports.pending)}</strong> đang chờ
                <span className="cell-meta"> / {formatNumber(reports.total)} tổng</span>
              </>
            ) : (
              <span className="cell-meta">Không có</span>
            )}
          </dd>
        </div>

        <div className="user-rail-signal">
          <dt>
            <MonitorSmartphone size={14} aria-hidden /> Phiên hoạt động
          </dt>
          <dd>
            {activeSessions === null ? (
              <span className="cell-meta">…</span>
            ) : activeSessions === 0 ? (
              <span className="cell-meta">Không có</span>
            ) : (
              formatNumber(activeSessions)
            )}
          </dd>
        </div>

        <div className="user-rail-signal">
          <dt>
            {user.twoFactorEnabled ? <ShieldCheck size={14} aria-hidden /> : <ShieldOff size={14} aria-hidden />}
            2FA
          </dt>
          <dd>
            {user.twoFactorEnabled ? (
              'Đã bật'
            ) : (
              <span className="cell-meta">Chưa bật</span>
            )}
          </dd>
        </div>

        {/* Chỉ tài khoản doanh nghiệp mới có đơn bán; ẩn hẳn thay vì hiện hai số 0
            — tài khoản cá nhân chưa từng mua hàng thì cả khối không có nghĩa. */}
        {hasCommerce && commerce && (
          <>
            <div className="user-rail-signal">
              <dt>
                <CircleDollarSign size={14} aria-hidden /> Đơn mua / bán
              </dt>
              <dd>
                {formatNumber(commerce.ordersAsBuyer)} / {formatNumber(commerce.ordersAsSeller)}
              </dd>
            </div>
            <div className="user-rail-signal">
              <dt>
                <CircleDollarSign size={14} aria-hidden /> Doanh thu đã giao
              </dt>
              <dd>{formatNumber(Math.round(commerce.gmvAsSeller))}₫</dd>
            </div>
          </>
        )}

      </dl>

      {(user.lastAppVersion || user.lastAppPlatform) && (
        <p className="user-rail-client cell-meta">
          <KeyRound size={12} aria-hidden />{' '}
          {[user.lastAppPlatform, user.lastAppVersion].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="user-rail-id">
        <span className="cell-meta">Mã tài khoản</span>
        {/* Cùng pattern với hồ sơ doanh nghiệp: moderator dán id vào tra cứu
            hoặc filter, gõ tay 24 ký tự hex là chắc chắn sai. */}
        <button
          className="detail-id"
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(user._id).then(
              () => addToast('success', 'Đã sao chép mã tài khoản.'),
              () => addToast('error', 'Sao chép thất bại.'),
            );
          }}
          title={`Sao chép mã tài khoản · ${user._id}`}
          aria-label="Sao chép mã tài khoản"
        >
          <span className="k-mono">{user._id}</span>
          <Copy size={11} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
