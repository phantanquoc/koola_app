export function BulkBar({ count, onApprove, onReject, busy }: { count: number; onApprove: () => void; onReject: () => void; busy?: boolean }) {
  if (count === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-5)', background: 'var(--koola-primary-soft)', borderBottom: '1px solid var(--koola-line)' }}>
      <span className="badge badge-primary">{count} đã chọn</span>
      <button className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy} type="button">Duyệt hàng loạt</button>
      <button className="btn btn-danger-ghost btn-sm" onClick={onReject} disabled={busy} type="button">Từ chối hàng loạt</button>
    </div>
  );
}
