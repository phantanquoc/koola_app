import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { useAdminList } from '../hooks/useAdminList';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { ReportDrawer, ReportTargetLink, type ReportItem } from '../components/ReportDrawer';
import apiClient from '../apiClient';

const LIMIT = 20;

export default function ReportsPage() {
  const { addToast } = useToast();
  const { values, set } = useUrlFilters({ status: '', targetType: '', page: '1' });
  const page = Math.max(1, Number(values.page) || 1);
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [acting, setActing] = useState(false);

  const { rows, total, isLoading, isError, refetch } = useAdminList<ReportItem>(
    ['reports', values.status, values.targetType, page],
    '/admin/reports',
    { page, limit: LIMIT, status: values.status || undefined, targetType: values.targetType || undefined },
  );

  async function act(id: string, action: 'resolve' | 'dismiss') {
    setActing(true);
    try {
      await apiClient.post(`/admin/reports/${id}/${action}`);
      addToast('success', action === 'resolve' ? 'Đã giải quyết' : 'Đã bỏ qua');
      setSelected(null);
      refetch();
    } catch {
      addToast('error', 'Thao tác thất bại');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Báo cáo" description="Hộp thư báo cáo từ người dùng." />
      <TableShell
        title="Reports"
        actions={
          <>
            <select
              className="select"
              value={values.targetType}
              onChange={(e) => set({ targetType: e.target.value, page: '1' })}
              aria-label="Lọc loại target"
            >
              <option value="">Mọi loại</option>
              <option value="message">message</option>
              <option value="story">story</option>
              <option value="user">user</option>
              <option value="conversation">conversation</option>
            </select>
            <select
              className="select"
              value={values.status}
              onChange={(e) => set({ status: e.target.value, page: '1' })}
              aria-label="Lọc trạng thái"
            >
              <option value="">Tất cả</option>
              <option value="pending">pending</option>
              <option value="resolved">resolved</option>
              <option value="dismissed">dismissed</option>
            </select>
          </>
        }
      >
        {isLoading && <div className="skeleton-card" aria-label="Đang tải báo cáo" />}
        {isError && (
          <StateBlock variant="empty" icon="!" title="Không tải được báo cáo" copy="Kiểm tra kết nối rồi thử lại.">
            <button className="btn btn-primary btn-sm" onClick={() => refetch()} type="button">
              Thử lại
            </button>
          </StateBlock>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState title="Không có báo cáo" copy="Hộp thư trống với bộ lọc hiện tại." />
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lý do</th>
                  <th>Target</th>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th className="col-actions">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td>{r.reason}</td>
                    <td>
                      <ReportTargetLink type={r.targetType} id={r.targetId} />
                    </td>
                    <td>{r.targetType}</td>
                    <td>
                      <span className="badge badge-muted">{r.status}</span>
                    </td>
                    <td className="col-actions">
                      <div className="table-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelected(r)}
                          type="button"
                        >
                          Xem
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => act(r._id, 'resolve')}
                          disabled={r.status !== 'pending'}
                          type="button"
                        >
                          Resolve
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => act(r._id, 'dismiss')}
                          disabled={r.status !== 'pending'}
                          type="button"
                        >
                          Dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={Math.ceil(total / LIMIT)}
          total={total}
          onPageChange={(p) => set({ page: String(p) })}
        />
      </TableShell>
      <ReportDrawer
        report={selected}
        onClose={() => setSelected(null)}
        onResolve={(id) => act(id, 'resolve')}
        onDismiss={(id) => act(id, 'dismiss')}
        busy={acting}
      />
    </div>
  );
}
