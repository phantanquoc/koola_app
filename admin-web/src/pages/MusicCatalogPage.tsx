import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { StatusTabs } from '../components/StatusTabs';
import { ColumnHeader } from '../components/ColumnHeader';
import { FilterPopover } from '../components/FilterPopover';
import { Pagination } from '../components/Pagination';
import { ExportButton } from '../components/ExportButton';
import StateBlock from '../components/StateBlock';
import { ConfirmDialog } from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import { useToast } from '../components/Toast';
import { apiErrorMessage, formatDateTime, formatNumber } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';
import {
  AUDIO_ACCEPT,
  MAX_AUDIO_BYTES,
  LICENSE_OPTIONS,
  buildMusicCsv,
  durationLabel,
  licenseLabel,
  musicApi,
  type MusicStats,
  type MusicTrack,
} from '../musicApi';
import {
  MusicRowAudio,
  RowPlayButton,
  useMusicRowPlayer,
} from '../components/MusicRowPlayer';

const PAGE_SIZES = [10, 20, 50];
const SORT_FIELDS = ['addedAt', 'title', 'usageCount'] as const;

export default function MusicCatalogPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { values, set, reset } = useUrlFilters({
    status: 'active',
    q: '',
    license: '',
    tag: '',
    sort: 'addedAt:desc',
    page: '1',
    pageSize: '20',
  });

  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;

  // Allow-listed here too, so a hand-edited URL cannot produce a server 400 for
  // a sort value this page never offers.
  const sort = useMemo(() => {
    const [field, dir] = values.sort.split(':');
    const okField = SORT_FIELDS.includes(field as never);
    const okDir = dir === 'asc' || dir === 'desc';
    return okField && okDir ? values.sort : 'addedAt:desc';
  }, [values.sort]);

  const params = useMemo(
    () => ({
      status: values.status || 'active',
      q: values.q || undefined,
      licenseType: values.license || undefined,
      tag: values.tag || undefined,
      sort,
      page,
      limit: pageSize,
    }),
    [values.status, values.q, values.license, values.tag, sort, page, pageSize],
  );

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<MusicTrack>(
    ['music', values.status, values.q, values.license, values.tag, sort, page, pageSize],
    '/admin/music-tracks',
    params,
  );

  const statsQuery = useQuery({
    queryKey: ['music-stats'],
    queryFn: () => musicApi.stats(),
    staleTime: 30_000,
  });
  const stats: MusicStats | undefined = statsQuery.data;

  // Both keys, so tab counts never drift from the table after a mutation.
  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ['music'] });
    void queryClient.invalidateQueries({ queryKey: ['music-stats'] });
  }

  // Debounced search: typing must not fire one request per keystroke.
  const [searchInput, setSearchInput] = useState(values.q);
  useEffect(() => setSearchInput(values.q), [values.q]);
  useEffect(() => {
    if (searchInput.trim() === values.q) return;
    const t = setTimeout(() => set({ q: searchInput.trim(), page: '1' }), 350);
    return () => clearTimeout(t);
    // set/values.q are stable for this purpose; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function openDetail(id: string) {
    navigate(`/music/${id}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  }

  const advancedCount = (values.license ? 1 : 0) + (values.tag ? 1 : 0);
  const hasActiveFilter = Boolean(values.q || advancedCount || values.status !== 'active');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const loadError = apiErrorMessage(error, 'Không tải được danh sách nhạc.');

  const [createOpen, setCreateOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function confirmDeactivate() {
    if (!deactivateId) return;
    try {
      await musicApi.deactivate(deactivateId);
      addToast('success', 'Đã ngưng track. File vẫn giữ trong kho.');
      setDeactivateId(null);
      refreshAll();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Ngưng track thất bại'));
    }
  }

  async function runExport() {
    setExporting(true);
    try {
      const { data, truncated, total: all } = await musicApi.exportAll();
      const blob = new Blob([buildMusicCsv(data)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `nhac-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (truncated) {
        addToast('warning', `Chỉ xuất ${data.length}/${all} dòng — thu hẹp phạm vi để xuất hết.`);
      } else {
        addToast('success', `Đã xuất ${data.length} dòng.`);
      }
      setExportOpen(false);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Xuất CSV thất bại'));
    } finally {
      setExporting(false);
    }
  }

  const player = useMusicRowPlayer();

  function toggleSort(field: string) {
    const [curField, curDir] = sort.split(':');
    const nextDir = curField === field && curDir === 'desc' ? 'asc' : 'desc';
    set({ sort: `${field}:${nextDir}`, page: '1' });
  }

  return (
    <div className="page-stack">
      <ListHeader
        title="Nhạc"
        count={total}
        actions={
          <>
            <ExportButton onExport={() => setExportOpen(true)} label="Xuất CSV" />
            <button className="btn btn-primary btn-sm" type="button" onClick={() => setCreateOpen(true)}>
              Thêm track
            </button>
          </>
        }
      >
        <div className="filter-search-wrap">
          <Search size={15} className="filter-search-icon" aria-hidden />
          <input
            className="input filter-search filter-search--icon"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') set({ q: searchInput.trim(), page: '1' });
            }}
            placeholder="Tìm theo tên bài hoặc nghệ sĩ"
            aria-label="Tìm theo tên bài hoặc nghệ sĩ"
          />
        </div>

        <FilterPopover
          activeCount={advancedCount}
          onClear={() => set({ license: '', tag: '', page: '1' })}
        >
          <label className="form-field">
            <span className="form-label">Giấy phép</span>
            <select
              className="select"
              value={values.license}
              onChange={(e) => set({ license: e.target.value, page: '1' })}
            >
              <option value="">Mọi giấy phép</option>
              {LICENSE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          {/* Tag list comes from stats, not a hardcoded vocabulary — it mirrors
              what tracks actually carry. Hidden while no track has a tag. */}
          {(stats?.tags?.length ?? 0) > 0 && (
            <label className="form-field">
              <span className="form-label">Tag</span>
              <select
                className="select"
                value={values.tag}
                onChange={(e) => set({ tag: e.target.value, page: '1' })}
              >
                <option value="">Mọi tag</option>
                {stats?.tags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
        </FilterPopover>
      </ListHeader>

      <StatusTabs
        tabs={[
          { key: 'active', label: 'Đang dùng', count: stats?.active },
          { key: 'inactive', label: 'Đã ngưng', count: stats?.inactive },
          { key: 'all', label: 'Tất cả', count: stats?.all },
        ]}
        active={values.status || 'active'}
        onChange={(k) => set({ status: k, page: '1' })}
      />

      {hasActiveFilter && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {values.license && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ license: '', page: '1' })}>
              {licenseLabel(values.license)} ✕
            </button>
          )}
          {values.tag && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ tag: '', page: '1' })}>
              Tag: {values.tag} ✕
            </button>
          )}
          {values.q && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ q: '', page: '1' })}>
              Từ khoá: {values.q} ✕
            </button>
          )}
          {values.status !== 'active' && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ status: 'active', page: '1' })}>
              Tab: {values.status === 'all' ? 'Tất cả' : 'Đã ngưng'} ✕
            </button>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={reset}>
            Xoá bộ lọc
          </button>
        </div>
      )}

      <TableShell>
        <MusicRowAudio audioRef={player.audioRef} />

        {isError && (
          <StateBlock variant="error" title="Không tải được danh sách nhạc" copy={loadError}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
              Thử lại
            </button>
          </StateBlock>
        )}

        {isLoading && (
          <StateBlock variant="loading" title="Đang tải thư viện nhạc" copy="Đang lấy danh sách track." />
        )}

        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--music">
            <table className="data-table data-table--compact" aria-label="Thư viện nhạc">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 52 }}>
                    <span className="sr-only">Nghe thử</span>
                  </th>
                  {/* ColumnHeader renders its own <th>; wrapping it in another
                      <th> is invalid HTML and React logs a hydration error. */}
                  <ColumnHeader label="Tiêu đề" sortField="title" sort={sort} onSort={toggleSort} />
                  <th scope="col">Nghệ sĩ</th>
                  <th scope="col" className="col-num">Thời lượng</th>
                  <th scope="col">Giấy phép</th>
                  <ColumnHeader label="Lượt dùng" sortField="usageCount" sort={sort} onSort={toggleSort} className="col-num" />
                  <ColumnHeader
                    label="Ngày thêm"
                    sortField="addedAt"
                    sort={sort}
                    onSort={toggleSort}
                    className="col-hide-mobile"
                  />
                  <th scope="col" className="th-center">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      {hasActiveFilter ? (
                        <StateBlock
                          variant="empty"
                          title="Không khớp track nào"
                          copy="Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm."
                        >
                          <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>
                            Xoá bộ lọc
                          </button>
                        </StateBlock>
                      ) : (
                        <StateBlock
                          variant="empty"
                          title="Chưa có track nào"
                          copy="Thêm track đầu tiên để nó xuất hiện trong thư viện nhạc của Moments."
                        >
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => setCreateOpen(true)}>
                            Thêm track
                          </button>
                        </StateBlock>
                      )}
                    </td>
                  </tr>
                )}

                {rows.map((t) => (
                  <tr
                    key={t._id}
                    onClick={(e) => {
                      // Buttons (play, deactivate) stop propagation themselves.
                      if ((e.target as HTMLElement).closest('button,a')) return;
                      openDetail(t._id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <RowPlayButton id={t._id} title={t.title} state={player} />
                    </td>
                    <td>
                      <div className="cell-title">{t.title}</div>
                      {!t.isActive && <div className="cell-meta">Đã ngưng</div>}
                    </td>
                    <td>{t.artist}</td>
                    <td className="col-num">{durationLabel(t.durationMs)}</td>
                    <td>{licenseLabel(t.licenseType)}</td>
                    <td className="col-num">{formatNumber(t.usageCount ?? 0)}</td>
                    <td className="col-hide-mobile">
                      <span className="cell-date">{formatDateTime(t.addedAt)}</span>
                    </td>
                    <td className="th-center">
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeactivateId(t._id);
                        }}
                        disabled={!t.isActive}
                        title={t.isActive ? 'Ngưng phát track này' : 'Track đã ngưng'}
                      >
                        Ngưng
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          unit="track"
          onPageChange={(p) => set({ page: String(p) })}
          pageSize={pageSize}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      {createOpen && (
        <CreateMusicDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refreshAll();
            addToast('success', 'Đã thêm track');
          }}
        />
      )}

      <ConfirmDialog
        open={deactivateId !== null}
        title="Ngưng track này?"
        description="Track sẽ biến mất khỏi thư viện người dùng nhưng file vẫn nằm trong kho và nội dung đã đăng vẫn phát được. Có thể khôi phục lại sau."
        confirmLabel="Ngưng"
        variant="danger"
        requireText="XACNHAN"
        onConfirm={confirmDeactivate}
        onClose={() => setDeactivateId(null)}
      />

      <ConfirmDialog
        open={exportOpen}
        title="Xuất danh mục nhạc?"
        description="Xuất toàn bộ track, gồm cả track đã ngưng, kèm URL giấy phép và nguồn để đối soát bản quyền. Tối đa 5000 dòng."
        confirmLabel="Xuất CSV"
        busy={exporting}
        onConfirm={runExport}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

// ─── Create dialog ───────────────────────────────────────────────────────────

interface CreateDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateMusicDialog({ onClose, onCreated }: CreateDialogProps) {
  const labelId = 'create-music-title';

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [licenseType, setLicenseType] = useState('cc0');
  const [licenseUrl, setLicenseUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [attribution, setAttribution] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reused on retry so a create failure does not force a second upload.
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  // Preview the picked file before it is committed. The object URL is local —
  // no upload, no endpoint — and reading `duration` off the element is what lets
  // the admin see the length the server will derive before pressing Tạo.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [localDurationMs, setLocalDurationMs] = useState<number | null>(null);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const busy = uploading || saving;

  function pickFile(f: File | null) {
    setError(null);
    setUploadedKey(null);
    setLocalDurationMs(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith('audio/')) {
      setError('Chỉ nhận file âm thanh (mp3, wav, ogg, m4a, aac).');
      return;
    }
    if (f.size > MAX_AUDIO_BYTES) {
      setError('File vượt quá 100MB.');
      return;
    }
    setFile(f);
  }

  function addTag() {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) {
      setTagDraft('');
      return;
    }
    if (tags.length >= 20) {
      setError('Tối đa 20 tag.');
      return;
    }
    if (t.length > 40) {
      setError('Mỗi tag tối đa 40 ký tự.');
      return;
    }
    setTags([...tags, t]);
    setTagDraft('');
  }

  async function submit() {
    setError(null);
    if (!title.trim() || !artist.trim()) {
      setError('Tiêu đề và nghệ sĩ là bắt buộc.');
      return;
    }
    if (!file && !uploadedKey) {
      setError('Chọn file âm thanh trước khi tạo track.');
      return;
    }
    if (!/^https?:\/\//.test(licenseUrl.trim())) {
      setError('URL giấy phép phải là http(s):// đầy đủ.');
      return;
    }
    if (!/^https?:\/\//.test(sourceUrl.trim())) {
      setError('URL nguồn phải là http(s):// đầy đủ.');
      return;
    }
    if (licenseType === 'cc-by' && !attribution.trim()) {
      setError('CC-BY cần ghi công (attribution).');
      return;
    }

    let audioKey = uploadedKey;
    if (!audioKey) {
      setUploading(true);
      setProgress(0);
      try {
        audioKey = await musicApi.uploadAudio(file as File, setProgress);
        setUploadedKey(audioKey);
      } catch (err) {
        setError(apiErrorMessage(err, 'Tải file lên thất bại — thử lại.'));
        return;
      } finally {
        setUploading(false);
      }
    }

    setSaving(true);
    try {
      await musicApi.create({
        title: title.trim(),
        artist: artist.trim(),
        audioKey,
        licenseType,
        licenseUrl: licenseUrl.trim(),
        sourceUrl: sourceUrl.trim(),
        attribution: attribution.trim() || undefined,
        tags: tags.length ? tags : undefined,
      });
      onCreated();
    } catch (err) {
      // The object is orphaned but harmless: no row, nothing lists it, and the
      // key is kept so retrying does not upload the same file twice.
      setError(apiErrorMessage(err, 'Tạo track thất bại.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={busy ? () => {} : onClose} labelId={labelId} variant="wide">
      {/* Dialog renders only the overlay; the panel is the caller's. Without
          `.dialog--wide` the header/body/footer stack as loose overlay children
          and the buttons escape the card. */}
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 id={labelId} className="panel-title" style={{ margin: 0 }}>Thêm track</h2>
          <button className="btn btn-sm" type="button" onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="dialog-body" style={{ display: 'grid', gap: 14 }}>
          <label className="form-field">
            <span className="form-label">File âm thanh</span>
            <input
              className="input"
              type="file"
              accept={AUDIO_ACCEPT}
              disabled={busy}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              aria-describedby="audio-file-hint"
            />
            <span id="audio-file-hint" className="form-hint">
              mp3, wav, ogg, m4a hoặc aac — tối đa 100MB. Thời lượng được đọc từ file, không nhập tay.
            </span>
            {file && <span className="cell-meta">{file.name}</span>}
            {uploadedKey && <span className="cell-meta">Đã tải lên — có thể bấm Tạo lại nếu lần trước lỗi.</span>}
          </label>

          {/* Listen before committing. Duration is read off the element, so the
              number shown here is the same one the server will derive. */}
          {previewUrl && (
            <div className="form-field" aria-label="Nghe thử file đã chọn">
              <span className="form-label">
                Nghe thử
                {localDurationMs != null && (
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>
                    · {Math.floor(localDurationMs / 60000)}:
                    {String(Math.floor((localDurationMs % 60000) / 1000)).padStart(2, '0')}
                  </span>
                )}
              </span>
              <audio
                src={previewUrl}
                controls
                preload="metadata"
                style={{ width: '100%' }}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) setLocalDurationMs(Math.round(d * 1000));
                }}
              />
            </div>
          )}

          {uploading && (
            <div className="form-field" role="status" aria-live="polite">
              <span className="form-label">Đang tải lên… {progress}%</span>
              <progress max={100} value={progress} style={{ width: '100%' }} />
            </div>
          )}

          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Tiêu đề</span>
              <input className="input" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </label>
            <label className="form-field">
              <span className="form-label">Nghệ sĩ</span>
              <input className="input" value={artist} disabled={busy} onChange={(e) => setArtist(e.target.value)} maxLength={200} />
            </label>
          </div>

          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Giấy phép</span>
              <select className="select" value={licenseType} disabled={busy} onChange={(e) => setLicenseType(e.target.value)}>
                {LICENSE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">
                Ghi công {licenseType === 'cc-by' ? '(bắt buộc)' : '(tuỳ chọn)'}
              </span>
              <input className="input" value={attribution} disabled={busy} onChange={(e) => setAttribution(e.target.value)} maxLength={1000} />
            </label>
          </div>

          {/* Tags power the picker's tag filter (moments.service filters on
              `tags`), so a track without them is unreachable by category. */}
          <div className="form-field">
            <span className="form-label">Tags</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: tags.length ? 8 : 0 }}>
              {tags.map((t) => (
                <button
                  key={t}
                  className="filter-chip filter-chip-removable"
                  type="button"
                  disabled={busy}
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  aria-label={`Bỏ tag ${t}`}
                >
                  {t} ✕
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={tagDraft}
                disabled={busy || tags.length >= 20}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={tags.length >= 20 ? 'Đã đủ 20 tag' : 'Nhập rồi Enter — vd: acoustic, lofi'}
                aria-label="Thêm tag"
                maxLength={41}
              />
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={addTag}
                disabled={busy || !tagDraft.trim() || tags.length >= 20}
              >
                Thêm
              </button>
            </div>
            <span className="form-hint">Dùng để lọc trong thư viện nhạc trên app. Tối đa 20 tag.</span>
          </div>

          <label className="form-field">
            <span className="form-label">URL giấy phép</span>
            <input className="input" value={licenseUrl} disabled={busy} onChange={(e) => setLicenseUrl(e.target.value)} placeholder="https://creativecommons.org/…" />
          </label>

          <label className="form-field">
            <span className="form-label">URL nguồn</span>
            <input className="input" value={sourceUrl} disabled={busy} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://freemusicarchive.org/…" />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 var(--space-5) var(--space-5)' }}>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button className="btn btn-primary" type="button" onClick={submit} disabled={busy}>
            {uploading ? 'Đang tải…' : saving ? 'Đang lưu…' : 'Tạo track'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
