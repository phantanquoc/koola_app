import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';

export default function CommerceProductsPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  function load() { apiClient.get('/admin/commerce/products', { params: { page, limit: 20 } }).then(r => { setData(r.data.data ?? []); setTotal(r.data.total ?? 0); }).catch(() => {}); }
  useEffect(() => { load(); }, [page]);
  async function create() { try { await apiClient.post('/admin/commerce/products', { name, price: Number(price), category: 'general' }); addToast('success', 'Đã tạo'); setName(''); setPrice(''); load(); } catch { addToast('error', 'Tạo thất bại'); } }
  async function remove(id: string) { try { await apiClient.delete(`/admin/commerce/products/${id}`); addToast('success', 'Đã xóa'); load(); } catch { addToast('error', 'Xóa thất bại'); } }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Catalog" title="Sản phẩm" description="Quản lý catalog sản phẩm." />
      <TableShell title="Products" actions={<><input className="input" placeholder="Tên" value={name} onChange={e => setName(e.target.value)} aria-label="Tên sản phẩm" style={{ width: 180 }} /><input className="input" placeholder="Giá" value={price} onChange={e => setPrice(e.target.value)} aria-label="Giá" style={{ width: 100 }} /><button className="btn btn-primary" onClick={create} type="button">Tạo</button></>}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Tên</th><th>Giá</th><th>Category</th><th>Hành động</th></tr></thead><tbody>{data.map((p: any) => (<tr key={p._id}><td>{p.name}</td><td>{p.price}</td><td>{p.category}</td><td><button className="btn btn-danger-ghost btn-sm" onClick={() => remove(p._id)} type="button">Xóa</button></td></tr>))}</tbody></table></div>
        <Pagination page={page} totalPages={Math.ceil(total/20)} total={total} onPageChange={setPage} />
      </TableShell>
    </div>
  );
}
