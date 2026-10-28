/**
 * Nhãn dùng chung cho trang Người dùng + chi tiết.
 *
 * Tách khỏi `pages/UsersPage.tsx` để component chi tiết không phải import từ
 * page (page → component là một chiều; ngược lại tạo vòng phụ thuộc).
 */
import { StatusBadge } from './StatusBadge';

export function accountTypeLabel(type?: string | null) {
  return type === 'business' ? 'Doanh nghiệp' : 'Cá nhân';
}

/**
 * Trạng thái cấm → nhãn + tone. `AdminUnbanCron` (15 phút/lần) gỡ khi hết hạn,
 * nên đã hết hạn nhưng chưa gỡ là "chờ gỡ" — trễ tối đa một tick, không phải
 * trạng thái cần xử lý tay.
 */
export function banBadge(u: { isBanned?: boolean; bannedUntil?: string | null }) {
  if (!u.isBanned) return <StatusBadge tone="success" label="Hoạt động" />;
  const until = u.bannedUntil ? new Date(u.bannedUntil) : null;
  if (until && until.getTime() > Date.now()) {
    return <StatusBadge tone="danger" label={`Cấm tới ${until.toLocaleDateString('vi-VN')}`} />;
  }
  if (until) return <StatusBadge tone="warning" label="Hết hạn cấm (chờ gỡ)" />;
  return <StatusBadge tone="danger" label="Cấm vĩnh viễn" />;
}
