import './moderation-media.css';
import { useState } from 'react';
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
import { apiErrorMessage } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';

const PAGE_SIZES = [20, 50];

interface StoryItem {
  _id: string;
  authorId?: string;
  /** Tên tác giả resolve lúc đọc; null khi tài khoản đã bị xoá. */
  authorName?: string | null;
  caption?: string;
  isActive?: boolean;
  mediaType?: 'image' | 'video';
  /** URL đã ký; null khi presign thất bại. */
  mediaUrlSigned?: string | null;
  thumbnailUrlSigned?: string | null;
}

const ACTIVE_TABS = ['', 'true', 'false'] as const;

/**
 * Trang Moments — duyệt và gỡ story.
 *
 * Gỡ story là ẩn tạm (isActive=false), nội dung vẫn trong DB nên không cần
 * type-to-confirm; chi tiết này nói thẳng trong description của ConfirmDialog.
 */
export default function MomentsModerationPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { values, set } = useUrlFilters({ active: '', page: '1', pageSize: '20', focus: '' });
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const active = (ACTIVE_TABS as readonly string[]).includes(values.active) ? values.active : '';
  const focus = values.focus.trim();

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<StoryItem>(
    ['stories', active, page, pageSize],
    '/admin/stories',
    {
      page,
      limit: pageSize,
      active: active === '' ? undefined : active,
    },
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [takedownTarget, setTakedownTarget] = useState<StoryItem | null>(null);
  const [lightbox, setLightbox] = useState<StoryItem | null>(null);
  const [busy, setBusy] = useState(false);

  // Deep-link `?focus=<storyId>` từ trang báo cáo: tải đúng story đó kể cả khi
  // nó đã bị gỡ hoặc nằm ngoài trang/tab đang xem.
  const { data: focused, isError: focusError } = useQuery({
    queryKey: ['story', focus],
    queryFn: async () => (await apiClient.get<StoryItem>(`/admin/stories/${focus}`)).data,
    enabled: focus.length > 0,
  });

  async function confirmTakedown() {
    if (!takedownTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/stories/${takedownTarget._id}/takedown`);
      addToast('success', 'Đã gỡ story.');
      setTakedownTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
      if (focus) void queryClient.invalidateQueries({ queryKey: ['story', focus] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Gỡ story thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <ListHeader
        title="Moments"
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

      {/* Story được deep-link tới — hiện riêng để không phụ thuộc tab/trang. */}
      {focus && (
        <TableShell title="Story được chỉ tới">
          {focusError ? (
            <StateBlock
              variant="error" title="Không tải được story"
              copy="Story có thể đã bị xoá cứng hoặc id không hợp lệ."
            >
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => set({ focus: '' })}>
                Bỏ chỉ tới
              </button>
            </StateBlock>
          ) : !focused ? (
            <StateBlock variant="loading" title="Đang tải story" copy="Đang lấy nội dung được báo cáo." />
          ) : (
            <div className="mod-focus-row">
              <button
                className="mod-thumb"
                type="button"
                onClick={() => setLightbox(focused)}
                aria-label="Xem media của story"
              >
                <img
                  src={focused.mediaType === 'video'
                    ? focused.thumbnailUrlSigned ?? ''
                    : focused.mediaUrlSigned ?? ''}
                  alt=""
                />
              </button>
              <div className="mod-focus-body">
                <div className="cell-title">
                  {focused.caption?.trim() || 'Không có caption'}
                </div>
                <p className="cell-meta">
                  {focused.authorName ?? 'Tài khoản đã xoá'}
                  {' · '}
                  {focused.isActive === false ? 'Đã gỡ' : 'Đang hiển thị'}
                </p>
              </div>
              <div className="table-actions table-actions--end">
                {focused.isActive !== false && (
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
            variant="error" title="Không tải được story"
            copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}
          >
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && (
          <StateBlock variant="loading" title="Đang tải story" copy="Đang lấy danh sách story mới nhất." />
        )}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Danh sách story">
              <thead>
                <tr>
                  <th scope="col">Tác giả</th>
                  <th scope="col" className="col-hide-mobile">Media</th>
                  <th scope="col">Caption</th>
                  <th scope="col">Hoạt động</th>
                  <th scope="col" className="th-center col-sticky">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title={active === 'true'
                          ? 'Không có story đang hiển thị'
                          : active === 'false'
                            ? 'Chưa có story nào bị gỡ'
                            : 'Chưa có story nào'}
                        copy={active === 'true'
                          ? 'Mọi story đang hoạt động đã bị gỡ hoặc hết hạn.'
                          : active === 'false'
                            ? 'Story bị gỡ sẽ nằm ở đây để đối soát.'
                            : 'Story sẽ xuất hiện khi người dùng đăng.'}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((s) => {
                  const caption = s.caption ?? '';
                  // Video ưu tiên thumbnail; ảnh dùng chính media đã ký.
                  const thumbUrl = s.mediaType === 'video'
                    ? s.thumbnailUrlSigned ?? null
                    : s.mediaUrlSigned ?? null;
                  return (
                    <tr key={s._id}>
                      <td>
                        {s.authorName
                          ?? <span className="cell-meta">Tài khoản đã xoá</span>}
                      </td>
                      <td className="col-hide-mobile">
                        {thumbUrl
                          ? (
                            <button
                              className="mod-thumb"
                              type="button"
                              onClick={() => setLightbox(s)}
                              aria-label={s.authorName ? `Xem media của ${s.authorName}` : 'Xem media'}
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
                          : <span className="cell-meta">Không có caption</span>}
                      </td>
                      <td>
                        {s.isActive === false
                          ? <StatusBadge tone="muted" label="Đã gỡ" />
                          : <StatusBadge tone="success" label="Đang hiển thị" />}
                      </td>
                      <td className="col-sticky">
                        <div className="table-actions table-actions--end">
                          <button
                            className="btn btn-danger-ghost btn-sm" type="button"
                            disabled={s.isActive === false}
                            onClick={() => setTakedownTarget(s)}
                            aria-label={s.authorName ? `Gỡ story của ${s.authorName}` : 'Gỡ story'}
                          >
                            Gỡ
                          </button>
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
          page={page} totalPages={totalPages} total={total} unit="story"
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      <Dialog
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        labelId="moment-lightbox-title"
      >
        <div className="dialog lightbox-dialog">
          <div className="dialog-header">
            <div>
              <div className="page-eyebrow">Moment media</div>
              <h2 id="moment-lightbox-title" className="panel-title">
                {lightbox?.authorName ?? 'Tài khoản đã xoá'}
              </h2>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setLightbox(null)} type="button">
              Đóng
            </button>
          </div>
          <div className="dialog-body lightbox-body">
            {lightbox?.mediaUrlSigned ? (
              <>
                {lightbox.mediaType === 'video'
                  ? <video controls src={lightbox.mediaUrlSigned} className="lightbox-image" />
                  : <img className="lightbox-image" src={lightbox.mediaUrlSigned} alt="Media của story" />}
                <div className="lightbox-actions">
                  <a
                    href={lightbox.mediaUrlSigned}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    Mở link gốc
                  </a>
                </div>
              </>
            ) : (
              <p className="alert" role="alert">Không tải được media. URL có thể đã hết hạn.</p>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={takedownTarget !== null}
        onClose={() => setTakedownTarget(null)}
        title="Gỡ story?"
        description="Story bị gỡ khỏi feed, nội dung vẫn giữ trong DB. Người xem không còn thấy story này."
        confirmLabel="Gỡ story"
        busy={busy}
        onConfirm={confirmTakedown}
      />
    </div>
  );
}
