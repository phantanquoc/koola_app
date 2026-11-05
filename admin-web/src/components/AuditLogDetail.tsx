import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import apiClient from '../apiClient';
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditPayloadRows,
  auditTargetIds,
  auditTargetLabel,
  isInternalIp,
  normalizeIp,
} from './audit-labels';
import { MaskedPII } from './MaskedPII';
import { formatDateTime } from './formatters';

export interface AuditLogEntry {
  _id: string;
  actorId: string;
  actorName?: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string;
  targetItems?: { id: string; name?: string }[];
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
  const items = data.targetItems ?? ids.map((id) => ({ id }));
  const namedItems = items.filter((it) => it.name);
  const payloadRows = auditPayloadRows(data.payload)
    // `ids` chỉ lặp lại danh sách đối tượng đã hiện ở trên — bỏ để khỏi đọc hai lần.
    .filter((r) => !(r.key === 'ids' && Array.isArray(r.raw)));
  // Key lạ (backend thêm field mà FE chưa có nhãn) không được giả làm nhãn tiếng
  // Việt — đẩy xuống phần kỹ thuật để không ai đọc "internalNote" tưởng là tên.
  const knownRows = payloadRows.filter((r) => r.label !== r.key);
  const unknownRows = payloadRows.filter((r) => r.label === r.key);

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
          <dd>{data.actorName ?? 'Không xác định'}</dd>
          <dt>Hành động</dt>
          <dd>
            {auditActionLabel(data.action)}
            {/* Chưa có nhãn thì đọc được mã gốc, không phải ô trống. */}
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
          {/* IP nội bộ (localhost/docker bridge) không giúp gì người vận hành. */}
          {!isInternalIp(data.ip) && (
            <>
              <dt>IP truy cập</dt>
              <dd className="k-mono">{normalizeIp(data.ip ?? '')}</dd>
            </>
          )}
        </dl>

        {/* Chỉ liệt kê khi có ít nhất một tên resolve được. Hồ sơ đã xoá cứng
            thì không còn tên để hiện — khi đó dòng "N đối tượng" phía trên là
            đủ, đừng bắt moderator đọc N lần "Không tìm thấy tên". */}
        {isBulk && namedItems.length > 0 && (
          <div className="form-field">
            <span className="form-label">Đối tượng bị tác động ({ids.length})</span>
            <ul className="confirm-list">
              {items.map((item) => (
                <li key={item.id}>{item.name ?? 'Không còn trong hệ thống'}</li>
              ))}
            </ul>
            {namedItems.length < ids.length && (
              <span className="cell-meta">
                {ids.length - namedItems.length} đối tượng không tra được tên (đã xoá khỏi hệ thống).
              </span>
            )}
          </div>
        )}

        {knownRows.length > 0 && (
          <div className="form-field">
            <span className="form-label">Nội dung thay đổi</span>
            <dl className="description-list">
              {knownRows.map((r) => (
                <PayloadPair key={r.key} row={r} />
              ))}
            </dl>
          </div>
        )}

        {knownRows.length === 0 && unknownRows.length === 0 && (
          <p className="cell-meta">Lần thao tác này không gửi kèm dữ liệu.</p>
        )}

        <details className="detail-section">
          <summary className="detail-section-title">Chi tiết kỹ thuật</summary>
          <dl className="description-list">
            <dt>Mã bản ghi</dt>
            <dd className="k-mono">{data._id}</dd>
            <dt>Mã người thao tác</dt>
            <dd className="k-mono">{data.actorId}</dd>
            {isBulk
              ? ids.map((tid) => (
                  <Fragment key={tid}>
                    <dt>Mã đối tượng</dt>
                    <dd className="k-mono">{tid}</dd>
                  </Fragment>
                ))
              : (
                <>
                  <dt>Mã đối tượng</dt>
                  <dd className="k-mono">{data.targetId}</dd>
                </>
              )}
            <dt>IP gốc</dt>
            <dd className="k-mono">{data.ip || '—'}</dd>
          </dl>
          {data.payload && (
            <pre className="audit-payload">{JSON.stringify(data.payload, null, 2)}</pre>
          )}
          {unknownRows.map((r) => (
            <p key={r.key} className="cell-meta">
              Field chưa có nhãn:{' '}
              <span className="k-mono">{r.key}</span> = <span className="k-mono">{r.value}</span>
            </p>
          ))}
        </details>
      </div>

      <div className="detail-bottombar">
        <Link className="btn btn-ghost btn-sm" to={backTo}>
          <ArrowLeft size={14} aria-hidden /> Về danh sách
        </Link>
      </div>
    </section>
  );
}

function PayloadPair({ row }: { row: ReturnType<typeof auditPayloadRows>[number] }) {
  // PII che mặc định như mọi chỗ khác trên bảng — audit log cũng là dữ liệu người dùng.
  const value = row.kind === 'pii' && row.value !== '—'
    ? <MaskedPII value={row.value} kind={row.key.toLowerCase().includes('email') ? 'email' : 'phone'} />
    : row.value;
  return (
    <>
      <dt>{row.label}</dt>
      <dd>{value}</dd>
    </>
  );
}
