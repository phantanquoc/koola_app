import './moderation-media.css';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { apiErrorMessage } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';
import type { AdminListResult } from '../hooks/useAdminList';

const PAGE_SIZE = 20;

interface MessageItem {
  _id: string;
  content?: string;
  conversationId?: string;
  /** Tên hội thoại resolve lúc đọc; null khi hội thoại đã bị xoá. */
  conversationName?: string | null;
  senderId?: string;
  /** Tên người gửi resolve lúc đọc; null khi tài khoản đã bị xoá. */
  senderName?: string | null;
  createdAt?: string;
  type?: string;
  /** MinIO key thô — web không mở trực tiếp được. */
  mediaUrl?: string;
  /** URL đã ký; null khi presign thất bại. */
  mediaUrlSigned?: string | null;
}

/** Rút gọn định danh — không dán ObjectId đầy đủ lên UI. */
function shortId(id: string) {
  return `${id.slice(0, 8)}…`;
}

/**
 * Thumbnail nhỏ cạnh nội dung. Chỉ ảnh/video mới xem trước được; voice/file
 * không có khung hình nên bỏ qua. Dùng URL đã ký, không dùng key MinIO.
 */
function MediaThumb({ type, url }: { type?: string; url?: string | null }) {
  if (!url || (type !== 'image' && type !== 'video')) return null;
  if (type === 'video') {
    return <video className="mod-media-thumb" src={url} preload="metadata" muted aria-hidden />;
  }
  return <img className="mod-media-thumb" src={url} alt="Media đính kèm" loading="lazy" />;
}

/**
 * Trang Tìm tin nhắn — archetype list §3A.
 *
 * `q` nằm trong URL nên link từ command palette
 * (`/messages?q=...`) mở đúng kết quả, và đổi trang là đổi query key →
 * TanStack Query tự fetch lại (trước đây đổi page chỉ đổi state, API không
 * chạy lại nên trang 2 hiện dữ liệu trang 1).
 */
export default function MessageSearchPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { values, set } = useUrlFilters({ q: '', page: '1', focus: '' });
  const q = values.q.trim();
  const page = Math.max(1, Number(values.page) || 1);
  const focus = values.focus.trim();

  // Ô nhập tách khỏi `q` trong URL: gõ chưa bấm Tìm thì chưa gọi API.
  const [qInput, setQInput] = useState(values.q);
  useEffect(() => setQInput(values.q), [values.q]);

  const queryKey = useMemo(() => ['admin-messages', q, page], [q, page]);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => (
      await apiClient.get<AdminListResult<MessageItem>>('/admin/messages/search', {
        params: { q, page, limit: PAGE_SIZE },
      })
    ).data,
    // Deep link `?q=...` tự fetch; chưa có từ khoá thì không gọi (API 400 vì q bắt buộc).
    enabled: q.length > 0,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Deep-link `?focus=<messageId>` từ trang báo cáo: tải đúng tin nhắn đó,
  // kể cả khi nó đã bị gỡ hoặc không khớp từ khoá đang gõ.
  const { data: focused, isError: focusError } = useQuery({
    queryKey: ['admin-message', focus],
    queryFn: async () => (await apiClient.get<MessageItem>(`/admin/messages/${focus}`)).data,
    enabled: focus.length > 0,
  });

  const [deleteTarget, setDeleteTarget] = useState<MessageItem | null>(null);
  const [busy, setBusy] = useState(false);

  // Trang vượt quá tổng số trang (deep-link page cũ) → kẹp về trang cuối.
  useEffect(() => {
    if (q && !isLoading && total > 0 && page > totalPages) set({ page: String(totalPages) });
  }, [q, isLoading, total, page, totalPages, set]);

  function submitSearch() {
    const next = qInput.trim();
    // Cùng từ khoá + cùng trang thì URL không đổi → query key không đổi, phải
    // gọi refetch tay, nếu không bấm "Tìm" lần hai không thấy gì xảy ra.
    if (next === q && page === 1) void refetch();
    else set({ q: next, page: '1' });
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/messages/${deleteTarget._id}/soft-delete`);
      queryClient.setQueryData<AdminListResult<MessageItem>>(queryKey, (prev) => prev ? {
        ...prev,
        data: prev.data.filter((m) => m._id !== deleteTarget._id),
        total: Math.max(0, prev.total - 1),
      } : prev);
      addToast('success', 'Đã gỡ tin nhắn.');
      setDeleteTarget(null);
      // Khối "được chỉ tới" giữ bản cache riêng — nếu không làm mới, nó vẫn
      // hiện nút Gỡ cho tin vừa gỡ xong.
      if (focus) void queryClient.invalidateQueries({ queryKey: ['admin-message', focus] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Gỡ tin nhắn thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <ListHeader
        title="Tin nhắn"
        count={total}
        actions={(
          <button
            className="btn btn-secondary btn-sm" type="button"
            onClick={() => refetch()} disabled={!q}
          >
            Làm mới
          </button>
        )}
      >
        <div className="filter-search-wrap">
          <Search size={15} className="filter-search-icon" aria-hidden />
          <input
            className="input filter-search filter-search--icon" type="search" value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
            placeholder="Từ khoá trong nội dung tin nhắn"
            aria-label="Từ khoá tìm tin nhắn"
          />
        </div>
        <button
          className="btn btn-primary btn-sm" type="button"
          onClick={submitSearch} disabled={!qInput.trim()}
        >
          Tìm
        </button>
      </ListHeader>

      {/* Tin nhắn được deep-link tới — hiện riêng để không phụ thuộc kết quả
          tìm kiếm hiện tại (có thể khác từ khoá hoặc đã bị gỡ). */}
      {focus && (
        <TableShell title="Tin nhắn được chỉ tới">
          {focusError ? (
            <StateBlock
              variant="error" title="Không tải được tin nhắn"
              copy="Tin nhắn có thể đã bị xoá cứng hoặc id không hợp lệ."
            >
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => set({ focus: '' })}>
                Bỏ chỉ tới
              </button>
            </StateBlock>
          ) : !focused ? (
            <StateBlock variant="loading" title="Đang tải tin nhắn" copy="Đang lấy nội dung được báo cáo." />
          ) : (
            <div className="mod-media-cell" style={{ padding: 'var(--space-3)' }}>
              <MediaThumb type={focused.type} url={focused.mediaUrlSigned} />
              <div>
                <div className="cell-title">
                  {focused.content?.trim() || 'Không có nội dung văn bản'}
                </div>
                <p className="cell-meta">
                  {focused.senderName ?? (focused.senderId ? shortId(focused.senderId) : '—')}
                  {' · '}
                  {focused.conversationName
                    ?? (focused.conversationId ? shortId(focused.conversationId) : '—')}
                </p>
              </div>
              <div className="table-actions">
                <button className="btn btn-danger-ghost btn-sm" type="button" onClick={() => setDeleteTarget(focused)}>
                  Gỡ
                </button>
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
            variant="error" title="Không tải được tin nhắn"
            copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}
          >
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && (
          <StateBlock variant="loading" title="Đang tìm tin nhắn" copy="Đang quét nội dung trên mọi hội thoại." />
        )}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Kết quả tìm tin nhắn">
              <thead>
                <tr>
                  <th scope="col">Nội dung</th>
                  <th scope="col" className="col-hide-mobile">Hội thoại</th>
                  <th scope="col" className="col-hide-xs">Người gửi</th>
                  <th scope="col" className="th-center col-sticky">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        title={q ? 'Không tìm thấy tin nhắn nào khớp' : 'Nhập từ khoá để tìm tin nhắn'}
                        copy={q
                          ? 'Thử từ khoá ngắn hơn hoặc một cụm khác. Tin nhắn đã gỡ không nằm trong kết quả.'
                          : 'Tìm xuyên mọi hội thoại theo nội dung tin nhắn.'}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((m) => {
                  const content = (m.content ?? '').trim();
                  const sender = m.senderName
                    ?? (m.senderId ? shortId(m.senderId) : null);
                  return (
                    <tr key={m._id}>
                      <td>
                        <div className="mod-media-cell">
                          <MediaThumb type={m.type} url={m.mediaUrlSigned} />
                          {content
                            ? <span title={content}>{content.length > 140 ? `${content.slice(0, 140)}…` : content}</span>
                            : m.mediaUrl ? (
                              <span className="cell-meta">
                                {m.mediaUrlSigned === null ? 'Không tải được media' : 'Media đính kèm'}
                              </span>
                            ) : <span className="cell-meta">Không có nội dung văn bản</span>}
                        </div>
                      </td>
                      <td className="col-hide-mobile">
                        {m.conversationName
                          ?? (m.conversationId
                            ? <span className="cell-meta k-mono">{shortId(m.conversationId)}</span>
                            : <span className="cell-meta">—</span>)}
                      </td>
                      <td className="col-hide-xs">
                        {sender
                          ?? <span className="cell-meta">—</span>}
                      </td>
                      <td className="col-sticky">
                        <div className="table-actions table-actions--end">
                          <button
                            className="btn btn-danger-ghost btn-sm" type="button"
                            onClick={() => setDeleteTarget(m)}
                            aria-label={sender ? `Gỡ tin nhắn của ${sender}` : 'Gỡ tin nhắn'}
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
          page={page} totalPages={totalPages} total={total}
          onPageChange={(p) => set({ page: String(p) })}
        />
      </TableShell>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Gỡ tin nhắn?"
        description="Tin nhắn bị gỡ khỏi phía người dùng — họ không còn đọc được nội dung này trong hội thoại. Bản ghi vẫn giữ trong DB để đối soát."
        confirmLabel="Gỡ tin nhắn"
        busy={busy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
