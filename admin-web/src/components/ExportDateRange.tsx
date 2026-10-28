import { isoToDay, dayToIso, dayLabel } from './date-range';

/**
 * Chọn khoảng ngày cho dialog export.
 *
 * Ba lớp, theo thứ tự người ta thật sự thao tác:
 * 1. **Preset** — 90% trường hợp là "7 ngày qua" / "tháng này", gõ tay hai ô ngày
 *    cho việc đó là bắt người dùng làm việc của máy.
 * 2. **Hai ô ngày native** — cho khoảng tuỳ ý. Không tự viết date-picker: ô native
 *    có bàn phím, lịch, locale và trình đọc màn hình sẵn.
 * 3. **Câu tóm tắt** — nói lại phạm vi bằng lời, vì hai ô `dd/mm/yyyy` cạnh nhau
 *    không trả lời được "file này có bao nhiêu ngày".
 *
 * `value` là ISO (khớp query param), `onChange` trả ISO; '' = bỏ lọc.
 */

const PRESETS: { key: string; label: string; days: number | 'month' }[] = [
  { key: 'today', label: 'Hôm nay', days: 1 },
  { key: '7d', label: '7 ngày', days: 7 },
  { key: '30d', label: '30 ngày', days: 30 },
  { key: 'month', label: 'Tháng này', days: 'month' },
];

function presetRange(days: number | 'month'): { from: string; to: string } {
  const today = new Date();
  if (days === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      from: dayToIso(isoToDay(first.toISOString()), 'from'),
      to: dayToIso(isoToDay(today.toISOString()), 'to'),
    };
  }
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return {
    from: dayToIso(isoToDay(start.toISOString()), 'from'),
    to: dayToIso(isoToDay(today.toISOString()), 'to'),
  };
}

/** Số ngày bao gồm cả hai đầu; null khi chưa đủ hai mốc. */
function spanDays(from: string, to: string): number | null {
  const a = isoToDay(from);
  const b = isoToDay(to);
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 86_400_000) + 1;
}

export function ExportDateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (patch: { from?: string; to?: string }) => void;
}) {
  const days = spanDays(from, to);
  const invalid = days !== null && days <= 0;

  const summary =
    !from && !to
      ? 'Mọi thời điểm'
      : from && to
        ? invalid
          ? 'Khoảng ngày ngược — ngày bắt đầu phải trước ngày kết thúc'
          : `${dayLabel(isoToDay(from))} → ${dayLabel(isoToDay(to))} · ${days} ngày`
        : from
          ? `Từ ${dayLabel(isoToDay(from))} tới nay`
          : `Tới ${dayLabel(isoToDay(to))}`;

  return (
    <div className="form-field export-range">
      <span className="form-label">Khoảng ngày tạo</span>

      <div className="export-range-presets" role="group" aria-label="Chọn nhanh khoảng ngày">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => onChange(presetRange(p.days))}
          >
            {p.label}
          </button>
        ))}
        {(from || to) && (
          <button
            className="btn btn-ghost btn-sm export-range-clear"
            type="button"
            onClick={() => onChange({ from: '', to: '' })}
          >
            Bỏ khoảng ngày
          </button>
        )}
      </div>

      <div className="export-date-row">
        <input
          className="input input-sm"
          type="date"
          value={isoToDay(from)}
          max={isoToDay(to) || undefined}
          onChange={(e) => onChange({ from: dayToIso(e.target.value, 'from') })}
          aria-label="Từ ngày"
        />
        <span className="cell-meta" aria-hidden>
          →
        </span>
        <input
          className="input input-sm"
          type="date"
          value={isoToDay(to)}
          min={isoToDay(from) || undefined}
          onChange={(e) => onChange({ to: dayToIso(e.target.value, 'to') })}
          aria-label="Đến ngày"
        />
      </div>

      <span className={invalid ? 'cell-meta form-error' : 'cell-meta'} role={invalid ? 'alert' : undefined}>
        {summary}
        {!invalid && ' — để trống = mọi thời điểm, tính cả hai đầu ngày.'}
      </span>
    </div>
  );
}
