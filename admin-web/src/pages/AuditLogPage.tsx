import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Eye, Search } from 'lucide-react';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { FilterPopover } from '../components/FilterPopover';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { apiErrorMessage, formatDateTime } from '../components/formatters';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_LABELS,
  auditActionLabel,
  auditActionTone,
  auditTargetIds,
  auditTargetLabel,
  isInternalIp,
  normalizeIp,
} from '../components/audit-labels';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';
import type { AuditLogEntry } from '../components/AuditLogDetail';

interface AuditLog extends AuditLogEntry {
  targetName?: string;
}

const PAGE_SIZES = [20, 50, 100];

function isoToDay(iso: string) {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Nhãn ngày cho chip: 'YYYY-MM-DD' → '31/10/2026'.
 *
 * Cắt chuỗi chứ không qua `new Date()`: `to` lưu dạng 23:59:59.999Z, đổi sang
 * giờ máy (UTC+7) thành 06:59 ngày hôm sau → chip hiện lệch một ngày so với ô
 * ngày người dùng vừa chọn.
 */
function dayLabel(iso: string) {
  const day = isoToDay(iso);
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}/${m}/${y}` : day;
}

/** Link sang đối tượng bị tác động — chỉ user/business tra được theo id. */
function TargetLink({ type, id }: { type: string; id: string }) {
  const path = type === 'user' ? '/users' : type === 'business' ? '/businesses' : null;
  // Không resolve được tên (hồ sơ đã xoá cứng, target không phải user/business):
  // hiện nhãn thay vì ObjectId — mã đầy đủ nằm trong trang chi tiết.
  if (!path) return <span>Không xác định</span>;
  return (
    <Link className="cell-link" to={`${path}?search=${encodeURIComponent(id)}`}>
      Xem đối tượng
    </Link>
  );
}

export default function AuditLogPage() {
  const { values, set, reset } = useUrlFilters({
    q: '', action: '', targetType: '', from: '', to: '', sort: '', page: '1', pageSize: '20',
  });
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const sort = values.sort === 'createdAt:asc' ? 'createdAt:asc' : 'createdAt:desc';

  const params = useMemo(() => ({
    page,
    limit: pageSize,
    q: values.q || undefined,
    action: values.action || undefined,
    targetType: values.targetType || undefined,
    from: values.from || undefined,
    to: values.to || undefined,
    sort,
  }), [page, pageSize, values.q, values.action, values.targetType, values.from, values.to, sort]);

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<AuditLog>(
    ['audit-logs', values.q, values.action, values.targetType, values.from, values.to, sort, page, pageSize],
    '/admin/audit-logs',
    params,
  );
  const navigate = useNavigate();
  const location = useLocation();

  // Ô tìm kiếm debounce: gõ tới đâu lọc tới đó, không bắt bấm Enter.
  const [searchInput, setSearchInput] = useState(values.q);
  useEffect(() => setSearchInput(values.q), [values.q]);
  useEffect(() => {
    if (searchInput.trim() === values.q) return;
    const t = setTimeout(() => set({ q: searchInput.trim(), page: '1' }), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  /** Mở chi tiết bằng route riêng: deep-link được, back giữ nguyên filter list. */
  function openDetail(id: string) {
    navigate(`/audit-logs/${id}`, { state: { from: `${location.pathname}${location.search}` } });
  }

  // `q` không tính là "bộ lọc nâng cao" — nó là ô tìm kiếm chính.
  // Khoảng ngày tính là MỘT điều kiện (khớp một chip), không phải hai — badge
  // lệch với số chip đang hiện là loại lỗi khiến người dùng mất tin vào bộ lọc.
  const advancedCount =
    (values.action ? 1 : 0)
    + (values.targetType ? 1 : 0)
    + (values.from || values.to ? 1 : 0);
  const hasActiveFilter = Boolean(values.q || advancedCount);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const loadError = apiErrorMessage(error, 'Không tải được audit log.');

  // `type="date"` chỉ nói ngày; biên dưới lấy 00:00, biên trên 23:59:59.999 để
  // "đến hôm nay" bao trọn hôm nay chứ không cắt ở nửa đêm.
  function setDay(key: 'from' | 'to', day: string) {
    if (!day) return set({ [key]: '', page: '1' });
    const iso = key === 'from'
      ? new Date(`${day}T00:00:00`).toISOString()
      : new Date(`${day}T23:59:59.999`).toISOString();
    set({ [key]: iso, page: '1' });
  }

  const actionOptions = Object.entries(AUDIT_ACTION_LABELS)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));

  return (
    <div className="page-stack">
      <ListHeader
        title="Audit log"
        count={total}
        actions={<button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Làm mới</button>}
      >
        <div className="filter-search-wrap">
          <Search size={15} className="filter-search-icon" aria-hidden />
          <input
            className="input filter-search filter-search--icon" type="search" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') set({ q: searchInput.trim(), page: '1' }); }}
            placeholder="Tìm người thao tác hoặc mã đối tượng"
            aria-label="Tìm người thao tác hoặc mã đối tượng"
          />
        </div>

        <FilterPopover
          activeCount={advancedCount}
          onClear={() => set({ action: '', targetType: '', from: '', to: '', page: '1' })}
        >
          <label className="form-field">
            <span className="form-label">Hành động</span>
            <select
              className="select" value={values.action}
              onChange={(e) => set({ action: e.target.value, page: '1' })}
            >
              <option value="">Mọi hành động</option>
              {actionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="form-field">
            <span className="form-label">Loại đối tượng</span>
            <select
              className="select" value={values.targetType}
              onChange={(e) => set({ targetType: e.target.value, page: '1' })}
            >
              <option value="">Mọi đối tượng</option>
              {Object.entries(AUDIT_TARGET_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>

          <div className="form-field">
            <span className="form-label">Khoảng thời gian</span>
            <div className="filter-date-range">
              <input
                className="input input-sm" type="date" value={isoToDay(values.from)}
                onChange={(e) => setDay('from', e.target.value)} aria-label="Từ ngày"
              />
              <span className="cell-meta" aria-hidden>→</span>
              <input
                className="input input-sm" type="date" value={isoToDay(values.to)}
                onChange={(e) => setDay('to', e.target.value)} aria-label="Đến ngày"
              />
            </div>
          </div>
        </FilterPopover>
      </ListHeader>

      {hasActiveFilter && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {values.action && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ action: '', page: '1' })}>
              {auditActionLabel(values.action)} ✕
            </button>
          )}
          {values.targetType && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ targetType: '', page: '1' })}>
              {auditTargetLabel(values.targetType)} ✕
            </button>
          )}
          {(values.from || values.to) && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ from: '', to: '', page: '1' })}>
              {values.from ? dayLabel(values.from) : '…'} → {values.to ? dayLabel(values.to) : '…'} ✕
            </button>
          )}
          {values.q && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ q: '', page: '1' })}>
              Từ khoá: {values.q} ✕
            </button>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={reset}>Xoá bộ lọc</button>
        </div>
      )}

      <TableShell>
        {isError && (
          <StateBlock variant="error" title="Không tải được audit log" copy={loadError}>
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && <StateBlock variant="loading" title="Đang tải audit log" copy="Đang lấy lịch sử thao tác quản trị." />}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Lịch sử thao tác quản trị">
              <thead>
                <tr>
                  <th scope="col" aria-sort={sort === 'createdAt:asc' ? 'ascending' : 'descending'}>
                    <div className="th-inner">
                      <button
                        type="button"
                        className="th-sort th-sort--active"
                        onClick={() => set({ sort: sort === 'createdAt:asc' ? 'createdAt:desc' : 'createdAt:asc', page: '1' })}
                        title={sort === 'createdAt:asc' ? 'Đang xếp cũ nhất trước — bấm để mới nhất trước' : 'Đang xếp mới nhất trước — bấm để cũ nhất trước'}
                      >
                        <span>Thời gian</span>
                        {sort === 'createdAt:asc'
                          ? <ArrowUp size={13} className="th-sort-icon" aria-hidden />
                          : <ArrowDown size={13} className="th-sort-icon" aria-hidden />}
                      </button>
                    </div>
                  </th>
                  <th scope="col" className="col-hide-xs">Người thao tác</th>
                  <th scope="col">Hành động</th>
                  <th scope="col" className="col-hide-mobile">Đối tượng</th>
                  <th scope="col" className="col-hide-mobile">IP truy cập</th>
                  <th scope="col" className="th-center col-sticky">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title={hasActiveFilter ? 'Không khớp thao tác nào' : 'Chưa có thao tác quản trị'}
                        copy={hasActiveFilter
                          ? 'Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm.'
                          : 'Mọi thao tác của moderator sẽ được ghi ở đây.'}
                        action={hasActiveFilter ? <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>Xoá bộ lọc</button> : undefined}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((a) => {
                  const ids = auditTargetIds(a.targetId);
                  const isBulk = ids.length > 1;
                  return (
                    <tr
                      key={a._id}
                      onClick={(e) => {
                        // Bấm link đối tượng thì đi tới đối tượng, không mở chi tiết log.
                        if ((e.target as HTMLElement).closest('a,button')) return;
                        openDetail(a._id);
                      }}
                    >
                      <td>
                        <span className="cell-date k-mono">{formatDateTime(a.createdAt)}</span>
                        {/* Cột "Người thao tác" ẩn từ ≤1099px — tên xuống đây để
                            vẫn đọc được ai làm, không phải vuốt ngang. */}
                        <div className="cell-meta show-under-1100">{a.actorName ?? 'Không xác định'}</div>
                      </td>
                      <td className="col-hide-xs">
                        <div className="cell-title">{a.actorName ?? 'Không xác định'}</div>
                      </td>
                      <td>
                        <StatusBadge tone={auditActionTone(a.action)} label={auditActionLabel(a.action)} />
                        {/* Action lạ (backend thêm mà FE chưa cập nhật map) vẫn
                            phải đọc được mã gốc — im lặng là mất dấu. */}
                        {!AUDIT_ACTION_LABELS[a.action] && <div className="cell-meta k-mono">{a.action}</div>}
                      </td>
                      <td className="col-hide-mobile">
                        <div className="cell-title">{auditTargetLabel(a.targetType)}</div>
                        <div className="cell-meta">
                          {isBulk
                            ? <>{ids.length} đối tượng{a.targetName ? ` · ${a.targetName}` : ''}</>
                            : a.targetName ?? <TargetLink type={a.targetType} id={a.targetId} />}
                        </div>
                      </td>
                      {/* IP nội bộ (dev/docker) không nói lên điều gì — hiện "—"
                          thay vì chuỗi ::ffff:192.168… gây rối. */}
                      <td className="col-hide-mobile">
                        <span className="cell-meta k-mono">
                          {isInternalIp(a.ip) ? '—' : normalizeIp(a.ip ?? '')}
                        </span>
                      </td>
                      <td className="col-sticky">
                        <div className="table-actions table-actions--end">
                          <button
                            className="btn btn-ghost btn-icon" type="button"
                            onClick={(e) => { e.stopPropagation(); openDetail(a._id); }}
                            aria-label={`Xem chi tiết ${auditActionLabel(a.action)}`} title="Chi tiết"
                          >
                            <Eye size={16} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page} totalPages={totalPages} total={total}
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>
    </div>
  );
}
