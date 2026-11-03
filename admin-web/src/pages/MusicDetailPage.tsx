import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MusicDetail from '../components/MusicDetail';

/**
 * Route chi tiết nhạc (/music/:id) — inline, không overlay.
 *
 * `state.from` giữ nguyên filter + trang của list để nút Quay lại đưa về đúng
 * chỗ đang làm; mở link trực tiếp (không có state) thì về list trơn.
 */
export default function MusicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/music';
  const back = () => navigate(backTo);

  return (
    <div className="page-stack detail-page">
      <button className="btn btn-ghost btn-sm detail-back" type="button" onClick={back}>
        <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
      </button>

      {id ? (
        <MusicDetail id={id} />
      ) : (
        <p className="cell-meta">Thiếu ID bản nhạc.</p>
      )}
    </div>
  );
}
