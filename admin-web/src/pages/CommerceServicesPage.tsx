import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';

export default function CommerceServicesPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('');
  function load() { apiClient.get('/admin/commerce/services', { params: { page, limit: 20 } }).then(r => { setData(r.data.data ?? []); setTotal(r.data.total ?? 0); }).catch(() => {}); }
  useEffect(() => { load(); }, [page]);
  async function create() { try { await apiClient.post('/admin/commerce/services', { name, price: 0 }); addToast('success', 'Đã tạo'); setName(''); load(); } catch { addToast('error', 'Tạo thất bại'); } }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Catalog" title="Dịch vụ" description="Quản lý catalog dịch vụ." />
      <TableShell title="Services" actions={<><input className="input" placeholder="Tên dịch vụ" value={name} onChange={e => setName(e.target.value)} aria-label="Tên dịch vụ" style={{ width: 200 }} /><button className="btn btn-primary" onClick={create} type="button">Tạo</button></>}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Tên</th><th>Giá</th></tr></thead><tbody>{data.map((s: any) => (<tr key={s._id}><td>{s.name}</td><td>{s.price}</td></tr>))}</tbody></table></div>
        <Pagination page={page} totalPages={Math.ceil(total/20)} total={total} onPageChange={setPage} />
      </TableShell>
    </div>
  );
}
