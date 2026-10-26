import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ReportDetail } from '../components/ReportDetail';

/**
 * Route `/reports/:id` — chi tiết báo cáo là component inline, không overlay.
 * `location.state.from` giữ filter + trang của list khi quay lại.
 */
export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/reports';

  return (
    <div className="page-stack detail-page">
      <button className="btn btn-ghost btn-sm detail-back" type="button" onClick={() => navigate(backTo)}>
        <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
      </button>
      {id ? <ReportDetail id={id} backTo={backTo} /> : <p className="cell-meta">Thiếu ID báo cáo.</p>}
    </div>
  );
}
