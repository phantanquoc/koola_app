import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import { IntegerInput } from '../components/StructuredInput';
import { useToast } from '../components/Toast';

type Track = {
  _id: string;
  title: string;
  artist: string;
  durationMs: number;
  audioKey: string;
  previewKey: string;
  licenseType: string;
  licenseUrl: string;
  sourceUrl: string;
  isActive: boolean;
};

/** `licenseUrl`/`sourceUrl` bắt buộc ở schema; form phải nhập thật, không prefill giả. */
const EMPTY_FORM = {
  title: '',
  artist: '',
  durationMs: 180000,
  audioKey: '',
  previewKey: '',
  licenseType: 'cc0' as string,
  licenseUrl: '',
  sourceUrl: '',
};

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Slug enum → nhãn đọc được (§3B2: không hiện nguyên slug lên bảng). */
const LICENSE_LABEL: Record<string, string> = {
  cc0: 'CC0',
  'cc-by': 'CC-BY',
  'epidemic-sound': 'Epidemic Sound',
  'owned-by-koola': 'Nội bộ Koola',
};

/** 180000 → "3:00" — người nghe nghĩ theo phút:giây, không theo mili giây. */
function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function MusicCatalogPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
    setForm(EMPTY_FORM);
    setEditTrack(null);
    setShowCreate(true);
  }

  function openEdit(t: Track) {
    // Sửa track phải giữ URL giấy phép/nguồn đã lưu. Trước đây hai field này bị
    // ghi đè bằng URL mẫu → mỗi lần Sửa là xoá dữ liệu pháp lý thật.
    setForm({
      title: t.title,
      artist: t.artist,
      durationMs: t.durationMs,
      audioKey: t.audioKey,
      previewKey: t.previewKey,
      licenseType: t.licenseType,
      licenseUrl: t.licenseUrl ?? '',
      sourceUrl: t.sourceUrl ?? '',
    });
    setEditTrack(t);
    setShowCreate(true);
  }

  async function submit() {
    if (!form.title.trim() || !form.artist.trim() || !form.audioKey.trim()) {
      addToast('error', 'Tiêu đề, nghệ sĩ và audioKey là bắt buộc');
      return;
    }
    // Server yêu cầu licenseUrl/sourceUrl khác rỗng và durationMs ≥ 1.
    if (!isHttpUrl(form.licenseUrl.trim())) {
      addToast('error', 'URL giấy phép phải là http(s):// đầy đủ.');
      return;
    }
    if (!isHttpUrl(form.sourceUrl.trim())) {
      addToast('error', 'URL nguồn phải là http(s):// đầy đủ.');
      return;
    }
    if (!(form.durationMs > 0)) {
      addToast('error', 'Thời lượng phải lớn hơn 0.');
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
      <ListHeader
        title="Nhạc"
        count={total}
        actions={<button className="btn btn-primary btn-sm" onClick={openCreate} type="button">Tạo track</button>}
      >
        <span className="cell-meta">Track trong thư viện nhạc của Moments, mới nhất trước.</span>
      </ListHeader>
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
                  <th scope="col">Tiêu đề</th>
                  <th scope="col">Nghệ sĩ</th>
                  <th scope="col">Thời lượng</th>
                  <th scope="col">Giấy phép</th>
                  <th scope="col" style={{ width: 160 }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m._id}>
                    <td>{m.title}</td>
                    <td>{m.artist}</td>
                    <td>{durationLabel(m.durationMs)}</td>
                    <td>{LICENSE_LABEL[m.licenseType] ?? m.licenseType}</td>
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
        <Pagination page={page} totalPages={Math.ceil(total / 20) || 1} total={total} unit="track" onPageChange={(p) => { setPage(p); load(p); }} />
      </TableShell>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} labelId="music-form-title" variant="wide">
        <div className="dialog dialog--wide">
          <div className="dialog-header">
            <div>
              <h2 id="music-form-title" className="panel-title">{editTrack ? 'Sửa track' : 'Tạo track mới'}</h2>
              <p className="panel-subtitle">Track hiển thị trong thư viện nhạc của Moments.</p>
            </div>
          </div>
          <div className="dialog-body page-stack">
            <div className="form-field">
              <label className="form-label" htmlFor="music-title">Tiêu đề <span className="form-required">*</span></label>
              <input id="music-title" className="input" placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="music-artist">Nghệ sĩ <span className="form-required">*</span></label>
              <input id="music-artist" className="input" placeholder="Nghệ sĩ" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="music-audio">Audio key (MinIO) <span className="form-required">*</span></label>
              <input id="music-audio" className="input" placeholder="Audio key (MinIO)" value={form.audioKey} onChange={(e) => setForm({ ...form, audioKey: e.target.value })} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="music-preview">Preview key</label>
              <input id="music-preview" className="input" placeholder="Preview key" value={form.previewKey} onChange={(e) => setForm({ ...form, previewKey: e.target.value })} />
              <span className="form-hint">Để trống sẽ dùng audio key chính.</span>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="music-duration">Thời lượng (ms)</label>
              <IntegerInput
                id="music-duration" placeholder="VD: 180000" maxLength={9}
                value={String(form.durationMs)} aria-label="Thời lượng tính bằng mili giây"
                onChange={(v) => setForm({ ...form, durationMs: v ? Number(v) : 0 })}
              />
              <span className="form-hint">
                {form.durationMs > 0
                  ? `≈ ${Math.floor(form.durationMs / 60000)}:${String(Math.floor((form.durationMs % 60000) / 1000)).padStart(2, '0')}`
                  : 'Nhập số mili giây, chỉ chữ số.'}
              </span>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="music-license">Giấy phép</label>
              <select id="music-license" className="input" value={form.licenseType} onChange={(e) => setForm({ ...form, licenseType: e.target.value })}>
                <option value="cc0">CC0</option>
                <option value="cc-by">CC-BY</option>
                <option value="epidemic-sound">Epidemic Sound</option>
                <option value="owned-by-koola">Owned by Koola</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="music-license-url">
                URL giấy phép <span className="form-required">*</span>
              </label>
              <input
                id="music-license-url" className="input" type="url" inputMode="url"
                autoComplete="off" spellCheck={false} placeholder="https://…"
                required aria-required
                value={form.licenseUrl} onChange={(e) => setForm({ ...form, licenseUrl: e.target.value })}
              />
              <span className="form-hint">Trang điều khoản cho phép dùng track này.</span>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="music-source-url">
                URL nguồn <span className="form-required">*</span>
              </label>
              <input
                id="music-source-url" className="input" type="url" inputMode="url"
                autoComplete="off" spellCheck={false} placeholder="https://…"
                required aria-required
                value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
              />
              <span className="form-hint">Nơi tải track gốc — cần khi đối soát bản quyền.</span>
            </div>
          </div>
          <div className="detail-bottombar" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)} type="button">Hủy</button>
            <button className="btn btn-primary" onClick={submit} type="button">{editTrack ? 'Lưu' : 'Tạo'}</button>
          </div>
        </div>
      </Dialog>

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
