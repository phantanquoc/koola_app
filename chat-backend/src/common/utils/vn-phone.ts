/**
 * vn-phone.ts — chuẩn hoá & validate số điện thoại Việt Nam cho lớp DTO.
 *
 * Regex cũ `/^(?:\+84|0)\d{9}$/` chỉ nhận di động 10 số. Số cố định 11 số đã có
 * sẵn trong DB (seed: "028 3773 1122") vì vậy mở hồ sơ ra sửa là server trả 400
 * và không lưu được gì — kể cả khi moderator chỉ sửa field khác cùng request.
 */

/** Di động 10 số (03/05/07/08/09) hoặc cố định 11 số (02x), có thể mang +84. */
export const VN_PHONE = /^(?:\+84|0)(?:[35789]\d{8}|2\d{9})$/;

/**
 * Bỏ khoảng trắng, dấu chấm, gạch, ngoặc — người dùng hay dán
 * "028 3773 1122" hoặc "091-234-5678" từ danh bạ.
 */
export function normalizeVnPhone(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return `+${digits}`;
  // Dán "84912345678" (thiếu dấu +) → 0912345678
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}
