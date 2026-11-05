/**
 * Nhãn cho báo cáo — một nguồn duy nhất cho list + chi tiết.
 *
 * Report trước đây hiện raw enum (`message`, `pending`, "Resolve") nên moderator
 * phải dịch trong đầu. Đây là bảng dịch đó.
 */

export type ReportTargetType = 'message' | 'story' | 'user' | 'conversation';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  message: 'Tin nhắn',
  story: 'Story',
  user: 'Người dùng',
  conversation: 'Hội thoại',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Chờ xử lý',
  resolved: 'Đã xử lý',
  dismissed: 'Bỏ qua',
};

const STATUS_TONE: Record<ReportStatus, 'warning' | 'success' | 'muted'> = {
  pending: 'warning',
  resolved: 'success',
  dismissed: 'muted',
};

export function reportTargetLabel(type: string) {
  return REPORT_TARGET_LABELS[type as ReportTargetType] ?? type;
}

export function reportStatusLabel(status: string) {
  return REPORT_STATUS_LABELS[status as ReportStatus] ?? status;
}

export function reportStatusTone(status: string): 'warning' | 'success' | 'muted' {
  return STATUS_TONE[status as ReportStatus] ?? 'muted';
}

/**
 * Deep-link sang đối tượng bị báo cáo.
 *
 * Chỉ trả về link khi trang đích THẬT SỰ đọc param. Hiện `ConversationsPage` và
 * `MessageSearchPage` chưa xử lý `focus`, nên link cũ `?focus=<id>` chỉ mở trang
 * trống — hứa suông (DESIGN §0.7). Trả null để UI hiện tên thay vì link chết.
 * Khi hai trang đó đọc `focus`, thêm case ở đây là đủ.
 */
export function reportTargetHref(type: string, id: string): string | null {
  if (type === 'user') return `/users?search=${encodeURIComponent(id)}`;
  return null;
}
