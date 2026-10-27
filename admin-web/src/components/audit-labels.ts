/**
 * Nhãn + tone cho audit action/target — một nguồn duy nhất.
 *
 * Trước đây map nhãn nằm rải trong drawer hồ sơ (15 action) nên trang Audit log
 * không dùng lại được và hiện mã kỹ thuật `bulk_approve_business`. Danh sách
 * dưới đây phải phủ hết union `AdminAuditAction` ở backend
 * (chat-backend/src/admin/schemas/admin-audit-log.schema.ts).
 */

import { categoryVi, RELATIONSHIP_VI } from './vn-data';

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Hồ sơ doanh nghiệp
  create_business: 'Tạo hồ sơ',
  update_business: 'Cập nhật thông tin',
  approve_business: 'Duyệt hồ sơ',
  reject_business: 'Từ chối hồ sơ',
  bulk_approve_business: 'Duyệt hàng loạt',
  bulk_reject_business: 'Từ chối hàng loạt',
  suspend_business: 'Tạm ngưng bán',
  unsuspend_business: 'Bán hàng trở lại',
  delete_business: 'Xoá hồ sơ',
  restore_business: 'Khôi phục hồ sơ',
  reopen_business: 'Mở lại chờ duyệt',
  assign_business: 'Gán người phụ trách',
  // Người dùng
  ban_user: 'Cấm tài khoản',
  unban_user: 'Gỡ cấm',
  update_user: 'Cập nhật tài khoản',
  delete_user: 'Xoá tài khoản',
  restore_user: 'Khôi phục tài khoản',
  revoke_sessions: 'Thu hồi phiên đăng nhập',
  // Nội dung
  soft_delete_message: 'Gỡ tin nhắn',
  takedown_story: 'Gỡ story',
  resolve_report: 'Xử lý báo cáo',
  dismiss_report: 'Bỏ qua báo cáo',
  // Commerce
  create_product: 'Tạo sản phẩm',
  update_product: 'Cập nhật sản phẩm',
  delete_product: 'Xoá sản phẩm',
  create_service: 'Tạo dịch vụ',
  update_service: 'Cập nhật dịch vụ',
  delete_service: 'Xoá dịch vụ',
  create_store: 'Tạo gian hàng',
  update_store: 'Cập nhật gian hàng',
  delete_store: 'Xoá gian hàng',
  // Nhạc
  create_music_track: 'Thêm track',
  update_music_track: 'Cập nhật track',
  delete_music_track: 'Xoá track',
  // Hệ thống
  broadcast: 'Gửi broadcast',
};

export const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: 'Người dùng',
  business: 'Doanh nghiệp',
  message: 'Tin nhắn',
  story: 'Story',
  report: 'Báo cáo',
  product: 'Sản phẩm',
  service: 'Dịch vụ',
  store: 'Gian hàng',
  music_track: 'Track nhạc',
  broadcast: 'Broadcast',
};

type Tone = 'success' | 'warning' | 'danger' | 'muted' | 'primary';

/**
 * Tone theo hệ quả, không theo loại đối tượng: người đọc audit log đang quét
 * "có gì phá huỷ không", nên màu phải trả lời câu đó.
 */
const DANGER_ACTIONS = new Set([
  'delete_business', 'delete_product', 'delete_service', 'delete_store',
  'delete_music_track', 'soft_delete_message', 'takedown_story', 'ban_user',
  'delete_user', 'revoke_sessions',
]);
const WARNING_ACTIONS = new Set(['reject_business', 'bulk_reject_business', 'suspend_business']);
const SUCCESS_ACTIONS = new Set([
  'approve_business', 'bulk_approve_business', 'restore_business', 'unban_user',
  'unsuspend_business', 'reopen_business', 'resolve_report', 'dismiss_report',
  'restore_user',
]);

export function auditActionTone(action: string): Tone {
  if (DANGER_ACTIONS.has(action)) return 'danger';
  if (WARNING_ACTIONS.has(action)) return 'warning';
  if (SUCCESS_ACTIONS.has(action)) return 'success';
  return 'muted';
}

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditTargetLabel(type: string) {
  return AUDIT_TARGET_LABELS[type] ?? type;
}

/** Dòng bulk ghi targetId = "id1,id2,id3" — đọc ra số lượng thay vì chuỗi id. */
export function auditTargetIds(targetId: string): string[] {
  return targetId.split(',').map((s) => s.trim()).filter(Boolean);
}

// ─── Payload: dịch key kỹ thuật sang câu người vận hành đọc được ──────────────
// Key lấy từ DTO create/update business, user ban, commerce, music, broadcast.
// Thêm field mới ở DTO thì thêm một dòng ở đây — key lạ vẫn không mất, nó rơi
// vào phần "Chi tiết kỹ thuật" chứ không bị nuốt.

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  // Doanh nghiệp
  displayName: 'Tên doanh nghiệp',
  businessCategory: 'Danh mục',
  relationshipType: 'Loại quan hệ',
  tagline: 'Tagline',
  description: 'Mô tả',
  contactEmail: 'Email liên hệ',
  contactPhone: 'Điện thoại',
  address: 'Địa chỉ',
  province: 'Tỉnh/Thành',
  website: 'Website',
  taxCode: 'Mã số thuế',
  licenseExpiresAt: 'Giấy phép hết hạn',
  internalNote: 'Ghi chú nội bộ',
  assignee: 'Người phụ trách',
  // Người dùng / moderation
  reason: 'Lý do',
  rejectionReason: 'Lý do từ chối',
  durationDays: 'Số ngày cấm',
  accountType: 'Loại tài khoản',
  // Bulk
  ids: 'Số hồ sơ',
  // Commerce
  name: 'Tên',
  price: 'Giá',
  originalPrice: 'Giá gốc',
  active: 'Đang bán',
  sellerId: 'Người bán',
  category: 'Danh mục',
  tags: 'Thẻ',
  tag: 'Thẻ',
  imageKeys: 'Số ảnh',
  deliveryText: 'Thông tin giao hàng',
  // Nhạc
  title: 'Tiêu đề',
  artist: 'Nghệ sĩ',
  durationMs: 'Thời lượng',
  audioKey: 'File âm thanh',
  previewKey: 'File nghe thử',
  licenseType: 'Loại giấy phép',
  licenseUrl: 'Link giấy phép',
  sourceUrl: 'Link nguồn',
  // Broadcast
  body: 'Nội dung',
  at: 'Thời điểm gửi',
};

export interface PayloadRow {
  key: string;
  label: string;
  /** 'text' thường; 'pii' để UI che mặc định; 'count' cho mảng chỉ hiện số lượng */
  kind: 'text' | 'pii' | 'count';
  value: string;
  /** Giá trị thô — giữ để phần kỹ thuật hiện đúng JSON gốc */
  raw: unknown;
}

const PII_KEYS = new Set(['contactEmail', 'contactPhone', 'email', 'phone']);
const COUNT_KEYS = new Set(['ids', 'imageKeys', 'tags']);
const DATE_KEYS = new Set(['licenseExpiresAt', 'at']);

function formatPayloadValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (COUNT_KEYS.has(key) && Array.isArray(value)) return String(value.length);
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (DATE_KEYS.has(key)) {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('vi-VN', { dateStyle: 'short' });
  }
  if (key === 'durationMs') return `${Math.round(Number(value) / 1000)} giây`;
  if (key === 'businessCategory') return categoryVi(String(value));
  if (key === 'relationshipType') return RELATIONSHIP_VI[String(value)] ?? String(value);
  if (key === 'accountType') return String(value) === 'business' ? 'Doanh nghiệp' : 'Cá nhân';
  if (key === 'price' || key === 'originalPrice') {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : `${n.toLocaleString('vi-VN')}đ`;
  }
  if (key === 'durationDays') return value === 0 ? 'Vĩnh viễn' : `${value} ngày`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Payload → danh sách dòng đọc được. Giữ thứ tự gốc của payload (đã theo thứ tự
 * field trong DTO). Key không có nhãn vẫn trả về với label = key, để UI biết mà
 * đẩy sang phần kỹ thuật thay vì hiện như nhãn tiếng Việt giả.
 */
export function auditPayloadRows(payload: Record<string, unknown> | null | undefined): PayloadRow[] {
  if (!payload) return [];
  return Object.entries(payload).map(([key, raw]) => {
    const kind: PayloadRow['kind'] = PII_KEYS.has(key) ? 'pii' : COUNT_KEYS.has(key) ? 'count' : 'text';
    return {
      key,
      label: AUDIT_FIELD_LABELS[key] ?? key,
      kind,
      value: formatPayloadValue(key, raw),
      raw,
    };
  });
}

// ─── IP ──────────────────────────────────────────────────────────────────────
/**
 * IP nội bộ máy dev / docker bridge / LAN — moderator không dùng được thông tin
 * này, và `::ffff:192.168.65.1` chỉ làm trang rối. IP public mới đáng hiện.
 */
export function isInternalIp(ip?: string | null): boolean {
  if (!ip) return true;
  const v4 = ip.replace(/^::ffff:/i, '');
  if (v4 === '::1' || v4 === '127.0.0.1' || v4 === 'localhost') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Bỏ tiền tố IPv4-mapped của IPv6: `::ffff:1.2.3.4` → `1.2.3.4`. */
export function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/i, '');
}
