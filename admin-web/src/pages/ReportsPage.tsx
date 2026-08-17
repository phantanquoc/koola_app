import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';

export default function ReportsPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  function load() { apiClient.get('/admin/reports', { params: { page, limit: 20, status: status || undefined } }).then(r => { setData(r.data.data ?? []); setTotal(r.data.total ?? 0); }).catch(() => {}); }
  useEffect(() => { load(); }, [page, status]);
  async function act(id: string, action: 'resolve' | 'dismiss') {
    try { await apiClient.post(`/admin/reports/${id}/${action}`); addToast('success', action === 'resolve' ? 'Đã giải quyết' : 'Đã bỏ qua'); load(); } catch { addToast('error', 'Thao tác thất bại'); }
  }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Kiểm duyệt" title="Báo cáo" description="Hộp thư báo cáo từ người dùng." />
      <TableShell title="Reports" actions={<select className="select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Lọc trạng thái"><option value="">Tất cả</option><option value="pending">pending</option><option value="resolved">resolved</option><option value="dismissed">dismissed</option></select>}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Lý do</th><th>Loại</th><th>Trạng thái</th><th>Hành động</th></tr></thead><tbody>{data.map((r: any) => (<tr key={r._id}><td>{r.reason}</td><td>{r.targetType}</td><td><span className="badge badge-muted">{r.status}</span></td><td><div className="table-actions"><button className="btn btn-primary btn-sm" onClick={() => act(r._id, 'resolve')} type="button">Resolve</button><button className="btn btn-secondary btn-sm" onClick={() => act(r._id, 'dismiss')} type="button">Dismiss</button></div></td></tr>))}</tbody></table></div>
        <Pagination page={page} totalPages={Math.ceil(total/20)} total={total} onPageChange={setPage} />
      </TableShell>
    </div>
  );
}
