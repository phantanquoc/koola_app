import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import apiClient from '../apiClient';
import { apiErrorMessage } from './formatters';

/**
 * Dialog cấm / bỏ cấm tài khoản — dùng chung trang Người dùng, trang Doanh
 * nghiệp và route chi tiết (DESIGN.md §10: reason bắt buộc, chọn thời hạn).
 *
 * Lịch sử vi phạm trước đây nằm cùng file này, giờ là `hooks/useViolationHistory`
 * vì cả trang chi tiết người dùng lẫn drawer doanh nghiệp đều cần dùng lại.
 */
export function BanDialog({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; name: string; action: 'ban' | 'unban' } | null;
  onClose: () => void;
  onDone: (action: 'ban' | 'unban') => void;
}) {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('7');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setReason('');
      setDuration('7');
      setError(null);
    }
  }, [target]);

  async function submit() {
    if (!target || submitting) return;
    if (target.action === 'ban' && !reason.trim()) {
      setError('Lý do cấm là bắt buộc.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body =
        target.action === 'ban'
          ? duration === 'forever'
            ? { reason: reason.trim() }
            : { reason: reason.trim(), durationDays: Number(duration) }
          : undefined;
      await apiClient.post(`/admin/users/${target.id}/${target.action}`, body);
      onDone(target.action);
      onClose();
    } catch (err) {
      // Hiện message thật từ server (403/404/409/429) thay vì câu chung —
      // moderator cần biết vì sao thất bại để xử lý tiếp.
      setError(apiErrorMessage(err, 'Thao tác thất bại. Vui lòng thử lại.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={target !== null} onClose={onClose} labelId="ban-dialog-title" variant="dialog">
      {target && (
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="ban-dialog-title" className="panel-title">
                {target.action === 'ban' ? `Cấm "${target.name}"` : `Bỏ cấm "${target.name}"`}
              </h2>
              <p className="panel-subtitle">
                {target.action === 'ban'
                  ? 'Tài khoản bị đăng xuất mọi thiết bị ngay (thu hồi refresh token).'
                  : 'Tài khoản hoạt động lại ngay.'}
              </p>
            </div>
          </div>
          <div className="dialog-body page-stack">
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            {target.action === 'ban' && (
              <>
                <div className="form-field">
                  <label className="form-label" htmlFor="ban-reason">
                    Lý do cấm (bắt buộc)
                  </label>
                  <textarea
                    className="textarea"
                    id="ban-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="VD: spam tin nhắn quảng cáo hàng loạt"
                    maxLength={500}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="ban-duration">
                    Thời hạn
                  </label>
                  <select
                    className="select"
                    id="ban-duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  >
                    <option value="1">1 ngày</option>
                    <option value="3">3 ngày</option>
                    <option value="7">7 ngày</option>
                    <option value="30">30 ngày</option>
                    <option value="forever">Vĩnh viễn</option>
                  </select>
                  <span className="cell-meta">
                    Hạn cấm không tự hết — hết hạn vẫn phải bỏ cấm tay.
                  </span>
                </div>
              </>
            )}
            <div className="table-actions">
              <button
                className={target.action === 'ban' ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={submit}
                disabled={submitting || (target.action === 'ban' && !reason.trim())}
                type="button"
              >
                {submitting ? 'Đang xử lý...' : target.action === 'ban' ? 'Xác nhận cấm' : 'Bỏ cấm'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={onClose}
                disabled={submitting}
                type="button"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
