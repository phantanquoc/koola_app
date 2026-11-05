import { useState } from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  label?: string;
  onPageChange: (p: number) => void;
  showGoto?: boolean;
  pageSize?: number;
  pageSizes?: number[];
  onPageSizeChange?: (n: number) => void;
}

/**
 * Footer phân trang. Luôn hiện khi có dữ liệu — kể cả một trang — để tổng số
 * và cỡ trang không biến mất (trước đây totalPages<=1 thì cả footer null).
 * Nút điều hướng tự disable khi chỉ có một trang.
 */
export function Pagination({
  page, totalPages, total, label, onPageChange, showGoto, pageSize, pageSizes, onPageSizeChange,
}: PaginationProps) {
  const [goto, setGoto] = useState('');
  if (total === 0) return null;

  const singlePage = totalPages <= 1;

  return (
    <div className="table-footer">
      <span className="pagination-info">
        {label ?? (singlePage
          ? `${total.toLocaleString('vi-VN')} hồ sơ`
          : `Trang ${page} / ${totalPages} · ${total.toLocaleString('vi-VN')} hồ sơ`)}
      </span>
      <div className="pagination-controls">
        {pageSize !== undefined && pageSizes && onPageSizeChange && (
          <select
            className="input input-sm pagination-size" value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Số dòng mỗi trang"
          >
            {pageSizes.map((s) => <option key={s} value={s}>{s}/trang</option>)}
          </select>
        )}
        {!singlePage && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} type="button" aria-label="Trang trước">‹ Trước</button>
            <span className="pagination-page" aria-current="page">{page} / {totalPages}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} type="button" aria-label="Trang sau">Sau ›</button>
            {showGoto && (
              <form className="pagination-goto" onSubmit={(e) => { e.preventDefault(); const n = Number(goto); if (n >= 1 && n <= totalPages) { onPageChange(n); setGoto(''); } }}>
                <input
                  className="input input-sm" value={goto} onChange={(e) => setGoto(e.target.value.replace(/\D/g, ''))}
                  placeholder="Đi tới" aria-label="Đi tới trang" inputMode="numeric" pattern="[0-9]*"
                />
                <button className="btn btn-ghost btn-sm" type="submit" aria-label="Đi">Đi</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
