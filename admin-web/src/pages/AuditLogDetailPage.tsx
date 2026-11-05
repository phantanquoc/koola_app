import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AuditLogDetail } from '../components/AuditLogDetail';

/**
 * Route chi tiết audit log (/audit-logs/:id) — inline, không overlay.
 *
 * `state.from` giữ nguyên filter + trang của list để nút Quay lại đưa về đúng
 * chỗ đang làm; mở link trực tiếp (không có state) thì về list trơn.
 */
export default function AuditLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/audit-logs';
  const back = () => navigate(backTo);

  return (
    <div className="page-stack detail-page">
      <button className="btn btn-ghost btn-sm detail-back" type="button" onClick={back}>
        <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
      </button>

      {id
        ? <AuditLogDetail id={id} backTo={backTo} />
        : <p className="cell-meta">Thiếu ID bản ghi.</p>}
    </div>
  );
}
