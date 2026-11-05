import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import apiClient from '../apiClient';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';
import { formatDateTime, apiErrorMessage } from './formatters';
import {
  reportStatusLabel,
  reportStatusTone,
  reportTargetHref,
  reportTargetLabel,
} from './report-labels';
import { ConfirmDialog } from './ConfirmDialog';
import type { ReportItem } from '../pages/ReportsPage';

type Action = 'resolve' | 'dismiss';

/**
 * Chi tiết báo cáo — component inline ở route `/reports/:id`, KHÔNG phải drawer.
 *
 * Nội dung theo §3B: header (đối tượng + trạng thái) → ngữ cảnh (nội dung bị
 * báo cáo, người báo, lý do) → lịch sử báo cáo cũ của cùng đối tượng → hành động.
 */
export function ReportDetail({ id, backTo }: { id: string; backTo: string }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['report', id],
    queryFn: async () => (await apiClient.get<ReportItem>(`/admin/reports/${id}`)).data,
    enabled: Boolean(id),
  });

  // Báo cáo cũ của CÙNG đối tượng — filter ở server (targetId), không lọc client
  // để không bỏ sót khi đối tượng có nhiều hơn một trang báo cáo.
  const { data: history = [] } = useQuery({
    queryKey: ['report-history', data?.targetType, data?.targetId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ReportItem[] }>('/admin/reports', {
        params: { targetType: data?.targetType, targetId: data?.targetId, limit: 6 },
      });
      return res.data.data.filter((x) => x._id !== id).slice(0, 5);
    },
    enabled: Boolean(data?.targetId),
  });

  async function act(action: Action) {
    if (!data) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/reports/${data._id}/${action}`);
      addToast('success', action === 'resolve' ? 'Đã đánh dấu xử lý.' : 'Đã bỏ qua báo cáo.');
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['report', id] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Thao tác thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết báo cáo">
        <div className="loading-state" role="status">
          <div>
            <div className="state-icon" aria-hidden="true">
              <Loader2 size={22} className="state-icon-spin" />
            </div>
            <p className="state-title">Đang tải báo cáo</p>
            <p className="state-copy">Đang lấy ngữ cảnh xử lý.</p>
          </div>
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết báo cáo">
        <div className="empty-state" role="alert">
          <div>
            <div className="state-icon" aria-hidden="true">
              <AlertTriangle size={22} />
            </div>
            <p className="state-title">Không tải được báo cáo</p>
            <p className="state-copy">{apiErrorMessage(error, 'Báo cáo có thể đã bị xoá hoặc kết nối gián đoạn.')}</p>
            <div className="table-actions" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Thử lại</button>
              <Link className="btn btn-ghost btn-sm" to={backTo}>Về danh sách</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const targetHref = reportTargetHref(data.targetType, data.targetId);
  const pending = data.status === 'pending';
  // "Nội dung bị báo cáo" chỉ đúng với message/story/conversation. Với user thì
  // đối tượng chính là chính người đó — lặp tên trong khung trích dẫn là thừa.
  const isContentTarget = data.targetType !== 'user';

  return (
    <section className="table-shell detail-card" aria-label="Chi tiết báo cáo">
      <div className="detail-header">
        <div className="cell-primary" style={{ flex: 1, minWidth: 0 }}>
          <div>
            <div className="page-eyebrow">{reportTargetLabel(data.targetType)} bị báo cáo</div>
            <h2 className="panel-title">{data.targetName ?? data.reason}</h2>
            <p className="cell-meta">
              {formatDateTime(data.createdAt)}
              {data.targetDetail && ` · ${data.targetDetail}`}
            </p>
          </div>
        </div>
        <StatusBadge tone={reportStatusTone(data.status)} label={reportStatusLabel(data.status)} />
      </div>

      <div className="detail-card-body page-stack">
        {isContentTarget && (
          <div className="form-field">
            <span className="form-label">Nội dung bị báo cáo</span>
            <div className="report-quote">{data.targetName ?? 'Không còn nội dung để hiện.'}</div>
            {/* Chỉ hiện link khi trang đích thật sự đọc param — nếu không là link chết. */}
            {targetHref && (
              <Link className="cell-link" to={targetHref}>Mở {reportTargetLabel(data.targetType).toLowerCase()} trong trang quản lý</Link>
            )}
          </div>
        )}

        <dl className="description-list">
          <dt>Lý do báo cáo</dt>
          <dd>{data.reason}</dd>
          <dt>Người báo cáo</dt>
          <dd>{data.reporterName ?? 'Không xác định'}</dd>
          {!isContentTarget && (
            <>
              <dt>Đối tượng</dt>
              <dd>
                {data.targetName ?? 'Không còn trong hệ thống'}
                {targetHref && (
                  <span className="cell-meta"> · <Link className="cell-link" to={targetHref}>Mở trong trang quản lý</Link></span>
                )}
              </dd>
            </>
          )}
          <dt>Trạng thái</dt>
          <dd>
            {reportStatusLabel(data.status)}
            {data.resolvedByName && <span className="cell-meta"> · xử lý bởi {data.resolvedByName}</span>}
            {data.resolvedAt && <span className="cell-meta"> · {formatDateTime(data.resolvedAt)}</span>}
          </dd>
        </dl>

        <div className="form-field">
          <span className="form-label">Báo cáo cũ của cùng đối tượng ({history.length})</span>
          {history.length === 0
            ? <p className="cell-meta">Chưa có báo cáo nào khác.</p>
            : (
              <ul className="confirm-list">
                {history.map((h) => (
                  <li key={h._id}>
                    {h.reason}
                    <span className="cell-meta"> · {reportStatusLabel(h.status)} · {formatDateTime(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <details className="detail-section">
          <summary className="detail-section-title">Chi tiết kỹ thuật</summary>
          <dl className="description-list">
            <dt>Mã báo cáo</dt>
            <dd className="k-mono">{data._id}</dd>
            <dt>Mã đối tượng</dt>
            <dd className="k-mono">{data.targetId}</dd>
            <dt>Mã người báo cáo</dt>
            <dd className="k-mono">{data.reporterId}</dd>
          </dl>
        </details>
      </div>

      <div className="detail-bottombar">
        <Link className="btn btn-ghost btn-sm" to={backTo}>
          <ArrowLeft size={14} aria-hidden /> Về danh sách
        </Link>
        {pending && (
          <>
            <span className="bulk-bar-spacer" />
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setConfirm('dismiss')}>
              Bỏ qua
            </button>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => setConfirm('resolve')}>
              Đánh dấu xử lý
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'resolve' ? 'Đánh dấu báo cáo đã xử lý?' : 'Bỏ qua báo cáo này?'}
        description={confirm === 'resolve'
          ? 'Đánh dấu để đóng báo cáo khỏi hàng đợi. Không gỡ nội dung — muốn gỡ thì dùng trang của đối tượng.'
          : 'Báo cáo bị bỏ qua và rời khỏi hàng đợi. Người dùng không nhận được phản hồi nào.'}
        confirmLabel={confirm === 'resolve' ? 'Đánh dấu xử lý' : 'Bỏ qua'}
        variant={confirm === 'resolve' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => confirm && act(confirm)}
      />
    </section>
  );
}
