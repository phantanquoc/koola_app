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
 * Mỗi trang đích đọc `focus` và tự tải đúng đối tượng qua API riêng
 * (`/admin/conversations/:id`, `/admin/messages/:id`, `/admin/stories/:id`),
 * nên link luôn mở được nội dung thật — kể cả khi nó đã bị gỡ hoặc không nằm
 * trong trang/tab mặc định.
 */
export function reportTargetHref(type: string, id: string): string | null {
  const focus = encodeURIComponent(id);
  switch (type) {
    case 'user':
      return `/users?search=${focus}`;
    case 'conversation':
      return `/conversations?focus=${focus}`;
    case 'message':
      return `/messages?focus=${focus}`;
    case 'story':
      return `/moments?focus=${focus}`;
    default:
      return null;
  }
}
