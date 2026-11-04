import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Share2, X } from 'lucide-react';
import apiClient from '../apiClient';
import Dialog from './Dialog';
import { formatDateTime, formatNumber, initials } from './formatters';

interface Sharer {
  userId: string;
  name: string | null;
  avatar: string | null;
  sharedAt: string | null;
}

interface SharesPage {
  sharers: Sharer[];
  nextCursor: string | null;
  /** Số NGƯỜI phân biệt đã chia sẻ. */
  total: number;
  /** Số LƯỢT chia sẻ trên bài (dedupe 24h) — khác `total`. */
  shareCount: number;
}

/**
 * Danh sách người đã chia sẻ một bài.
 *
 * Hai con số khác nghĩa và UI phải nói rõ, nếu không moderator sẽ hiểu sai:
 * - **Người**: số tài khoản phân biệt đã bấm chia sẻ.
 * - **Lượt**: `shareCount` trên bài, chỉ tăng khi cùng một người bấm lại sau
 *   24h (Redis chặn lặp trong ngày), nên có thể lớn hơn số người.
 *
 * Tải lười như panel lượt thích: chỉ mount khi moderator bấm số ở rail.
 */
export function PostSharesPanel({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [all, setAll] = useState<Sharer[]>([]);

  const query = useQuery({
    queryKey: ['post-shares', postId, cursor],
    queryFn: async () => {
      const res = await apiClient.get<SharesPage>(`/admin/posts/${postId}/shares`, {
        params: { limit: 50, cursor: cursor ?? undefined },
      });
      const page = res.data;
      setAll((prev) => {
        // Nối trang, khử trùng theo userId: một người chia sẻ nhiều ngày vẫn
        // là một dòng, giữ mốc gần nhất (server đã sắp mới nhất trước).
        const merged = cursor ? [...prev, ...page.sharers] : page.sharers;
        const seen = new Set<string>();
        return merged.filter((s) => {
          if (seen.has(s.userId)) return false;
          seen.add(s.userId);
          return true;
        });
      });
      return page;
    },
    enabled: Boolean(postId),
  });

  const rows = all.length > 0 ? all : (query.data?.sharers ?? []);
  const nextCursor = query.data?.nextCursor ?? null;
  const shareCount = query.data?.shareCount ?? 0;

  return (
    <Dialog open onClose={onClose} labelId="post-shares-title">
      <div className="dialog likers-dialog">
        <div className="dialog-header">
          <div>
            <div className="page-eyebrow">Bài đăng</div>
            <h2 id="post-shares-title" className="panel-title">
              <Share2 size={16} aria-hidden /> Người đã chia sẻ (
              {formatNumber(query.data?.total ?? rows.length)})
            </h2>
            {shareCount > (query.data?.total ?? rows.length) && (
              <p className="cell-meta">
                {formatNumber(shareCount)} lượt chia sẻ — một người bấm lại sau 24h được tính thêm lượt.
              </p>
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            type="button"
            onClick={onClose}
            aria-label="Đóng danh sách người chia sẻ"
            title="Đóng"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="dialog-body">
          {query.isError ? (
            <p className="cell-meta">Không tải được danh sách. Thử lại sau.</p>
          ) : query.isLoading && rows.length === 0 ? (
            <p className="cell-meta">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="cell-meta">
              Chưa ghi nhận lượt chia sẻ nào. Số trên bài có thể có từ trước khi
              hệ thống lưu chi tiết người chia sẻ.
            </p>
          ) : (
            <ul className="likers-list">
              {rows.map((s) => (
                <li key={s.userId} className="likers-row">
                  {s.avatar ? (
                    <img className="likers-avatar" src={s.avatar} alt="" width={32} height={32} />
                  ) : (
                    <span className="likers-avatar likers-avatar--initial" aria-hidden>
                      {initials(s.name ?? '?', '?')}
                    </span>
                  )}
                  <div className="likers-main">
                    <span className="likers-name">{s.name ?? 'Tài khoản đã xoá'}</span>
                    {s.sharedAt && (
                      <span className="cell-meta">{formatDateTime(s.sharedAt)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {nextCursor && (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={query.isFetching}
              onClick={() => setCursor(nextCursor)}
            >
              {query.isFetching ? 'Đang tải…' : 'Xem thêm'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
