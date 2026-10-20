export function BulkBar({ count, onApprove, onReject, busy }: { count: number; onApprove: () => void; onReject: () => void; busy?: boolean }) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar" role="toolbar" aria-label="Thao tác hàng loạt">
      <span className="badge badge-primary">{count} đã chọn</span>
      <button className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy} type="button">Duyệt hàng loạt</button>
      <button className="btn btn-danger-ghost btn-sm" onClick={onReject} disabled={busy} type="button">Từ chối hàng loạt</button>
    </div>
  );
}
