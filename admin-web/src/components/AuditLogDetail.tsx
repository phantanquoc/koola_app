import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import apiClient from '../apiClient';
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditTargetIds,
  auditTargetLabel,
} from './audit-labels';
import { formatDateTime } from './formatters';

export interface AuditLogEntry {
  _id: string;
  actorId: string;
  actorName?: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string;
  payload?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt?: string;
}

/**
 * Chi tiết một dòng audit log — component inline, KHÔNG phải drawer/overlay.
 *
 * Dùng ở route `/audit-logs/:id` để deep-link được: gửi link cho người khác mở
 * đúng dòng đó, không phải "vào list rồi lọc tay". Cùng hình thức với
 * `/businesses/:id` (detail-card), không che danh sách, không khoá scroll.
 */
export function AuditLogDetail({ id, backTo }: { id: string; backTo: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit-log', id],
    queryFn: async () => {
      const res = await apiClient.get<AuditLogEntry>(`/admin/audit-logs/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết thao tác">
        <div className="loading-state" role="status">
          <div>
            <div className="state-icon" aria-hidden="true">
              <Loader2 size={22} className="state-icon-spin" />
            </div>
            <p className="state-title">Đang tải chi tiết</p>
            <p className="state-copy">Đang lấy bản ghi audit.</p>
          </div>
        </div>
      </section>
    );
  }

  if (isError || !data) {
    const message = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết thao tác">
        <div className="empty-state" role="alert">
          <div>
            <div className="state-icon" aria-hidden="true">
              <AlertTriangle size={22} />
            </div>
            <p className="state-title">Không tải được bản ghi</p>
            <p className="state-copy">{message ?? 'Bản ghi có thể đã bị xoá hoặc kết nối gián đoạn.'}</p>
            <div className="table-actions" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Thử lại</button>
              <Link className="btn btn-ghost btn-sm" to={backTo}>Về danh sách</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const ids = auditTargetIds(data.targetId);
  const isBulk = ids.length > 1;

  return (
    <section className="table-shell detail-card" aria-label="Chi tiết thao tác">
      <div className="detail-header">
        <div className="cell-primary" style={{ flex: 1, minWidth: 0 }}>
          <div>
            <div className="page-eyebrow">{auditTargetLabel(data.targetType)}</div>
            <h2 className="panel-title">{auditActionLabel(data.action)}</h2>
            <p className="cell-meta">{formatDateTime(data.createdAt)}</p>
          </div>
        </div>
      </div>

      <div className="detail-card-body page-stack">
        <dl className="description-list">
          {/* dt/dd là con trực tiếp của grid 2 cột. Bọc <div> quanh mỗi cặp sẽ
              làm grid xếp 2 ô cạnh nhau, mỗi ô lại chồng nhãn lên giá trị. */}
          <dt>Thời gian</dt>
          <dd>{formatDateTime(data.createdAt)}</dd>
          <dt>Người thao tác</dt>
          <dd>
            {data.actorName ?? <span className="k-mono">{data.actorId}</span>}
            {data.actorName && <span className="cell-meta"> · <span className="k-mono">{data.actorId}</span></span>}
          </dd>
          <dt>Hành động</dt>
          <dd>
            <span className="k-mono">{data.action}</span>
            {/* Mã gốc hiện cạnh nhãn: backend thêm action mới mà FE chưa map
                thì vẫn đọc được, không thành ô trống. */}
            {!AUDIT_ACTION_LABELS[data.action] && (
              <span className="cell-meta"> · chưa có nhãn tiếng Việt</span>
            )}
          </dd>
          <dt>Đối tượng</dt>
          <dd>
            {auditTargetLabel(data.targetType)}
            {data.targetName && <span> · {data.targetName}</span>}
            {isBulk && <span className="cell-meta"> · {ids.length} đối tượng trong một lần</span>}
          </dd>
          <dt>IP</dt>
          <dd className="k-mono">{data.ip ?? '—'}</dd>
          {/* Mã bản ghi để đối chiếu khi báo lỗi; ở bottom bar thì nó chỉ là
              dòng trang trí vì trang không có hành động nào. */}
          <dt>Mã bản ghi</dt>
          <dd className="k-mono">{data._id}</dd>
        </dl>

        {isBulk ? (
          <div className="form-field">
            <span className="form-label">Đối tượng bị tác động ({ids.length})</span>
            <ul className="confirm-list">
              {ids.map((tid) => (
                <li key={tid}>
                  <span className="k-mono">{tid}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="form-field">
            <span className="form-label">ID đối tượng</span>
            <span className="k-mono">{data.targetId}</span>
          </div>
        )}

        <div className="form-field">
          <span className="form-label">Payload (secret đã được che khi ghi)</span>
          <pre className="audit-payload">
            {data.payload ? JSON.stringify(data.payload, null, 2) : '—'}
          </pre>
        </div>
      </div>

      <div className="detail-bottombar">
        <Link className="btn btn-ghost btn-sm" to={backTo}>
          <ArrowLeft size={14} aria-hidden /> Về danh sách
        </Link>
      </div>
    </section>
  );
}
