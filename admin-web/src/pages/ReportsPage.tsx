import { useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { ExportButton } from '../components/ExportButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
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

/** Dòng export từ server: chỉ cột của collection Report, không join PII người báo. */
interface ReportExportRow {
  _id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
}

/** Escape ô CSV: dấu phẩy, nháy kép, xuống dòng đều phải bọc nháy. */
function toCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ReportsPage() {
  const { addToast } = useToast();
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

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** Xuất đúng tập đang lọc; cap 500 dòng do server áp. */
  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiClient.get<{
        data: ReportExportRow[];
        total: number;
        truncated: boolean;
      }>('/admin/reports/export', {
        params: {
          status: values.status || undefined,
          targetType: values.targetType || undefined,
          limit: 500,
        },
      });
      if (res.data.truncated) {
        addToast('warning', `Xuất 500/${res.data.total} báo cáo đầu tiên. Thu hẹp bộ lọc để xuất hết.`);
      }
      const header = [
        'ID', 'Người báo cáo', 'Loại đối tượng', 'ID đối tượng', 'Lý do',
        'Trạng thái', 'Người xử lý', 'Xử lý lúc', 'Thời gian báo cáo',
      ];
      const lines = res.data.data.map((r) =>
        [
          r._id, r.reporterId, reportTargetLabel(r.targetType), r.targetId, r.reason,
          reportStatusLabel(r.status), r.resolvedBy ?? '', r.resolvedAt ?? '', r.createdAt ?? '',
        ].map(toCsvCell).join(','),
      );
      // BOM để Excel đọc đúng tiếng Việt.
      const blob = new Blob([`\uFEFF${[header.join(','), ...lines].join('\n')}`], {
        type: 'text/csv;charset=utf-8',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bao-cao-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast('success', `Đã xuất ${lines.length} báo cáo CSV.`);
      setExportOpen(false);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Xuất CSV thất bại. Vui lòng thử lại.'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-stack">
      <ListHeader
        title="Báo cáo"
        count={total}
        actions={
          <>
            <ExportButton onExport={() => setExportOpen(true)} />
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Làm mới</button>
          </>
        }
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

      <ConfirmDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`Xuất ${total.toLocaleString('vi-VN')} báo cáo ra CSV?`}
        description="File chứa mã người báo cáo và mã đối tượng — đối chiếu pháp lý, không chia sẻ ra ngoài. Tối đa 500 dòng."
        confirmLabel={exporting ? 'Đang xuất...' : 'Xuất CSV'}
        variant="primary"
        busy={exporting}
        onConfirm={() => void handleExport()}
      />
    </div>
  );
}
