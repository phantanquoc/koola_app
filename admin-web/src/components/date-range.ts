/**
 * Chuyển qua lại giữa `<input type="date">` (chỉ có ngày, giờ máy) và chuỗi
 * ISO dùng cho API.
 *
 * Vì sao không dùng thẳng ISO cho input: `type="date"` chỉ đọc `YYYY-MM-DD`.
 * Vì sao không gửi ngày trần lên API: backend đã nhận `IsISO8601` và các
 * endpoint khác (reports export, ops-log) đang gửi ISO đầy đủ — gửi hai dạng
 * trong cùng một hệ là mầm lỗi lệch múi giờ.
 *
 * `from` lấy 00:00:00 địa phương, `to` lấy 23:59:59.999 địa phương để bao trọn
 * ngày người dùng chọn. Đây là cùng quy ước với `OpsLogPage` (nơi hàm này được
 * tách ra từ) nên bộ lọc ngày ở hai trang cho cùng kết quả.
 */

/** ISO → `YYYY-MM-DD` theo giờ máy, '' khi rỗng/không parse được. */
export function isoToDay(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` → ISO; `to` nhận biên cuối ngày. '' khi rỗng. */
export function dayToIso(day: string, edge: 'from' | 'to'): string {
  if (!day) return '';
  const iso =
    edge === 'from'
      ? new Date(`${day}T00:00:00`)
      : new Date(`${day}T23:59:59.999`);
  return Number.isNaN(iso.getTime()) ? '' : iso.toISOString();
}

/** Nhãn ngắn cho chip "đang lọc": 01/10/2026. */
export function dayLabel(day: string): string {
  if (!day) return '';
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('vi-VN');
}
