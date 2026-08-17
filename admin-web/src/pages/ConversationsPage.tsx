import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';

export default function ConversationsPage() {
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  useEffect(() => {
    apiClient.get('/admin/conversations', { params: { page, limit: 20, search: search || undefined } }).then(r => { setData(r.data.data ?? []); setTotal(r.data.total ?? 0); }).catch(() => {});
  }, [page, search]);
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Kiểm duyệt" title="Hội thoại" description="Danh sách hội thoại với tìm kiếm và xem chi tiết." />
      <TableShell title="Conversations" actions={<input className="input" placeholder="Tìm tên/topic" value={search} onChange={e => setSearch(e.target.value)} aria-label="Tìm hội thoại" style={{ width: 260 }} />}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Tên</th><th>Loại</th><th>Thành viên</th></tr></thead><tbody>{data.map((c: any) => (<tr key={c._id}><td>{c.name ?? c._id}</td><td>{c.type}</td><td>{c.members?.length ?? 0}</td></tr>))}</tbody></table></div>
        <Pagination page={page} totalPages={Math.ceil(total / 20)} total={total} onPageChange={setPage} />
      </TableShell>
    </div>
  );
}
