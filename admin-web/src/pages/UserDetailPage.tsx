import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { UserDetail } from '../components/UserDetail';

/**
 * Route chi tiết người dùng (/users/:id) — inline, không drawer (§3B).
 *
 * `state.from` giữ filter + trang của list để "Về danh sách" đưa về đúng chỗ
 * vừa làm việc; mở link trực tiếp (không có state) thì về list trơn.
 */
export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/users';
  const back = () => navigate(backTo);

  return (
    <div className="page-stack detail-page detail-page--split">
      <button className="btn btn-ghost btn-sm detail-back" type="button" onClick={back}>
        <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
      </button>

      {id
        ? <UserDetail id={id} backTo={backTo} />
        : <p className="cell-meta">Thiếu mã tài khoản.</p>}
    </div>
  );
}
