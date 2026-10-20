import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import apiClient from '../apiClient';

export interface ViolationEntry {
  kind: 'report' | 'ban' | 'action';
  title: string;
  detail?: string;
  at?: string;
  status?: string;
}

interface ReportRef {
  _id: string;
  targetId: string;
  targetType: string;
  reason: string;
  status: string;
  createdAt?: string;
}

interface AuditRef {
  _id: string;
  action: string;
  targetType: string;
  targetId: string;
  payload?: { reason?: string; durationDays?: number };
  createdAt?: string;
}

/**
 * Lịch sử vi phạm của 1 user (task1 mục 3): gộp reports nhắm vào user +
 * ban/unban/takedown từ audit-log. Audit API chưa lọc theo target nên
 * scan 100 bản ghi gần nhất client-side — đủ cho nhu cầu moderation,
 * backend bổ sung filter thì thay bằng query trực tiếp.
 */
export function useViolationHistory(userId: string | null) {
  const [entries, setEntries] = useState<ViolationEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient
        .get('/admin/reports', { params: { page: 1, limit: 20, targetType: 'user' } })
        .then((r) =>
          ((r.data?.data ?? []) as ReportRef[]).filter((x) => x.targetId === userId),
        )
        .catch(() => [] as ReportRef[]),
      apiClient
        .get('/admin/audit-logs', { params: { page: 1, limit: 100 } })
        .then((r) =>
          ((r.data?.data ?? []) as AuditRef[]).filter((x) => x.targetId.includes(userId)),
        )
        .catch(() => [] as AuditRef[]),
    ])
      .then(([reports, audits]) => {
        if (cancelled) return;
        const list: ViolationEntry[] = [
          ...reports.map((x) => ({
            kind: 'report' as const,
            title: `Bị báo cáo: ${x.reason}`,
            at: x.createdAt,
            status: x.status,
          })),
          ...audits.map((x) => ({
            kind: 'action' as const,
            title: actionLabel(x.action, x.payload),
            at: x.createdAt,
          })),
        ];
        list.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
        setEntries(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { entries, loading };
}

function actionLabel(action: string, payload?: { reason?: string; durationDays?: number }): string {
  switch (action) {
    case 'ban_user':
      return `Bị cấm${payload?.reason ? `: ${payload.reason}` : ''}${payload?.durationDays ? ` (${payload.durationDays} ngày)` : ' (vĩnh viễn)'}`;
    case 'unban_user':
      return 'Được bỏ cấm';
    case 'soft_delete_message':
      return 'Tin nhắn bị xóa mềm';
    case 'takedown_story':
      return 'Story bị gỡ';
    default:
      return action;
  }
}

/** Dialog ban/unban đúng DESIGN.md §10: reason bắt buộc, duration select. */
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
    } catch {
      setError('Thao tác thất bại. Vui lòng thử lại.');
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
