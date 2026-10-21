import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import { BusinessDetailDrawer } from '../components/BusinessDetailDrawer';

/**
 * Route share URL (/businesses/:id, /businesses/new): form chi tiết giữa
 * màn hình, dùng chung logic với modal list (BusinessDetailDrawer embedded).
 */
export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const back = () => navigate('/businesses');

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [suspendOpen, setSuspendOpen] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['business', id] });
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
  }

  const rejectTemplates = [
    'Ảnh giấy phép không rõ, vui lòng tải lại ảnh sắc nét hơn.',
    'Thông tin doanh nghiệp chưa khớp với giấy phép.',
    'Thiếu giấy phép hợp lệ để xác minh doanh nghiệp.',
  ];

  return (
    <div className="page-stack detail-page">
      <button className="btn btn-ghost btn-sm detail-back" type="button" onClick={back}>
        <ArrowLeft size={14} aria-hidden /> Doanh nghiệp
      </button>

      <BusinessDetailDrawer
        businessId={id ?? null}
        onClose={back}
        onApprove={() => setApproveOpen(true)}
        onReject={() => { setRejectOpen(true); setRejectReason(''); }}
        onSuspend={(_bid, s) => setSuspendOpen(s)}
        embedded
      />

      <ConfirmDialog
        open={approveOpen} onClose={() => setApproveOpen(false)}
        title="Xác nhận duyệt" confirmLabel="Xác nhận duyệt" variant="primary"
        busy={busy}
        onConfirm={() => {
          if (!id || busy) return;
          setBusy(true);
          apiClient.post(`/admin/businesses/${id}/approve`)
            .then(() => { addToast('success', 'Đã duyệt doanh nghiệp.'); setApproveOpen(false); refresh(); })
            .catch(() => addToast('error', 'Duyệt thất bại.'))
            .finally(() => setBusy(false));
        }}
      />

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} labelId="route-reject-title" variant="dialog">
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="route-reject-title" className="panel-title">Lý do từ chối</h2>
              <p className="panel-subtitle">Gửi phản hồi rõ ràng để doanh nghiệp nộp lại đúng.</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setRejectOpen(false)} type="button">Đóng</button>
          </div>
          <div className="dialog-body page-stack">
            <div className="filter-chip-row" style={{ padding: 0 }}>
              {rejectTemplates.map((t) => (
                <button className="filter-chip" key={t} onClick={() => setRejectReason(t)} type="button">
                  {t.split(',')[0]}
                </button>
              ))}
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="route-reject-reason">Lý do</label>
              <textarea
                className="textarea" id="route-reject-reason" value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                aria-label="Nhập lý do từ chối" aria-required="true"
              />
            </div>
            <div className="table-actions">
              <button
                className="btn btn-danger" type="button" disabled={busy}
                onClick={() => {
                  if (!id || busy) return;
                  if (!rejectReason.trim()) {
                    addToast('error', 'Vui lòng nhập lý do từ chối.');
                    return;
                  }
                  setBusy(true);
                  apiClient.post(`/admin/businesses/${id}/reject`, { rejectionReason: rejectReason.trim() })
                    .then(() => { addToast('success', 'Đã từ chối hồ sơ.'); setRejectOpen(false); setRejectReason(''); refresh(); })
                    .catch(() => addToast('error', 'Từ chối thất bại.'))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? 'Đang gửi...' : 'Xác nhận từ chối'}
              </button>
              <button className="btn btn-secondary" onClick={() => setRejectOpen(false)} type="button">Hủy</button>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={suspendOpen !== null} onClose={() => setSuspendOpen(null)}
        title={suspendOpen ? 'Vô hiệu hóa doanh nghiệp?' : 'Kích hoạt lại doanh nghiệp?'}
        confirmLabel={suspendOpen ? 'Vô hiệu hóa' : 'Kích hoạt'}
        variant={suspendOpen ? 'danger' : 'primary'} busy={busy}
        onConfirm={() => {
          if (!id || suspendOpen === null || busy) return;
          setBusy(true);
          apiClient.post(`/admin/businesses/${id}/${suspendOpen ? 'disable' : 'enable'}`)
            .then(() => { addToast('success', suspendOpen ? 'Đã vô hiệu hóa.' : 'Đã kích hoạt lại.'); setSuspendOpen(null); refresh(); })
            .catch(() => addToast('error', 'Thao tác thất bại.'))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
