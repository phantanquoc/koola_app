import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from 'lucide-react';

export interface ColumnFilterOption {
  value: string;
  /** Nhãn hiển thị; value="" là "tất cả" */
  label: string;
}

interface ColumnHeaderProps {
  label: string;
  /** Field gửi lên server, dạng createdAt. Bỏ trống = cột không sort được. */
  sortField?: string;
  /** Giá trị sort hiện tại dạng `field:asc` */
  sort?: string;
  onSort?: (field: string) => void;
  /** Cột lọc được: mở popover chọn giá trị */
  filter?: {
    value: string;
    options: ColumnFilterOption[];
    onChange: (value: string) => void;
  };
  className?: string;
  align?: 'left' | 'center';
}

/**
 * Header cột kiểu bảng quản trị: nhãn uppercase + nút sort có icon trạng thái
 * (mũi tên khi đang sort, chevrons khi chưa) + nút phễu cho cột lọc được.
 *
 * Trả về <th> nên phải là con trực tiếp của <tr>.
 */
export function ColumnHeader({
  label, sortField, sort, onSort, filter, className, align = 'left',
}: ColumnHeaderProps) {
  const [active, dir] = (sort ?? '').split(':');
  const isSorted = Boolean(sortField) && active === sortField;
  const ariaSort: 'ascending' | 'descending' | 'none' =
    isSorted ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popId = `th-filter-${label.replace(/\s+/g, '-')}`;

  // Popover render qua portal: .table-scroll có overflow-x:auto nên popover
  // đặt trong <th> sẽ bị cắt. Tính vị trí từ nút phễu.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 210) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const pop = document.getElementById(popId);
      if (pop?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Vị trí tính 1 lần lúc mở — cuộn/resize thì đóng thay vì trôi khỏi nút
    function onMove() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, popId]);

  const SortIcon = !isSorted ? ChevronsUpDown : dir === 'desc' ? ArrowDown : ArrowUp;

  return (
    <th
      scope="col"
      aria-sort={sortField ? ariaSort : undefined}
      className={[className, align === 'center' ? 'th-center' : ''].filter(Boolean).join(' ') || undefined}
    >
      <div className="th-inner">
        {sortField && onSort ? (
          <button
            type="button"
            className={`th-sort${isSorted ? ' th-sort--active' : ''}`}
            onClick={() => onSort(sortField)}
            title={`Sắp xếp theo ${label}`}
          >
            <span>{label}</span>
            <SortIcon size={13} className="th-sort-icon" aria-hidden />
          </button>
        ) : (
          <span className="th-label">{label}</span>
        )}

        {filter && (
          <div className="th-filter">
            <button
              ref={btnRef}
              type="button"
              className={`th-filter-btn${filter.value ? ' th-filter-btn--active' : ''}`}
              onClick={() => setOpen((o) => !o)}
              aria-label={`Lọc theo ${label}`}
              aria-expanded={open}
              title={`Lọc theo ${label}`}
            >
              <Filter size={12} aria-hidden />
            </button>
            {open && pos && createPortal(
              <div
                id={popId}
                className="th-filter-pop"
                role="group"
                aria-label={`Lọc theo ${label}`}
                style={{ position: 'fixed', top: pos.top, left: pos.left }}
              >
                {filter.options.map((o) => (
                  <button
                    key={o.value || 'all'}
                    type="button"
                    className={`th-filter-option${filter.value === o.value ? ' th-filter-option--active' : ''}`}
                    onClick={() => { filter.onChange(o.value); setOpen(false); }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>,
              document.body,
            )}
          </div>
        )}
      </div>
    </th>
  );
}
