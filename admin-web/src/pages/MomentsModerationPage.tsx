import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';

export default function MomentsModerationPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => { apiClient.get('/admin/stories', { params: { page, limit: 20 } }).then(r => { setData(r.data.data ?? []); setTotal(r.data.total ?? 0); }).catch(() => {}); }, [page]);
  async function takedown(id: string) { try { await apiClient.post(`/admin/stories/${id}/takedown`); addToast('success', 'Đã gỡ story'); } catch { addToast('error', 'Thao tác thất bại'); } }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Kiểm duyệt" title="Moments" description="Duyệt và gỡ story vi phạm." />
      <TableShell title="Stories">
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Author</th><th>Caption</th><th>Hoạt động</th><th>Hành động</th></tr></thead><tbody>{data.map((s: any) => (<tr key={s._id}><td>{s.authorId}</td><td>{s.caption?.slice(0, 60)}</td><td>{s.isActive ? 'active' : 'hidden'}</td><td><button className="btn btn-danger-ghost btn-sm" onClick={() => takedown(s._id)} type="button">Gỡ</button></td></tr>))}</tbody></table></div>
        <Pagination page={page} totalPages={Math.ceil(total/20)} total={total} onPageChange={setPage} />
      </TableShell>
    </div>
  );
}
