import './moderation-media.css';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
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

const PAGE_SIZES = [20, 50];

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
  media?: PostMediaItem[];
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  /** Số báo cáo đang chờ — chỉ có ở route chi tiết. */
  pendingReportCount?: number;
  createdAt?: string;
}

const ACTIVE_TABS = ['', 'true', 'false'] as const;

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
  const { values, set } = useUrlFilters({ active: '', page: '1', pageSize: '20', focus: '' });
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const active = (ACTIVE_TABS as readonly string[]).includes(values.active) ? values.active : '';
  const focus = values.focus.trim();

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<PostItem>(
    ['posts', active, page, pageSize],
    '/admin/posts',
    {
      page,
      limit: pageSize,
      active: active === '' ? undefined : active,
    },
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [takedownTarget, setTakedownTarget] = useState<PostItem | null>(null);
  const [lightbox, setLightbox] = useState<PostItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

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

  async function confirmTakedown() {
    if (!takedownTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/posts/${takedownTarget._id}/takedown`);
      addToast('success', 'Đã gỡ bài đăng.');
      setTakedownTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
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
      void queryClient.invalidateQueries({ queryKey: ['post', focus] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Khôi phục thất bại'));
    } finally {
      setRestoringId(null);
    }
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
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
            Làm mới
          </button>
        )}
      >
        <StatusTabs
          tabs={[
            { key: '', label: 'Tất cả' },
            { key: 'true', label: 'Đang hiển thị' },
            { key: 'false', label: 'Đã gỡ' },
          ]}
          active={active}
          onChange={(k) => set({ active: k, page: '1' })}
        />
      </ListHeader>

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
                  {focused.isActive === false ? 'Đã gỡ' : 'Đang hiển thị'}
                  {typeof focused.pendingReportCount === 'number' && focused.pendingReportCount > 0
                    ? ` · ${formatNumber(focused.pendingReportCount)} báo cáo chờ`
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
          <div className="table-scroll">
            <table className="data-table data-table--compact" aria-label="Danh sách bài đăng">
              <thead>
                <tr>
                  <th scope="col">Tác giả</th>
                  <th scope="col" className="col-hide-mobile">Media</th>
                  <th scope="col">Nội dung</th>
                  <th scope="col" className="col-hide-mobile">Tương tác</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" className="th-center col-sticky">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title={active === 'true'
                          ? 'Không có bài đăng đang hiển thị'
                          : active === 'false'
                            ? 'Chưa có bài đăng nào bị gỡ'
                            : 'Chưa có bài đăng nào'}
                        copy={active === 'true'
                          ? 'Mọi bài đang hoạt động đã bị gỡ hoặc chưa có ai đăng.'
                          : active === 'false'
                            ? 'Bài bị gỡ sẽ nằm ở đây để đối soát và khôi phục.'
                            : 'Bài đăng sẽ xuất hiện khi người dùng đăng.'}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((p) => {
                  const caption = p.caption ?? '';
                  const thumbUrl = thumbOf(p);
                  return (
                    <tr
                      key={p._id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Xem chi tiết ${caption || 'bài đăng'}`}
                      onClick={() => openDetail(p._id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetail(p._id);
                        }
                      }}
                    >
                      <td>
                        {p.authorName
                          ?? <span className="cell-meta">Tài khoản đã xoá</span>}
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
                          ? (
                            <span title={caption}>
                              {caption.length > 60 ? `${caption.slice(0, 60)}…` : caption}
                            </span>
                          )
                          : <span className="cell-meta">Không có nội dung</span>}
                      </td>
                      <td className="col-hide-mobile">
                        <span className="cell-meta">
                          ♥ {formatNumber(p.likeCount ?? 0)} · 💬 {formatNumber(p.commentCount ?? 0)}
                          {typeof p.pendingReportCount === 'number' && p.pendingReportCount > 0 && (
                            <>
                              {' · '}
                              <strong>{formatNumber(p.pendingReportCount)} báo cáo</strong>
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        {p.isActive === false
                          ? <StatusBadge tone="muted" label="Đã gỡ" />
                          : <StatusBadge tone="success" label="Đang hiển thị" />}
                      </td>
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
        description="Bài bị ẩn khỏi feed, nội dung vẫn giữ trong DB và có thể khôi phục. Người xem không còn thấy bài này."
        confirmLabel="Gỡ bài đăng"
        busy={busy}
        onConfirm={confirmTakedown}
      />
    </div>
  );
}
