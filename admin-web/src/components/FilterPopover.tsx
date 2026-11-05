import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';

interface FilterPopoverProps {
  /** Số điều kiện đang bật — hiện trên nút để không phải mở ra mới biết. */
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  label?: string;
}

/**
 * Nút "Bộ lọc" mở panel neo dưới nút, render qua portal.
 *
 * Lý do có component này thay vì nhét hết filter vào một hàng: 6 điều kiện trên
 * một hàng sẽ wrap thành 2–3 dòng, đẩy bảng xuống và trộn ô search với ô ngày.
 * Mẫu: một ô tìm kiếm chính + panel cho phần còn lại + chip cho điều kiện đang bật.
 *
 * Portal vì `.table-shell`/`.page-stack` có thể tạo containing block hoặc cắt
 * overflow — panel đặt trong flow sẽ bị cắt ở mép.
 */
export function FilterPopover({ activeCount, onClear, children, label = 'Bộ lọc' }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // Rộng cố định 380px (khớp .filter-panel); kẹp vào viewport để không tràn.
    setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.right - 380, window.innerWidth - 392)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (document.getElementById('filter-panel')?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
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
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`btn btn-secondary btn-sm filter-toggle${open ? ' filter-toggle--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="filter-panel"
      >
        <SlidersHorizontal size={14} aria-hidden />
        {label}
        {activeCount > 0 && <span className="filter-toggle-count">{activeCount}</span>}
      </button>

      {open && pos && createPortal(
        <div
          id="filter-panel"
          className="filter-panel"
          role="group"
          aria-label="Bộ lọc nâng cao"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
        >
          <div className="filter-panel-head">
            <span className="filter-panel-title">{label}</span>
            <div className="filter-panel-head-actions">
              {activeCount > 0 && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={onClear}>
                  Xoá tất cả
                </button>
              )}
              <button
                className="btn btn-ghost btn-icon btn-sm" type="button"
                onClick={() => setOpen(false)} aria-label="Đóng bộ lọc"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          </div>
          <div className="filter-panel-body">{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
