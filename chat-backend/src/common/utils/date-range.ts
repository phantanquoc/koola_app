import type { QueryFilter } from 'mongoose';

/**
 * Thêm điều kiện `createdAt` từ khoảng ngày vào filter Mongo.
 *
 * Ba điểm không hiển nhiên, mỗi điểm từng là bug ở đâu đó trong repo:
 *
 * 1. **Chỉ thêm key khi có giá trị.** `{ createdAt: { $gte: undefined } }` không
 *    bị Mongo bỏ qua — nó khớp theo kiểu BSON và có thể trả rỗng tuỳ phiên bản.
 *    Truyền `{}` thì `$match` coi như không lọc.
 * 2. **Tính cả biên** (`$gte`/`$lte`) như `reports/export` và `ops-log` đang làm.
 *    Người dùng chọn "đến 31/10" phải thấy dữ liệu của 31/10.
 * 3. **Không đụng field khác.** `createdAt` có thể đã bị filter khác đặt (ví dụ
 *    tab SLA) — ghi đè là mất điều kiện cũ. Ở đây merge, không replace.
 */
export function applyCreatedAtRange<T>(
  filter: QueryFilter<T> | Record<string, unknown>,
  from?: string | null,
  to?: string | null,
): void {
  const range: Record<string, Date> = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) range.$lte = d;
  }
  if (Object.keys(range).length === 0) return;

  const target = filter as Record<string, unknown>;
  const current = target.createdAt;
  target.createdAt =
    current && typeof current === 'object' && !(current instanceof Date)
      ? { ...(current as Record<string, unknown>), ...range }
      : range;
}
