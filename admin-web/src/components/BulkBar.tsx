export function BulkBar({
  count, names, onApprove, onReject, onAssign, onClear, busy,
}: {
  count: number;
  /** Tên vài hồ sơ đầu để moderator biết đang chọn nhầm ai. */
  names?: string[];
  onApprove: () => void;
  onReject: () => void;
  /** Nhận các hồ sơ đã chọn về mình (gán người phụ trách). */
  onAssign?: () => void;
  onClear: () => void;
  busy?: boolean;
}) {
  if (count === 0) return null;
  const preview = (names ?? []).slice(0, 3);
  const rest = count - preview.length;
  return (
    <div className="bulk-bar" role="toolbar" aria-label="Thao tác hàng loạt">
      <span className="badge badge-primary">{count} đã chọn</span>
      {preview.length > 0 && (
        <span className="cell-meta bulk-bar-names">
          {preview.join(' · ')}{rest > 0 ? ` · và ${rest} nữa` : ''}
        </span>
      )}
      <span className="bulk-bar-spacer" />
      {onAssign && (
        <button className="btn btn-secondary btn-sm" onClick={onAssign} disabled={busy} type="button">
          Nhận hồ sơ
        </button>
      )}
      <button className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy} type="button">Duyệt hàng loạt</button>
      <button className="btn btn-danger-ghost btn-sm" onClick={onReject} disabled={busy} type="button">Từ chối hàng loạt</button>
      <button className="btn btn-ghost btn-sm" onClick={onClear} disabled={busy} type="button">Bỏ chọn</button>
    </div>
  );
}
