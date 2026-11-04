import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Search } from 'lucide-react';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { StatusTabs } from '../components/StatusTabs';
import { ColumnHeader } from '../components/ColumnHeader';
import { FilterPopover } from '../components/FilterPopover';
import { Pagination } from '../components/Pagination';
import { ExportButton } from '../components/ExportButton';
import StateBlock from '../components/StateBlock';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
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
  type MusicOrphanReport,
  type MusicStats,
  type MusicTrack,
} from '../musicApi';
import {
  MusicRowAudio,
  RowPlayButton,
  useMusicRowPlayer,
} from '../components/MusicRowPlayer';
import { MAX_TAGS, TagChipEditor } from '../components/TagChipEditor';

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
    // '' | '1' — kept in the URL so "chưa dùng" survives a reload like every
    // other filter on this page.
    unused: '',
    sort: 'addedAt:desc',
    page: '1',
    pageSize: '20',
  });

  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const unusedOnly = values.unused === '1';

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
      unused: unusedOnly || undefined,
      sort,
      page,
      limit: pageSize,
    }),
    [values.status, values.q, values.license, values.tag, unusedOnly, sort, page, pageSize],
  );

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<MusicTrack>(
    ['music', values.status, values.q, values.license, values.tag, values.unused, sort, page, pageSize],
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

  const advancedCount =
    (values.license ? 1 : 0) + (values.tag ? 1 : 0) + (unusedOnly ? 1 : 0);
  const hasActiveFilter = Boolean(values.q || advancedCount || values.status !== 'active');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const loadError = apiErrorMessage(error, 'Không tải được danh sách nhạc.');

  const [createOpen, setCreateOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [orphansOpen, setOrphansOpen] = useState(false);
  // Restoring from the list needs its own busy flag per row so a slow request
  // does not disable every other row's button.
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function restoreRow(id: string) {
    setRestoringId(id);
    try {
      await musicApi.restore(id);
      addToast('success', 'Đã khôi phục track — hiện lại trong thư viện app.');
      refreshAll();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Khôi phục thất bại'));
    } finally {
      setRestoringId(null);
    }
  }

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

  // Surface a playback failure as a toast. The row button only turns red and
  // carries the reason in `title`, which no touch device ever shows — a dead
  // presigned URL used to fail completely silently.
  useEffect(() => {
    if (!player.errorId) return;
    addToast('error', player.errorMessage ?? 'Không phát được track này.');
    // errorId only changes when a new failure lands; adding the message/toast
    // would re-fire on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.errorId]);

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
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOrphansOpen(true)}>
              Kiểm kho
            </button>
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
          onClear={() => set({ license: '', tag: '', unused: '', page: '1' })}
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
                <option key={o.value} value={o.value}>
                  {/* Count comes from `stats.byLicense`, which the server already
                      aggregates — the filter is the only place it is useful. */}
                  {o.label}
                  {typeof stats?.byLicense?.[o.value] === 'number'
                    ? ` (${formatNumber(stats.byLicense[o.value])})`
                    : ''}
                </option>
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

          {/* Only tracks never attached to a story. `usageCount` is cumulative
              and never decremented, so 0 is the reliable "safe to retire" mark —
              these can be deactivated without breaking live content. */}
          <label className="filter-check">
            <input
              type="checkbox"
              checked={unusedOnly}
              onChange={(e) => set({ unused: e.target.checked ? '1' : '', page: '1' })}
            />
            <span>
              Chưa từng được dùng
              {typeof stats?.unused === 'number' && (
                <span className="form-label-note"> · {formatNumber(stats.unused)} track</span>
              )}
            </span>
          </label>
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

      {/* Row click is the only way into the detail page on touch, where a
          pointer cursor does not exist. Same hint the other list pages carry. */}
      <span className="cell-meta show-under-860">Nhấn dòng để xem chi tiết</span>

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
          {unusedOnly && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ unused: '', page: '1' })}>
              Chưa từng được dùng ✕
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
          <div className="table-scroll table-scroll--wide">
            <table className="data-table data-table--compact" aria-label="Thư viện nhạc">
              <thead>
                <tr>
                  <th scope="col" className="col-icon">
                    <span className="sr-only">Nghe thử</span>
                  </th>
                  {/* ColumnHeader renders its own <th>; wrapping it in another
                      <th> is invalid HTML and React logs a hydration error. */}
                  <ColumnHeader label="Tiêu đề" sortField="title" sort={sort} onSort={toggleSort} />
                  <th scope="col">Nghệ sĩ</th>
                  <th scope="col" className="col-num">Thời lượng</th>
                  <th scope="col">Giấy phép</th>
                  {/* Cumulative, not live: the counter only ever increments (see
                      `usageCount` in the schema), so it is labeled as history. */}
                  <ColumnHeader label="Lượt (tích luỹ)" sortField="usageCount" sort={sort} onSort={toggleSort} className="col-num" />
                  <ColumnHeader
                    label="Ngày thêm"
                    sortField="addedAt"
                    sort={sort}
                    onSort={toggleSort}
                    className="col-hide-mobile"
                  />
                  <th scope="col" className="th-center col-sticky">Hành động</th>
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
                    tabIndex={0}
                    aria-label={`Xem chi tiết ${t.title}`}
                    className={`row-clickable${player.playingId === t._id ? ' row-playing' : ''}`}
                    onClick={(e) => {
                      // Buttons (play, deactivate) stop propagation themselves.
                      if ((e.target as HTMLElement).closest('button,a')) return;
                      openDetail(t._id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      // Enter/Space on a button inside the row belongs to that
                      // button — otherwise keyboard-activating Ngưng would also
                      // navigate.
                      if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return;
                      e.preventDefault();
                      openDetail(t._id);
                    }}
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
                    <td className="col-sticky">
                      <div className="table-actions table-actions--end">
                        <button
                          className="btn btn-ghost btn-icon"
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openDetail(t._id); }}
                          aria-label={`Xem ${t.title}`}
                          title="Chi tiết"
                        >
                          <Eye size={16} aria-hidden />
                        </button>
                        {t.isActive ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeactivateId(t._id);
                            }}
                            title="Ngưng phát track này"
                          >
                            Ngưng
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void restoreRow(t._id);
                            }}
                            disabled={restoringId === t._id}
                            title="Cho track hiện lại trong thư viện app"
                          >
                            {restoringId === t._id ? 'Đang mở…' : 'Khôi phục'}
                          </button>
                        )}
                      </div>
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

      {orphansOpen && (
        <OrphansDialog
          onClose={() => setOrphansOpen(false)}
          onPurged={() => {
            setOrphansOpen(false);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

// ─── Orphan-object dialog ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Files under `music-catalog/` with no track row.
 *
 * Catalog audio bypasses the `Media` collection on purpose, so the shared
 * cleanup jobs never see these — nothing else in the product can report them.
 * Purge is behind type-to-confirm: the objects are gone from MinIO, and no
 * screen lists them again once deleted.
 */
function OrphansDialog({ onClose, onPurged }: { onClose: () => void; onPurged: () => void }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [report, setReport] = useState<MusicOrphanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setReport(await musicApi.orphans());
    } catch (err) {
      setError(apiErrorMessage(err, 'Không kiểm tra được kho lưu trữ'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Load once per open; the report is a snapshot and re-running on every
    // render would hammer MinIO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function purge() {
    setPurging(true);
    try {
      const result = await musicApi.purgeOrphans();
      if (result.failed > 0) {
        addToast('warning', `Đã xoá ${result.deleted} file, ${result.failed} file lỗi.`);
      } else {
        addToast('success', `Đã xoá ${result.deleted} file (${formatBytes(result.bytes)}).`);
      }
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      onPurged();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Dọn file thất bại'));
    } finally {
      setPurging(false);
    }
  }

  const eligibleBytes = (report?.orphans ?? [])
    .filter((o) => o.eligible)
    .reduce((sum, o) => sum + o.size, 0);

  return (
    <Dialog open onClose={purging ? () => {} : onClose} labelId="music-orphans-title" variant="wide">
      <div className="dialog dialog--wide">
        <div className="dialog-header">
          <h2 id="music-orphans-title" className="panel-title">Kiểm kho nhạc</h2>
          <button className="btn btn-sm" type="button" onClick={onClose} disabled={purging} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="dialog-body page-stack">
          {loading && <p className="cell-meta">Đang đối chiếu kho với danh mục…</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}{' '}
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void load()}>
                Thử lại
              </button>
            </p>
          )}

          {report && !loading && (
            <>
              <dl className="description-list">
                <dt className="cell-meta">File trong kho</dt>
                <dd>{formatNumber(report.objects)}</dd>

                <dt className="cell-meta">Đang được track dùng</dt>
                <dd>{formatNumber(report.referenced)}</dd>

                <dt className="cell-meta">Mồ côi</dt>
                <dd>
                  {formatNumber(report.orphans.length)}
                  {report.pending > 0 && (
                    <span className="cell-meta">
                      {' '}· {formatNumber(report.pending)} mới tạo, còn trong {report.graceHours}h
                      bảo vệ
                    </span>
                  )}
                </dd>
              </dl>

              {report.orphans.length === 0 ? (
                <p className="cell-meta">Kho khớp danh mục — không có file thừa.</p>
              ) : (
                <>
                  <p className="cell-meta">
                    File mồ côi sinh ra khi tải lên xong nhưng bước tạo track thất bại. File
                    trong vòng {report.graceHours} giờ vẫn được giữ vì có thể đang được tạo dở.
                  </p>
                  {/* List, not a table: object keys are long unbroken strings, and a
                      table inside a 720px dialog would scroll sideways on its own. */}
                  <ul className="audit-list" aria-label="File mồ côi">
                    {report.orphans.slice(0, 50).map((o) => (
                      <li key={o.key} className="audit-list-row">
                        <span className="k-mono orphan-key">{o.key}</span>
                        <span className="cell-meta">{formatBytes(o.size)}</span>
                        <span className="cell-meta k-mono">{formatDateTime(o.lastModified)}</span>
                        <StatusBadge
                          tone={o.eligible ? 'danger' : 'muted'}
                          label={o.eligible ? 'Xoá được' : 'Đang bảo vệ'}
                        />
                      </li>
                    ))}
                  </ul>
                  {report.orphans.length > 50 && (
                    <p className="cell-meta">
                      Hiện 50/{formatNumber(report.orphans.length)} file đầu — dọn sẽ xoá tất cả
                      file đủ điều kiện, không chỉ phần đang hiện.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="dialog-actions dialog-actions--padded">
          <button className="btn" type="button" onClick={onClose} disabled={purging}>
            Đóng
          </button>
          <PurgeOrphansButton
            eligible={report?.eligible ?? 0}
            eligibleBytes={eligibleBytes}
            busy={purging}
            onConfirm={purge}
          />
        </div>
      </div>
    </Dialog>
  );
}

/** Type-to-confirm is separate so the count in the label stays live. */
function PurgeOrphansButton({
  eligible,
  eligibleBytes,
  busy,
  onConfirm,
}: {
  eligible: number;
  eligibleBytes: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (eligible === 0) {
    return (
      <button className="btn btn-primary" type="button" disabled>
        Không có file nào để xoá
      </button>
    );
  }

  return (
    <>
      <button
        className="btn btn-danger"
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
      >
        {busy ? 'Đang xoá…' : `Xoá ${formatNumber(eligible)} file (${formatBytes(eligibleBytes)})`}
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Xoá ${formatNumber(eligible)} file mồ côi?`}
        description="File bị xoá khỏi kho lưu trữ và không khôi phục được. Chỉ file không track nào dùng và cũ hơn mốc bảo vệ mới bị xoá."
        confirmLabel="Xoá file"
        variant="danger"
        requireText="XOA"
        busy={busy}
        onConfirm={() => {
          setConfirming(false);
          onConfirm();
        }}
        onClose={() => setConfirming(false)}
      />
    </>
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
          <h2 id={labelId} className="panel-title">Thêm track</h2>
          <button className="btn btn-sm" type="button" onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="dialog-body page-stack">
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
                  <span className="form-label-note">
                    · {Math.floor(localDurationMs / 60000)}:
                    {String(Math.floor((localDurationMs % 60000) / 1000)).padStart(2, '0')}
                  </span>
                )}
              </span>
              <audio
                src={previewUrl}
                controls
                preload="metadata"
                className="audio-preview"
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
              <progress className="audio-preview" max={100} value={progress} />
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
          <TagChipEditor
            value={tags}
            onChange={setTags}
            disabled={busy}
            hint={`Dùng để lọc trong thư viện nhạc trên app. Tối đa ${MAX_TAGS} tag.`}
          />

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

        <div className="dialog-actions dialog-actions--padded">
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
