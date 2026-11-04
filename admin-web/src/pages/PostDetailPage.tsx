import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PostDetail } from '../components/PostDetail';

/**
 * Route chi tiết bài đăng (/posts/:id) — inline, cùng khuôn với
 * `/conversations/:id` và `/music/:id`.
 *
 * `state.from` giữ filter + trang của list để "Quay lại" đưa về đúng chỗ đang
 * làm; mở link trực tiếp (từ báo cáo, hoặc dán URL) thì về list trơn.
 */
export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/posts';

  return (
    <div className="page-stack detail-page detail-page--split post-detail-page">
      <button
        className="btn btn-ghost btn-sm detail-back"
        type="button"
        onClick={() => navigate(backTo)}
      >
        <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
      </button>

      {id
        ? <PostDetail key={id} id={id} backTo={backTo} />
        : <p className="cell-meta">Thiếu mã bài đăng.</p>}
    </div>
  );
}
