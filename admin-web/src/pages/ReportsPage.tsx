import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime, apiErrorMessage } from '../components/formatters';
import {
  REPORT_TARGET_LABELS,
  REPORT_STATUS_LABELS,
  reportStatusLabel,
  reportStatusTone,
  reportTargetLabel,
} from '../components/report-labels';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';

export interface ReportItem {
  _id: string;
  reporterId: string;
  reporterName?: string;
  targetType: string;
  targetId: string;
  /** Tên/nội dung ngắn của đối tượng bị báo cáo, resolve ở server. */
  targetName?: string;
  /** Dòng phụ: người gửi tin nhắn, số thành viên… */
  targetDetail?: string;
  reason: string;
  status: string;
  resolvedByName?: string;
  resolvedAt?: string | null;
  createdAt?: string;
}

const PAGE_SIZES = [20, 50];

export default function ReportsPage() {
  const { values, set, reset } = useUrlFilters({
    status: '', targetType: '', page: '1', pageSize: '20',
  });
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<ReportItem>(
    ['reports', values.status, values.targetType, page, pageSize],
    '/admin/reports',
    {
      page,
      limit: pageSize,
      status: values.status || undefined,
      targetType: values.targetType || undefined,
    },
  );

  const hasActiveFilter = Boolean(values.status || values.targetType);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page-stack">
      <ListHeader
        title="Báo cáo"
        count={total}
        actions={<button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Làm mới</button>}
      >
        <select
          className="select" value={values.targetType}
          onChange={(e) => set({ targetType: e.target.value, page: '1' })}
          aria-label="Lọc loại đối tượng"
        >
          <option value="">Mọi đối tượng</option>
          {Object.entries(REPORT_TARGET_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select
          className="select" value={values.status}
          onChange={(e) => set({ status: e.target.value, page: '1' })}
          aria-label="Lọc trạng thái"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(REPORT_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </ListHeader>

      {hasActiveFilter && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {values.targetType && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ targetType: '', page: '1' })}>
              {reportTargetLabel(values.targetType)} ✕
            </button>
          )}
          {values.status && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ status: '', page: '1' })}>
              {reportStatusLabel(values.status)} ✕
            </button>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={reset}>Xoá bộ lọc</button>
        </div>
      )}

      <TableShell>
        {isError && (
          <StateBlock variant="error" title="Không tải được báo cáo" copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}>
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && <StateBlock variant="loading" title="Đang tải báo cáo" copy="Đang lấy hộp thư báo cáo." />}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Hộp thư báo cáo">
              <thead>
                <tr>
                  <th scope="col">Đối tượng bị báo cáo</th>
                  <th scope="col">Lý do</th>
                  <th scope="col" className="col-hide-mobile">Người báo cáo</th>
                  <th scope="col" className="col-hide-xxs">Trạng thái</th>
                  <th scope="col" className="col-hide-xs">Thời gian</th>
                  <th scope="col" className="th-center col-sticky">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title={hasActiveFilter ? 'Không khớp báo cáo nào' : 'Hộp thư trống'}
                        copy={hasActiveFilter
                          ? 'Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm.'
                          : 'Chưa có người dùng nào gửi báo cáo.'}
                        action={hasActiveFilter ? <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>Xoá bộ lọc</button> : undefined}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td>
                      {/* Tên đối tượng do server resolve. Không có tên nghĩa là
                          đối tượng đã bị xoá / dữ liệu cũ — nói thẳng, đừng dán
                          nhãn "Xem tin nhắn" cho một link dẫn tới trang báo cáo. */}
                      {r.targetName
                        ? <Link className="cell-link" to={`/reports/${r._id}`}>{r.targetName}</Link>
                        : <span className="cell-meta">Đối tượng không còn tồn tại</span>}
                      <div className="cell-meta">
                        {reportTargetLabel(r.targetType)}
                        {r.targetDetail && <span> · {r.targetDetail}</span>}
                      </div>
                      {/* Cột "Thời gian" ẩn từ ≤1099px, "Trạng thái" ẩn từ ≤560px
                          — dồn cả hai xuống dòng meta để không mất dữ liệu. */}
                      <div className="cell-meta show-under-1100">{formatDateTime(r.createdAt)}</div>
                      <div className="cell-meta show-xs">
                        <StatusBadge tone={reportStatusTone(r.status)} label={reportStatusLabel(r.status)} />
                      </div>
                    </td>
                    <td><span className="cell-title">{r.reason}</span></td>
                    <td className="col-hide-mobile">{r.reporterName ?? <span className="cell-meta">Không xác định</span>}</td>
                    <td className="col-hide-xxs">
                      <StatusBadge tone={reportStatusTone(r.status)} label={reportStatusLabel(r.status)} />
                      {r.status !== 'pending' && r.resolvedByName && (
                        <div className="cell-meta">bởi {r.resolvedByName}</div>
                      )}
                    </td>
                    <td className="col-hide-xs">
                      <span className="cell-date k-mono">{formatDateTime(r.createdAt)}</span>
                    </td>
                    <td className="col-sticky">
                      <div className="table-actions table-actions--end">
                        <Link
                          className="btn btn-secondary btn-sm"
                          to={`/reports/${r._id}`}
                          aria-label={`Xem báo cáo ${r.reason}`}
                        >
                          Xem
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
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
