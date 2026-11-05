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
 * Trạng thái cấm → nhãn + tone. `bannedUntil` KHÔNG có cron tự gỡ — hết hạn vẫn
 * phải bỏ cấm tay, nên nhãn nói rõ "chờ gỡ" thay vì "đã hết hạn".
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
