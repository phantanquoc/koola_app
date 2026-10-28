import { isoToDay, dayToIso } from './date-range';

/**
 * Hai ô ngày cho dialog export — dùng `<input type="date">` native.
 *
 * Vì sao không phải date-picker tự viết: ô native có sẵn bàn phím, lịch, định
 * dạng theo locale và hỗ trợ trình đọc màn hình; thay bằng widget tự làm chỉ để
 * đổi giao diện là mất cả ba thứ đó.
 *
 * `value` là ISO (khớp query param), `onChange` trả ISO; '' = bỏ lọc.
 */
export function ExportDateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (patch: { from?: string; to?: string }) => void;
}) {
  return (
    <div className="form-field">
      <span className="form-label">Khoảng ngày tạo</span>
      <div className="export-date-row">
        <input
          className="input input-sm"
          type="date"
          value={isoToDay(from)}
          max={isoToDay(to) || undefined}
          onChange={(e) => onChange({ from: dayToIso(e.target.value, 'from') })}
          aria-label="Từ ngày"
        />
        <input
          className="input input-sm"
          type="date"
          value={isoToDay(to)}
          min={isoToDay(from) || undefined}
          onChange={(e) => onChange({ to: dayToIso(e.target.value, 'to') })}
          aria-label="Đến ngày"
        />
        {(from || to) && (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => onChange({ from: '', to: '' })}
          >
            Bỏ khoảng ngày
          </button>
        )}
      </div>
      <span className="cell-meta">
        Để trống = mọi thời điểm. Tính cả hai đầu ngày.
      </span>
    </div>
  );
}
