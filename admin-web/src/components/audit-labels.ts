/**
 * Nhãn + tone cho audit action/target — một nguồn duy nhất.
 *
 * Trước đây map nhãn nằm rải trong drawer hồ sơ (15 action) nên trang Audit log
 * không dùng lại được và hiện mã kỹ thuật `bulk_approve_business`. Danh sách
 * dưới đây phải phủ hết union `AdminAuditAction` ở backend
 * (chat-backend/src/admin/schemas/admin-audit-log.schema.ts).
 */

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
]);
const WARNING_ACTIONS = new Set(['reject_business', 'bulk_reject_business', 'suspend_business']);
const SUCCESS_ACTIONS = new Set([
  'approve_business', 'bulk_approve_business', 'restore_business', 'unban_user',
  'unsuspend_business', 'reopen_business', 'resolve_report', 'dismiss_report',
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
