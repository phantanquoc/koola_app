export function Pagination({ page, totalPages, total, label, onPageChange }: { page: number; totalPages: number; total: number; label?: string; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="table-footer">
      <span className="cell-meta">{label ?? `Trang ${page} / ${totalPages} · ${total.toLocaleString('vi-VN')}`}</span>
      <div className="pagination-controls">
        <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} type="button" aria-label="Trang trước">Trước</button>
        <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} type="button" aria-label="Trang sau">Sau</button>
      </div>
    </div>
  );
}
