import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';

type Track = {
  _id: string;
  title: string;
  artist: string;
  durationMs: number;
  audioKey: string;
  previewKey: string;
  licenseType: string;
  isActive: boolean;
};

export default function MusicCatalogPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    artist: '',
    durationMs: 180000,
    audioKey: '',
    previewKey: '',
    licenseType: 'cc0' as string,
    licenseUrl: 'https://example.com/license',
    sourceUrl: 'https://example.com/source',
  });

  async function load(p = page) {
    setLoading(true);
    try {
      const r = await apiClient.get('/admin/music-tracks', { params: { page: p, limit: 20 } });
      setData(r.data.data ?? []);
      setTotal(r.data.total ?? 0);
    } catch {
      addToast('error', 'Tải danh sách thất bại');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
  }, []);

  function openCreate() {
    setForm({
      title: '',
      artist: '',
      durationMs: 180000,
      audioKey: '',
      previewKey: '',
      licenseType: 'cc0',
      licenseUrl: 'https://example.com/license',
      sourceUrl: 'https://example.com/source',
    });
    setEditTrack(null);
    setShowCreate(true);
  }

  function openEdit(t: Track) {
    setForm({
      title: t.title,
      artist: t.artist,
      durationMs: t.durationMs,
      audioKey: t.audioKey,
      previewKey: t.previewKey,
      licenseType: t.licenseType,
      licenseUrl: 'https://example.com/license',
      sourceUrl: 'https://example.com/source',
    });
    setEditTrack(t);
    setShowCreate(true);
  }

  async function submit() {
    if (!form.title.trim() || !form.artist.trim() || !form.audioKey.trim()) {
      addToast('error', 'Tiêu đề, nghệ sĩ và audioKey là bắt buộc');
      return;
    }
    try {
      if (editTrack) {
        await apiClient.patch(`/admin/music-tracks/${editTrack._id}`, {
          title: form.title,
          artist: form.artist,
          durationMs: Number(form.durationMs),
          audioKey: form.audioKey,
          previewKey: form.previewKey || form.audioKey,
          licenseType: form.licenseType,
          licenseUrl: form.licenseUrl,
          sourceUrl: form.sourceUrl,
        });
        addToast('success', 'Đã cập nhật');
      } else {
        await apiClient.post('/admin/music-tracks', {
          title: form.title,
          artist: form.artist,
          durationMs: Number(form.durationMs),
          audioKey: form.audioKey,
          previewKey: form.previewKey || form.audioKey,
          licenseType: form.licenseType,
          licenseUrl: form.licenseUrl,
          sourceUrl: form.sourceUrl,
        });
        addToast('success', 'Đã tạo');
      }
      setShowCreate(false);
      load(page);
    } catch {
      addToast('error', editTrack ? 'Cập nhật thất bại' : 'Tạo thất bại');
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await apiClient.delete(`/admin/music-tracks/${deleteId}`);
      addToast('success', 'Đã xóa');
      setDeleteId(null);
      load(page);
    } catch {
      addToast('error', 'Xóa thất bại');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Kiểm duyệt"
        title="Nhạc"
        description="Quản lý catalog nhạc cho Moments."
        actions={<button className="btn btn-primary" onClick={openCreate} type="button">Tạo track</button>}
      />
      <TableShell title="Music tracks">
        {loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có track" copy="Tạo track đầu tiên để hiển thị trong thư viện Moments." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tiêu đề</th>
                  <th>Nghệ sĩ</th>
                  <th>Thời lượng</th>
                  <th>License</th>
                  <th style={{ width: 160 }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m._id}>
                    <td>{m.title}</td>
                    <td>{m.artist}</td>
                    <td>{Math.round(m.durationMs / 1000)}s</td>
                    <td>{m.licenseType}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => openEdit(m)} type="button">Sửa</button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteId(m._id)} type="button">Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={Math.ceil(total / 20) || 1} total={total} onPageChange={(p) => { setPage(p); load(p); }} />
      </TableShell>

      {showCreate && (
        <div className="dialog-backdrop" onClick={() => setShowCreate(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>{editTrack ? 'Sửa track' : 'Tạo track mới'}</h3>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <input className="input" placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Tiêu đề" />
              <input className="input" placeholder="Nghệ sĩ" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} aria-label="Nghệ sĩ" />
              <input className="input" placeholder="Audio key (MinIO)" value={form.audioKey} onChange={(e) => setForm({ ...form, audioKey: e.target.value })} aria-label="Audio key" />
              <input className="input" placeholder="Preview key" value={form.previewKey} onChange={(e) => setForm({ ...form, previewKey: e.target.value })} aria-label="Preview key" />
              <input className="input" type="number" placeholder="Duration ms" value={form.durationMs} onChange={(e) => setForm({ ...form, durationMs: Number(e.target.value) })} aria-label="Duration" />
              <select className="input" value={form.licenseType} onChange={(e) => setForm({ ...form, licenseType: e.target.value })} aria-label="License">
                <option value="cc0">CC0</option>
                <option value="cc-by">CC-BY</option>
                <option value="epidemic-sound">Epidemic Sound</option>
                <option value="owned-by-koola">Owned by Koola</option>
              </select>
              <input className="input" placeholder="License URL" value={form.licenseUrl} onChange={(e) => setForm({ ...form, licenseUrl: e.target.value })} aria-label="License URL" />
              <input className="input" placeholder="Source URL" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} aria-label="Source URL" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setShowCreate(false)} type="button">Hủy</button>
              <button className="btn btn-primary" onClick={submit} type="button">{editTrack ? 'Lưu' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Xóa track?"
        description="Track sẽ bị ẩn khỏi catalog (soft-delete)."
        confirmLabel="Xóa"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
