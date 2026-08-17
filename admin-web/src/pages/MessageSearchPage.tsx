import { useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';

export default function MessageSearchPage() {
  const { addToast } = useToast();
  const [q, setQ] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  async function search() {
    if (!q.trim()) return;
    try { const r = await apiClient.get('/admin/messages/search', { params: { q, page, limit: 20 } }); setData(r.data.data ?? []); setTotal(r.data.total ?? 0); } catch { addToast('error', 'Tìm kiếm thất bại'); }
  }
  async function softDelete(id: string) {
    try { await apiClient.post(`/admin/messages/${id}/soft-delete`); addToast('success', 'Đã xóa mềm'); setData(d => d.filter(m => m._id !== id)); } catch { addToast('error', 'Xóa thất bại'); }
  }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Kiểm duyệt" title="Tin nhắn" description="Tìm kiếm xuyên hội thoại và xóa mềm nội dung vi phạm." />
      <TableShell title="Tìm kiếm" actions={<><input className="input" placeholder="Từ khóa q (bắt buộc)" value={q} onChange={e => setQ(e.target.value)} aria-label="Từ khóa tin nhắn" style={{ width: 300 }} /><button className="btn btn-primary" onClick={search} type="button">Tìm</button></>}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Nội dung</th><th>Hội thoại</th><th>Người gửi</th><th>Hành động</th></tr></thead><tbody>{data.map((m: any) => (<tr key={m._id}><td>{m.content?.slice(0, 80)}</td><td className="k-mono">{m.conversationId}</td><td>{m.senderId}</td><td><button className="btn btn-danger-ghost btn-sm" onClick={() => softDelete(m._id)} type="button">Xóa mềm</button></td></tr>))}</tbody></table></div>
        <Pagination page={page} totalPages={Math.ceil(total/20)} total={total} onPageChange={setPage} />
      </TableShell>
    </div>
  );
}
