import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, X } from 'lucide-react';
import apiClient from '../apiClient';
import Dialog from './Dialog';
import { formatDateTime, formatNumber, initials } from './formatters';

interface Liker {
  userId: string;
  name: string | null;
  avatar: string | null;
  likedAt: string | null;
}

interface LikersPage {
  likers: Liker[];
  nextCursor: string | null;
  total: number;
}

/**
 * Danh sách người đã thích một bài.
 *
 * Tải lười: chỉ mount khi moderator bấm vào số lượt thích — một bài 5.000 lượt
 * thích không được phép gọi API lúc mở trang chi tiết.
 *
 * Phân trang bằng cursor `_id` phía server; nút "Xem thêm" nối thêm vào danh
 * sách đã có thay vì thay trang, vì mục đích là *duyệt* danh sách chứ không
 * phải đọc từng trang như bảng.
 */
export function PostLikersPanel({
  postId,
  total,
  onClose,
}: {
  postId: string;
  total: number;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [all, setAll] = useState<Liker[]>([]);

  const query = useQuery({
    queryKey: ['post-likers', postId, cursor],
    queryFn: async () => {
      const res = await apiClient.get<LikersPage>(`/admin/posts/${postId}/likers`, {
        params: { limit: 50, cursor: cursor ?? undefined },
      });
      const page = res.data;
      setAll((prev) => {
        // Cursor đổi → nối; lần đầu → gán. Khử trùng theo userId để một lượt
        // thích legacy xuất hiện ở cả hai nguồn không bị đếm hai lần.
        const merged = cursor ? [...prev, ...page.likers] : page.likers;
        const seen = new Set<string>();
        return merged.filter((l) => {
          if (seen.has(l.userId)) return false;
          seen.add(l.userId);
          return true;
        });
      });
      return page;
    },
    enabled: Boolean(postId),
  });

  const rows = all.length > 0 ? all : (query.data?.likers ?? []);
  const nextCursor = query.data?.nextCursor ?? null;

  return (
    <Dialog open onClose={onClose} labelId="post-likers-title">
      <div className="dialog likers-dialog">
        <div className="dialog-header">
          <div>
            <div className="page-eyebrow">Bài đăng</div>
            <h2 id="post-likers-title" className="panel-title">
              <Heart size={16} aria-hidden /> Người đã thích ({formatNumber(total)})
            </h2>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            type="button"
            onClick={onClose}
            aria-label="Đóng danh sách người thích"
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
            <p className="cell-meta">Bài đăng chưa có lượt thích nào.</p>
          ) : (
            <ul className="likers-list">
              {rows.map((l) => (
                <li key={l.userId} className="likers-row">
                  {l.avatar ? (
                    <img className="likers-avatar" src={l.avatar} alt="" width={32} height={32} />
                  ) : (
                    <span className="likers-avatar likers-avatar--initial" aria-hidden>
                      {initials(l.name ?? '?', '?')}
                    </span>
                  )}
                  <div className="likers-main">
                    <span className="likers-name">{l.name ?? 'Tài khoản đã xoá'}</span>
                    {l.likedAt && (
                      <span className="cell-meta">{formatDateTime(l.likedAt)}</span>
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
