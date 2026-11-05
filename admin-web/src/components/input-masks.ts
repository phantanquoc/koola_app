/**
 * input-masks.ts
 *
 * Định dạng/chuẩn hoá đầu vào cho các field có cấu trúc (SĐT, tiền, số nguyên).
 *
 * Nguyên tắc: **hiển thị có định dạng, lưu trữ không đổi**. Mọi hàm ở đây chỉ
 * chuyển đổi chuỗi ↔ chuỗi/số; không thay đổi shape dữ liệu gửi lên server.
 */

// ─── Số điện thoại Việt Nam ──────────────────────────────────────────────────

/**
 * Số Việt Nam hợp lệ:
 *  - di động 10 số: 03x/05x/07x/08x/09x + 7 số
 *  - cố định 11 số: 02x + 8 số (VD 028 3773 1122)
 *  - hoặc cùng các dạng trên với tiền tố +84
 *
 * Trước đây chỉ nhận di động 10 số, nên hồ sơ có SĐT cố định (đã nằm trong DB
 * từ seed) mở ra sửa là server trả 400 — không lưu được gì.
 */
export const VN_PHONE = /^(?:\+84|0)(?:[35789]\d{8}|2\d{9})$/;

/** Chỉ giữ chữ số. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Chuẩn hoá SĐT về dạng lưu trữ: `+84…` hoặc `0…`, không khoảng trắng.
 * Chuỗi rỗng → rỗng (field optional).
 */
export function normalizeVnPhone(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (s.startsWith('+')) return `+${digitsOnly(s)}`;
  let d = digitsOnly(s);
  // Người dùng dán "84912345678" (thiếu dấu +) — đưa về dạng 0…
  if (d.startsWith('84') && !d.startsWith('0') && d.length >= 11) d = d.slice(2);
  return d ? `0${d.replace(/^0+/, '')}` : '';
}

/**
 * Hiển thị theo nhóm quen mắt:
 *  - di động trong nước `091 234 5678` (3-3-4)
 *  - di động quốc tế `+84 912 345 678` (2-3-3-3)
 *  - cố định `028 3773 1122` (3-4-4)
 */
export function formatVnPhone(raw: string): string {
  const norm = normalizeVnPhone(raw);
  if (!norm) return '';
  const groups = (s: string, sizes: number[]): string => {
    const out: string[] = [];
    let i = 0;
    for (const size of sizes) {
      if (i >= s.length) break;
      out.push(s.slice(i, i + size));
      i += size;
    }
    if (i < s.length) out.push(s.slice(i));
    return out.join(' ');
  };
  if (norm.startsWith('+84')) {
    // +84 912345678 → +84 912 345 678
    return `+84 ${groups(norm.slice(3), [3, 3])}`;
  }
  // Di động 10 số (0xx…): 3-3-4. Cố định 11 số (02x…): 3-4-4.
  return norm.length <= 10 ? groups(norm, [3, 3]) : groups(norm, [3, 4]);
}

/** Che PII nhưng vẫn cho thấy đầu số đúng (03/05/07/08/09 hoặc 02x). */
export function maskVnPhone(raw: string): string {
  const formatted = formatVnPhone(raw);
  if (!formatted) return '•••';
  const parts = formatted.split(' ');
  if (parts.length === 1) return `${formatted.slice(0, 2)}•••`;
  const head = parts[0];
  const tail = parts[parts.length - 1];
  return `${head} ••• ${tail.slice(-2)}`;
}

export function isValidVnPhone(raw: string): boolean {
  return VN_PHONE.test(normalizeVnPhone(raw));
}

// ─── Tiền (VND) ──────────────────────────────────────────────────────────────

/**
 * Định dạng số tiền người dùng đang gõ: chỉ giữ chữ số, chèn dấu chấm mỗi 3 số.
 * `89000` → `89.000`. Rỗng → rỗng (không biến thành "0" khi người dùng xoá hết).
 */
export function formatVndInput(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return '';
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `89.000` → `89000`. Không hợp lệ (rỗng/chỉ có dấu) → NaN. */
export function parseVnd(raw: string): number {
  const d = digitsOnly(raw);
  if (!d) return NaN;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : NaN;
}

/** Hiển thị tiền đã lưu: `89000` → `89.000đ`. */
export function formatVnd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('vi-VN').format(n)}đ`;
}

// ─── Số nguyên ───────────────────────────────────────────────────────────────

/** Chỉ giữ chữ số, cắt theo độ dài tối đa. Dùng cho MST, thời lượng, số mục. */
export function formatIntegerInput(raw: string, maxLength = 13): string {
  return digitsOnly(raw).slice(0, maxLength);
}
