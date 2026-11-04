import './moderation-media.css';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Download, X } from 'lucide-react';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { ColumnHeader } from '../components/ColumnHeader';
import { StatusTabs } from '../components/StatusTabs';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import { useToast } from '../components/Toast';
import { apiErrorMessage, formatDateTime, formatNumber } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';

const PAGE_SIZES = [10, 20, 50];
const ACTIVE_TABS = ['', 'true', 'false'] as const;
const SORT_FIELDS = ['createdAt', 'likeCount', 'commentCount'] as const;

interface PostMediaItem {
  mediaKey: string;
  mediaType: 'image' | 'video';
  thumbnailKey?: string | null;
  /** URL đã ký; null khi presign thất bại. */
  mediaUrlSigned?: string | null;
  thumbnailUrlSigned?: string | null;
}

interface PostItem {
  _id: string;
  authorId?: string;
  /** Tên tác giả resolve lúc đọc; null khi tài khoản đã bị xoá. */
  authorName?: string | null;
  authorAvatar?: string | null;
  caption?: string;
  isActive?: boolean;
  /** Phạm vi hiển thị — quyết định mức độ nghiêm trọng khi gỡ. */
  audienceScope?: 'public' | 'connections' | 'custom';
  audienceListId?: string | null;
  /** Tên danh sách riêng; null khi danh sách đã bị xoá. */
  audienceListName?: string | null;
  media?: PostMediaItem[];
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  /** Số báo cáo đang chờ. */
  pendingReportCount?: number;
  createdAt?: string;
}

interface PostStats {
  all: number;
  active: number;
  inactive: number;
  reported: number;
  byScope: Record<string, number>;
}

/**
 * Nhãn phạm vi hiển thị — một nguồn duy nhất cho list và detail.
 *
 * "Người kết nối" là từ đang dùng trong app (`PostComposerScreen`), không phải
 * "bạn bè": repo chưa từng dùng từ đó, đổi ở admin sẽ khiến moderator và người
 * dùng gọi cùng một thứ bằng hai tên.
 */
export function scopeLabel(post: {
  audienceScope?: string;
  audienceListName?: string | null;
}): string {
  switch (post.audienceScope) {
    case 'connections':
      return 'Người kết nối';
    case 'custom':
      return post.audienceListName
        ? `Danh sách: ${post.audienceListName}`
        : 'Danh sách riêng';
    default:
      return 'Công khai';
  }
}

/** Phạm vi càng rộng thì gỡ càng khẩn — badge phải phản ánh điều đó. */
export function scopeTone(scope?: string): 'danger' | 'warning' | 'muted' {
  if (scope === 'public') return 'danger';
  if (scope === 'connections') return 'warning';
  return 'muted';
}

/**
 * Trang Bài đăng — tra cứu và gỡ xuống.
 *
 * KHÔNG có duyệt trước: bài đăng lên feed ngay khi người dùng tạo. Trang này
 * tồn tại để moderator tìm đúng bài khi có báo cáo (hoặc bị quét ra vi phạm)
 * rồi gỡ xuống, và để hoàn tác khi gỡ nhầm. Không có cột "chờ duyệt", không có
 * thao tác hàng loạt.
 *
 * Gỡ là ẩn mềm (`isActive=false`), nội dung vẫn trong DB nên không cần
 * type-to-confirm — chi tiết này nói thẳng trong `ConfirmDialog`.
 */
export default function PostsPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { values, set, reset } = useUrlFilters({
    active: '',
    q: '',
    scope: '',
    sort: '',
    page: '1',
    pageSize: '20',
    focus: '',
  });

  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const active = (ACTIVE_TABS as readonly string[]).includes(values.active) ? values.active : '';
  const sort = (() => {
    const [field, dir] = (values.sort ?? '').split(':');
    return (SORT_FIELDS as readonly string[]).includes(field) && (dir === 'asc' || dir === 'desc')
      ? values.sort
      : '';
  })();
  const scope = (['public', 'connections', 'custom'] as readonly string[]).includes(values.scope)
    ? values.scope
    : '';
  const focus = values.focus.trim();

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<PostItem>(
    ['posts', active, values.q, scope, sort, page, pageSize],
    '/admin/posts',
    {
      page,
      limit: pageSize,
      active: active === '' ? undefined : active,
      q: values.q.trim() || undefined,
      scope: scope || undefined,
      sort: sort || undefined,
    },
  );

  // Tab count lấy từ server, không đếm trang hiện tại — một trang chỉ có 20 dòng.
  const statsQuery = useQuery({
    queryKey: ['post-stats'],
    queryFn: async () => (await apiClient.get<PostStats>('/admin/posts/stats')).data,
    staleTime: 60_000,
  });
  const stats = statsQuery.data;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [takedownTarget, setTakedownTarget] = useState<PostItem | null>(null);
  const [lightbox, setLightbox] = useState<PostItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Ô tìm kiếm: state cục bộ + debounce 400ms + Enter chốt ngay. Ghi thẳng vào
  // URL mỗi phím sẽ tạo một history entry và một request mỗi ký tự.
  const [searchInput, setSearchInput] = useState(values.q);
  useEffect(() => setSearchInput(values.q), [values.q]);
  useEffect(() => {
    if (searchInput.trim() === values.q) return;
    const id = setTimeout(() => set({ q: searchInput.trim(), page: '1' }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Deep-link `?focus=<postId>` từ trang báo cáo: tải đúng bài đó kể cả khi nó
  // đã bị gỡ hoặc nằm ngoài trang/tab đang xem.
  const { data: focused, isError: focusError } = useQuery({
    queryKey: ['post', focus],
    queryFn: async () => (await apiClient.get<PostItem>(`/admin/posts/${focus}`)).data,
    enabled: focus.length > 0,
  });

  function openDetail(id: string) {
    navigate(`/posts/${id}`, { state: { from: `${location.pathname}${location.search}` } });
  }

  function toggleSort(field: string) {
    const [cur, dir] = sort.split(':');
    set({
      sort: cur === field && dir === 'asc' ? `${field}:desc` : `${field}:asc`,
      page: '1',
    });
  }

  async function confirmTakedown() {
    if (!takedownTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/posts/${takedownTarget._id}/takedown`);
      addToast('success', 'Đã gỡ bài đăng.');
      setTakedownTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
      void queryClient.invalidateQueries({ queryKey: ['post-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['post', focus] });
      void queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Gỡ bài đăng thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  async function restoreRow(id: string) {
    setRestoringId(id);
    try {
      await apiClient.post(`/admin/posts/${id}/restore`);
      addToast('success', 'Đã khôi phục bài đăng.');
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
      void queryClient.invalidateQueries({ queryKey: ['post-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['post', focus] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Khôi phục thất bại'));
    } finally {
      setRestoringId(null);
    }
  }

  async function runExport() {
    setExporting(true);
    try {
      // Xuất toàn bộ theo bộ lọc hiện tại, không chỉ trang đang xem: câu hỏi
      // "có bao nhiêu bài như thế này" không trả lời được bằng 20 dòng.
      const res = await apiClient.get<{ data: PostItem[]; total: number; truncated?: boolean }>(
        '/admin/posts',
        { params: { active: active || undefined, q: values.q.trim() || undefined, scope: scope || undefined, sort: sort || undefined, limit: 100, page: 1 } },
      );
      const rowsToWrite = res.data.data ?? [];
      const header = ['ID', 'Tác giả', 'Nội dung', 'Phạm vi', 'Trạng thái', 'Thích', 'Bình luận', 'Chia sẻ', 'Báo cáo chờ', 'Ngày đăng'];
      const lines = rowsToWrite.map((p) => [
        p._id,
        p.authorName ?? '',
        p.caption ?? '',
        scopeLabel(p),
        p.isActive === false ? 'Đã gỡ' : 'Đang hiển thị',
        p.likeCount ?? 0,
        p.commentCount ?? 0,
        p.shareCount ?? 0,
        p.pendingReportCount ?? 0,
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
      ].map(toCsvCell).join(','));
      const blob = new Blob([`﻿${[header.join(','), ...lines].join('\n')}`], {
        type: 'text/csv;charset=utf-8',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bai-dang-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast(
        rowsToWrite.length < total ? 'warning' : 'success',
        rowsToWrite.length < total
          ? `Chỉ xuất ${rowsToWrite.length}/${total} dòng — thu hẹp bộ lọc để xuất hết.`
          : `Đã xuất ${rowsToWrite.length} dòng.`,
      );
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Xuất CSV thất bại'));
    } finally {
      setExporting(false);
    }
  }

  // Bàn phím J/K/Enter — cùng quy ước với BusinessesPage.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (document.querySelector('.dialog')) return;

      if (e.key === 'j' || e.key === 'J') {
        setHighlight((h) => Math.min(h + 1, rowsRef.current.length - 1));
      } else if (e.key === 'k' || e.key === 'K') {
        setHighlight((h) => Math.max(h - 1, -1));
      } else if (e.key === 'Enter') {
        if (t?.closest('button, a, tr[tabindex="0"]')) return;
        const row = rowsRef.current[highlight];
        if (row) openDetail(row._id);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  useEffect(() => {
    setHighlight(-1);
  }, [active, values.q, scope, page]);

  const activeFilters: Array<{ key: string; label: string }> = [];
  if (values.q.trim()) activeFilters.push({ key: 'q', label: `Từ khoá: ${values.q.trim()}` });
  if (scope) activeFilters.push({ key: 'scope', label: `Phạm vi: ${scopeLabel({ audienceScope: scope })}` });
  if (active) activeFilters.push({ key: 'active', label: active === 'true' ? 'Đang hiển thị' : 'Đã gỡ' });
  const hasActiveFilter = activeFilters.length > 0;

  function clearFilters() {
    setSearchInput('');
    reset();
  }

  /** Ảnh xem trước: ảnh dùng chính media, video dùng thumbnail. */
  function thumbOf(post: PostItem): string | null {
    const first = post.media?.[0];
    if (!first) return null;
    return first.mediaType === 'video'
      ? first.thumbnailUrlSigned ?? null
      : first.mediaUrlSigned ?? null;
  }

  return (
    <div className="page-stack">
      <ListHeader
        title="Bài đăng"
        count={total}
        actions={(
          <>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => void runExport()}
              disabled={exporting}
            >
              <Download size={14} aria-hidden /> {exporting ? 'Đang xuất…' : 'Xuất CSV'}
            </button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
              Làm mới
            </button>
          </>
        )}
      >
        <input
          className="input filter-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') set({ q: searchInput.trim(), page: '1' });
          }}
          placeholder="Tìm theo nội dung hoặc tên tác giả"
          aria-label="Tìm kiếm bài đăng"
        />
      </ListHeader>

      <div className="filter-bar">
        <StatusTabs
          tabs={[
            { key: '', label: 'Tất cả', count: stats?.all },
            { key: 'true', label: 'Đang hiển thị', count: stats?.active },
            { key: 'false', label: 'Đã gỡ', count: stats?.inactive },
          ]}
          active={active}
          onChange={(k) => set({ active: k, page: '1' })}
        />
        {stats && stats.reported > 0 && (
          <span className="cell-meta">
            {formatNumber(stats.reported)} bài có báo cáo chờ
          </span>
        )}
      </div>

      {hasActiveFilter && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => {
                if (f.key === 'q') setSearchInput('');
                set({ [f.key]: '', page: '1' });
              }}
              aria-label={`Gỡ lọc ${f.label}`}
            >
              {f.label} <X size={12} aria-hidden />
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" type="button" onClick={clearFilters}>
            Xoá bộ lọc
          </button>
        </div>
      )}

      {/* Bài được deep-link tới — hiện riêng để không phụ thuộc tab/trang. */}
      {focus && (
        <TableShell title="Bài đăng được chỉ tới">
          {focusError ? (
            <StateBlock
              variant="error" title="Không tải được bài đăng"
              copy="Bài có thể đã bị xoá cứng hoặc id không hợp lệ."
            >
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => set({ focus: '' })}>
                Bỏ chỉ tới
              </button>
            </StateBlock>
          ) : !focused ? (
            <StateBlock variant="loading" title="Đang tải bài đăng" copy="Đang lấy nội dung được báo cáo." />
          ) : (
            <div className="mod-focus-row">
              {thumbOf(focused) ? (
                <button
                  className="mod-thumb"
                  type="button"
                  onClick={() => setLightbox(focused)}
                  aria-label="Xem media của bài đăng"
                >
                  <img src={thumbOf(focused) ?? ''} alt="" />
                </button>
              ) : (
                <span className="mod-thumb mod-thumb-empty" title="Không có ảnh xem trước">
                  <Camera size={20} strokeWidth={2} aria-hidden />
                </span>
              )}
              <div className="mod-focus-body">
                <div className="cell-title">
                  {focused.caption?.trim() || 'Không có nội dung'}
                </div>
                <p className="cell-meta">
                  {focused.authorName ?? 'Tài khoản đã xoá'}
                  {' · '}
                  {scopeLabel(focused)}
                  {' · '}
                  {focused.isActive === false ? 'Đã gỡ' : 'Đang hiển thị'}
                  {(focused.pendingReportCount ?? 0) > 0
                    ? ` · ${formatNumber(focused.pendingReportCount ?? 0)} báo cáo chờ`
                    : ''}
                </p>
              </div>
              <div className="table-actions table-actions--end">
                {focused.isActive === false ? (
                  <button
                    className="btn btn-secondary btn-sm" type="button"
                    disabled={restoringId === focused._id}
                    onClick={() => void restoreRow(focused._id)}
                  >
                    {restoringId === focused._id ? 'Đang mở…' : 'Khôi phục'}
                  </button>
                ) : (
                  <button className="btn btn-danger-ghost btn-sm" type="button" onClick={() => setTakedownTarget(focused)}>
                    Gỡ
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => set({ focus: '' })}>
                  Bỏ chỉ tới
                </button>
              </div>
            </div>
          )}
        </TableShell>
      )}

      <TableShell>
        {isError && (
          <StateBlock
            variant="error" title="Không tải được bài đăng"
            copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}
          >
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && (
          <StateBlock variant="loading" title="Đang tải bài đăng" copy="Đang lấy danh sách bài mới nhất." />
        )}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--posts">
            <table className="data-table data-table--compact" aria-label="Danh sách bài đăng">
              <thead>
                <tr>
                  <th scope="col">Tác giả</th>
                  <th scope="col" className="col-hide-mobile">Media</th>
                  <ColumnHeader label="Nội dung" className="col-caption" />
                  <ColumnHeader
                    label="Phạm vi"
                    filter={{
                      value: scope,
                      options: [
                        { value: '', label: 'Mọi phạm vi' },
                        { value: 'public', label: 'Công khai' },
                        { value: 'connections', label: 'Người kết nối' },
                        { value: 'custom', label: 'Danh sách riêng' },
                      ],
                      onChange: (v) => set({ scope: v, page: '1' }),
                    }}
                  />
                  {/* Gộp ba cột số vào một ô: 10 cột riêng không vừa 1440px và
                      cột nội dung bị bóp còn 8 ký tự. Thứ tự đọc vẫn rõ nhờ icon. */}
                  <th scope="col" className="col-num col-hide-mobile">Tương tác</th>
                  <th scope="col">Trạng thái</th>
                  <ColumnHeader
                    label="Ngày đăng"
                    sortField="createdAt"
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
                        <EmptyState
                          title="Không khớp bài đăng nào"
                          copy="Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm."
                          action={(
                            <button className="btn btn-secondary btn-sm" type="button" onClick={clearFilters}>
                              Xoá bộ lọc
                            </button>
                          )}
                        />
                      ) : (
                        <EmptyState
                          title={active === 'false' ? 'Chưa có bài đăng nào bị gỡ' : 'Chưa có bài đăng nào'}
                          copy={active === 'false'
                            ? 'Bài bị gỡ sẽ nằm ở đây để đối soát và khôi phục.'
                            : 'Bài đăng sẽ xuất hiện khi người dùng đăng.'}
                        />
                      )}
                    </td>
                  </tr>
                )}
                {rows.map((p, i) => {
                  const caption = p.caption ?? '';
                  const thumbUrl = thumbOf(p);
                  return (
                    <tr
                      key={p._id}
                      tabIndex={0}
                      className={`row-clickable${i === highlight ? ' row-highlight' : ''}`}
                      aria-label={`Xem chi tiết ${caption || 'bài đăng'}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button, a, input, select')) return;
                        openDetail(p._id);
                      }}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetail(p._id);
                        }
                      }}
                    >
                      <td>
                        <div className="cell-primary">
                          {p.authorAvatar ? (
                            <img className="cell-avatar" src={p.authorAvatar} alt="" loading="lazy" />
                          ) : (
                            <span className="cell-avatar" aria-hidden>
                              {(p.authorName ?? '?').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="cell-author">{p.authorName ?? <span className="cell-meta">Tài khoản đã xoá</span>}</span>
                        </div>
                      </td>
                      <td className="col-hide-mobile">
                        {thumbUrl
                          ? (
                            <button
                              className="mod-thumb"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightbox(p);
                              }}
                              aria-label={p.authorName ? `Xem media bài của ${p.authorName}` : 'Xem media'}
                            >
                              <img src={thumbUrl} alt="" loading="lazy" />
                            </button>
                          )
                          : (
                            <span className="mod-thumb mod-thumb-empty" title="Không có ảnh xem trước">
                              <Camera size={20} strokeWidth={2} aria-hidden />
                            </span>
                          )}
                      </td>
                      <td>
                        {caption
                          ? <span className="cell-clamp" title={caption}>{caption}</span>
                          : <span className="cell-meta">Không có nội dung</span>}
                      </td>
                      <td>
                        <StatusBadge
                          tone={scopeTone(p.audienceScope)}
                          label={scopeLabel(p)}
                        />
                      </td>
                      <td className="col-num col-hide-mobile">
                        <span className="cell-stats">
                          <span title={`${formatNumber(p.likeCount ?? 0)} lượt thích`}>
                            ♥ {formatNumber(p.likeCount ?? 0)}
                          </span>
                          <span title={`${formatNumber(p.commentCount ?? 0)} bình luận`}>
                            💬 {formatNumber(p.commentCount ?? 0)}
                          </span>
                          {(p.pendingReportCount ?? 0) > 0 && (
                            <strong title={`${formatNumber(p.pendingReportCount ?? 0)} báo cáo chờ`}>
                              ⚑ {formatNumber(p.pendingReportCount ?? 0)}
                            </strong>
                          )}
                        </span>
                      </td>
                      <td>
                        {p.isActive === false
                          ? <StatusBadge tone="muted" label="Đã gỡ" />
                          : <StatusBadge tone="success" label="Đang hiển thị" />}
                      </td>
                      <td className="col-hide-mobile cell-date">{formatDateTime(p.createdAt)}</td>
                      <td className="col-sticky">
                        <div className="table-actions table-actions--end">
                          {p.isActive === false ? (
                            <button
                              className="btn btn-secondary btn-sm" type="button"
                              disabled={restoringId === p._id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void restoreRow(p._id);
                              }}
                              aria-label="Khôi phục bài đăng"
                            >
                              {restoringId === p._id ? 'Đang mở…' : 'Khôi phục'}
                            </button>
                          ) : (
                            <button
                              className="btn btn-danger-ghost btn-sm" type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTakedownTarget(p);
                              }}
                              aria-label={p.authorName ? `Gỡ bài của ${p.authorName}` : 'Gỡ bài đăng'}
                            >
                              Gỡ
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page} totalPages={totalPages} total={total} unit="bài"
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      <Dialog
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        labelId="post-lightbox-title"
      >
        <div className="dialog lightbox-dialog">
          <div className="dialog-header">
            <div>
              <div className="page-eyebrow">Bài đăng</div>
              <h2 id="post-lightbox-title" className="panel-title">
                {lightbox?.authorName ?? 'Tài khoản đã xoá'}
              </h2>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setLightbox(null)} type="button">
              Đóng
            </button>
          </div>
          <div className="dialog-body lightbox-body">
            {(lightbox?.media ?? []).length === 0 && (
              <p className="cell-meta">Bài đăng không có media.</p>
            )}
            {(lightbox?.media ?? []).map((m, i) => (
              <div key={`${m.mediaKey}-${i}`} className="page-stack">
                {m.mediaType === 'video' ? (
                  m.mediaUrlSigned
                    ? <video controls src={m.mediaUrlSigned} className="lightbox-image" />
                    : <p className="alert" role="alert">Không tải được media. URL có thể đã hết hạn.</p>
                ) : (
                  m.mediaUrlSigned
                    ? <img className="lightbox-image" src={m.mediaUrlSigned} alt={`Media ${i + 1} của bài đăng`} />
                    : <p className="alert" role="alert">Không tải được media. URL có thể đã hết hạn.</p>
                )}
              </div>
            ))}
            {lightbox?.createdAt && (
              <p className="cell-meta">Đăng lúc {formatDateTime(lightbox.createdAt)}</p>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={takedownTarget !== null}
        onClose={() => setTakedownTarget(null)}
        title="Gỡ bài đăng?"
        description={
          takedownTarget
            ? `Phạm vi: ${scopeLabel(takedownTarget)}. Bài bị ẩn khỏi feed, nội dung vẫn giữ trong DB và có thể khôi phục.`
            : ''
        }
        confirmLabel="Gỡ bài đăng"
        busy={busy}
        onConfirm={confirmTakedown}
      />
    </div>
  );
}

function toCsvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
