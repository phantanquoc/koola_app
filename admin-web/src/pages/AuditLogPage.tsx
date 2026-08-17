import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';

export default function AuditLogPage() {
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => { apiClient.get('/admin/audit-logs', { params: { page, limit: 20 } }).then(r => { setData(r.data.data ?? []); setTotal(r.data.total ?? 0); }).catch(() => {}); }, [page]);
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Vận hành" title="Audit log" description="Lịch sử thao tác quản trị." />
      <TableShell title="Audit logs">
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Thời gian</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>{data.map((a: any) => (<tr key={a._id}><td>{new Date(a.createdAt).toLocaleString('vi-VN')}</td><td className="k-mono">{a.actorId?.slice(0, 8)}</td><td>{a.action}</td><td>{a.targetType}:{a.targetId?.slice(0, 8)}</td></tr>))}</tbody></table></div>
        <Pagination page={page} totalPages={Math.ceil(total/20)} total={total} onPageChange={setPage} />
      </TableShell>
    </div>
  );
}
