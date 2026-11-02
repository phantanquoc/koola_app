import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ConversationDetail } from '../components/ConversationDetail';

/**
 * Route chi tiết hội thoại (/conversations/:id) — inline, không drawer (§3B).
 *
 * `state.from` giữ filter + trang của list để "Quay lại" đưa về đúng chỗ đang
 * làm; mở link trực tiếp (từ báo cáo, hoặc dán URL) thì về list trơn.
 */
export default function ConversationsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/conversations';

  return (
    <div className="page-stack detail-page">
      <button
        className="btn btn-ghost btn-sm detail-back"
        type="button"
        onClick={() => navigate(backTo)}
      >
        <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
      </button>

      {id
        ? <ConversationDetail key={id} id={id} backTo={backTo} />
        : <p className="cell-meta">Thiếu mã hội thoại.</p>}
    </div>
  );
}
