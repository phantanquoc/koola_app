import Dialog from './Dialog';
export function ConfirmDialog({ open, onClose, title, description, confirmLabel, onConfirm, busy, variant = 'danger' }: { open: boolean; onClose: () => void; title: string; description?: string; confirmLabel?: string; onConfirm: () => void; busy?: boolean; variant?: 'danger' | 'primary' }) {
  return (
    <Dialog open={open} onClose={onClose} labelId="confirm-dialog-title" variant="dialog">
      <div className="dialog">
        <div className="dialog-header"><div><h2 id="confirm-dialog-title" className="panel-title">{title}</h2>{description && <p className="panel-subtitle">{description}</p>}</div></div>
        <div className="dialog-body"><div className="table-actions"><button className={variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm} disabled={busy} type="button">{busy ? 'Đang xử lý...' : (confirmLabel ?? 'Xác nhận')}</button><button className="btn btn-secondary" onClick={onClose} disabled={busy} type="button">Hủy</button></div></div>
      </div>
    </Dialog>
  );
}
