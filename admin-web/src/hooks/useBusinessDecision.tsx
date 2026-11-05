import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { ConfirmDialog } from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import { useToast } from '../components/Toast';
import { Plus } from 'lucide-react';

export const REJECT_TEMPLATES = [
  { short: 'Ảnh giấy phép mờ', text: 'Ảnh giấy phép không rõ, vui lòng tải lại ảnh sắc nét hơn.' },
  { short: 'Thông tin không khớp', text: 'Thông tin doanh nghiệp chưa khớp với giấy phép.' },
  { short: 'Thiếu giấy phép', text: 'Thiếu giấy phép hợp lệ để xác minh doanh nghiệp.' },
];

/** Chèn câu vào cuối textarea, không ghi đè phần đã gõ. */
export function appendReason(current: string, addition: string) {
  const base = current.trim();
  if (!base) return addition;
  if (base.includes(addition)) return current;
  return `${base}\n${addition}`;
}

export interface DecisionTarget {
  id: string;
  displayName: string;
}

interface UseBusinessDecisionOptions {
  /** Gọi sau mỗi mutation thành công (refetch list/detail). */
  onChanged?: () => void;
  /** Hồ sơ kế tiếp trong hàng đợi — để toast gợi ý và chuyển drawer. */
  nextOf?: (id: string) => DecisionTarget | undefined;
  /** Chuyển drawer sang hồ sơ kế tiếp sau khi duyệt (chế độ duyệt liên tiếp). */
  onAdvance?: (next: DecisionTarget) => void;
  /** Có nút Hoàn tác sau khi duyệt? */
  undoable?: boolean;
}

/**
 * Một nguồn sự thật cho duyệt / từ chối / vô hiệu hóa hồ sơ doanh nghiệp.
 * Dùng chung cho trang list (modal) và route chi tiết (/businesses/:id) để hai
 * nơi không lệch copy, confirm hay toast.
 *
 * @example
 * const decision = useBusinessDecision({ onChanged: refresh, undoable: true });
 * <button onClick={() => decision.requestApprove({ id, displayName })}>Duyệt</button>
 * {decision.dialogs}
 */
export function useBusinessDecision(options: UseBusinessDecisionOptions = {}) {
  const { onChanged, nextOf, onAdvance, undoable } = options;
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [approveTarget, setApproveTarget] = useState<DecisionTarget | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DecisionTarget | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<(DecisionTarget & { suspend: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['business'] });
    onChanged?.();
  }

  async function confirmApprove() {
    if (!approveTarget || busy) return;
    const target = approveTarget;
    const next = nextOf?.(target.id);
    setBusy(true);
    try {
      await apiClient.post(`/admin/businesses/${target.id}/approve`);
      addToast('success',
        next ? `Đã duyệt ${target.displayName}. Tiếp theo: ${next.displayName}.` : `Đã duyệt ${target.displayName}. Hàng đợi trang này đã hết.`,
        undoable
          ? {
              label: 'Hoàn tác',
              onClick: () => {
                apiClient.post(`/admin/businesses/${target.id}/reopen`)
                  .then(() => { addToast('success', 'Đã hoàn tác, hồ sơ về Chờ duyệt.'); refresh(); })
                  .catch(() => addToast('error', 'Hoàn tác thất bại.'));
              },
            }
          : undefined);
      setApproveTarget(null);
      if (next && onAdvance) onAdvance(next);
      refresh();
    } catch {
      addToast('error', 'Duyệt thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmReject() {
    if (!rejectTarget || busy) return;
    if (!rejectReason.trim()) {
      setRejectError('Vui lòng nhập lý do từ chối.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/admin/businesses/${rejectTarget.id}/reject`, { rejectionReason: rejectReason.trim() });
      addToast('success', `Đã từ chối ${rejectTarget.displayName}.`);
      setRejectTarget(null);
      setRejectReason('');
      refresh();
    } catch {
      addToast('error', 'Từ chối thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSuspend() {
    if (!suspendTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/businesses/${suspendTarget.id}/${suspendTarget.suspend ? 'disable' : 'enable'}`);
      addToast('success', suspendTarget.suspend
        ? `Đã tạm ngưng bán ${suspendTarget.displayName}. Sản phẩm đã ẩn khỏi catalog.`
        : `Đã cho ${suspendTarget.displayName} bán hàng trở lại.`);
      setSuspendTarget(null);
      refresh();
    } catch {
      addToast('error', 'Thao tác thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const dialogs: ReactNode = (
    <>
      <ConfirmDialog
        open={approveTarget !== null} onClose={() => setApproveTarget(null)}
        title="Duyệt hồ sơ doanh nghiệp?" confirmLabel="Duyệt hồ sơ" variant="primary"
        busy={busy} onConfirm={confirmApprove}
        description={approveTarget
          ? `"${approveTarget.displayName}" sẽ được xác minh và bắt đầu bán hàng trên Koola.`
          : undefined}
        preview={approveTarget ? (
          <dl className="description-list">
            <div><dt>Doanh nghiệp</dt><dd>{approveTarget.displayName}</dd></div>
            <div><dt>ID</dt><dd className="k-mono">{approveTarget.id}</dd></div>
          </dl>
        ) : undefined}
      />

      <ConfirmDialog
        open={suspendTarget !== null} onClose={() => setSuspendTarget(null)}
        title={suspendTarget?.suspend ? 'Tạm ngưng bán?' : 'Cho bán hàng trở lại?'}
        description={suspendTarget?.suspend
          ? 'Toàn bộ sản phẩm bị ẩn khỏi catalog ngay. Hồ sơ không bị đánh dấu vi phạm và vẫn xác minh bình thường — đây không phải ban.'
          : 'Sản phẩm của doanh nghiệp hiện lại trong catalog.'}
        confirmLabel={suspendTarget?.suspend ? 'Tạm ngưng bán' : 'Cho bán lại'}
        variant={suspendTarget?.suspend ? 'danger' : 'primary'} busy={busy} onConfirm={confirmSuspend}
        requireText={suspendTarget?.suspend ? 'XACNHAN' : undefined}
      />

      <Dialog
        open={rejectTarget !== null}
        onClose={() => { setRejectTarget(null); setRejectError(null); }}
        labelId="reject-dialog-title" variant="dialog"
      >
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="reject-dialog-title" className="panel-title">Từ chối hồ sơ</h2>
              <p className="panel-subtitle">
                {rejectTarget ? `${rejectTarget.displayName} sẽ nhận lý do này và có thể nộp lại.` : ''}
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setRejectTarget(null); setRejectError(null); }} type="button">Đóng</button>
          </div>
          <div className="dialog-body page-stack">
            <div className="filter-chip-row" style={{ padding: 0 }}>
              {REJECT_TEMPLATES.map((t) => (
                <button
                  className="filter-chip filter-chip-removable" key={t.short}
                  onClick={() => setRejectReason((r) => appendReason(r, t.text))}
                  type="button"
                  title={t.text}
                >
                  <Plus size={12} aria-hidden /> {t.short}
                </button>
              ))}
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="reject-reason">Lý do gửi cho doanh nghiệp</label>
              <textarea
                className="textarea" id="reject-reason" value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                aria-label="Nhập lý do từ chối" aria-required="true" rows={4}
                placeholder="Nêu cụ thể cần sửa gì để doanh nghiệp nộp lại đúng..."
              />
              <span className="cell-meta">{rejectReason.trim().length} ký tự · doanh nghiệp sẽ đọc lý do này</span>
            </div>
            {rejectError && <p className="alert" role="alert">{rejectError}</p>}
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => { setRejectTarget(null); setRejectError(null); }} type="button">Hủy</button>
              <button className="btn btn-danger" onClick={confirmReject} type="button" disabled={busy}>
                {busy ? 'Đang gửi...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );

  return {
    requestApprove: (t: DecisionTarget) => setApproveTarget(t),
    requestReject: (t: DecisionTarget) => { setRejectTarget(t); setRejectReason(''); setRejectError(null); },
    requestSuspend: (t: DecisionTarget & { suspend: boolean }) => setSuspendTarget(t),
    busy,
    dialogs,
  };
}
