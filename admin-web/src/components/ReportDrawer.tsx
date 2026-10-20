import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Dialog from './Dialog';
import apiClient from '../apiClient';

export type ReportTargetType = 'message' | 'story' | 'user' | 'conversation';

export interface ReportItem {
  _id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt?: string;
}

/** Deep-link tới target của report — không mở tab mới (DESIGN.md §3B). */
export function ReportTargetLink({ type, id }: { type: ReportTargetType; id: string }) {
  const short = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  switch (type) {
    case 'conversation':
      return (
        <Link className="cell-link k-mono" to={`/conversations?focus=${encodeURIComponent(id)}`}>
          {short}
        </Link>
      );
    case 'message':
      return (
        <Link className="cell-link k-mono" to={`/messages?focus=${encodeURIComponent(id)}`}>
          {short}
        </Link>
      );
    case 'user':
      return (
        <Link className="cell-link k-mono" to={`/users?search=${encodeURIComponent(id)}`}>
          {short}
        </Link>
      );
    case 'story':
      return (
        <Link className="cell-link k-mono" to={`/moments?author=&focus=${encodeURIComponent(id)}`}>
          {short}
        </Link>
      );
  }
}

interface TargetPreview {
  kind: 'message' | 'story' | 'user' | 'conversation' | 'unknown';
  title: string;
  body?: string;
  /** mediaKey thô — cần backend endpoint admin preview mới xem được ảnh (ghi nợ). */
  mediaKey?: string;
  mediaType?: string;
}

async function fetchTargetPreview(type: ReportTargetType, id: string): Promise<TargetPreview> {
  try {
    if (type === 'message') {
      // Không có endpoint get-by-id → tìm qua search theo conversation không khả thi;
      // thử lấy trực tiếp, fallback hiển thị id.
      const res = await apiClient.get('/admin/messages/search', { params: { q: id, limit: 1 } });
      const m = res.data?.data?.[0];
      if (m && String(m._id) === id) {
        return {
          kind: 'message',
          title: `Tin nhắn từ ${m.senderId ?? '?'}`,
          body: m.content ?? '',
          mediaKey: m.mediaUrl ? String(m.mediaUrl) : undefined,
          mediaType: m.type,
        };
      }
    } else if (type === 'story') {
      const res = await apiClient.get('/admin/stories', { params: { page: 1, limit: 100 } });
      const s = (res.data?.data ?? []).find((x: { _id: string }) => String(x._id) === id);
      if (s) {
        return {
          kind: 'story',
          title: `Story của ${s.authorId ?? '?'}`,
          body: s.caption ?? '',
          mediaKey: s.mediaKey ? String(s.mediaKey) : undefined,
          mediaType: s.mediaType,
        };
      }
    } else if (type === 'user') {
      const res = await apiClient.get(`/admin/users/${id}`);
      const u = res.data;
      if (u) {
        return {
          kind: 'user',
          title: u.displayName ?? u.email ?? id,
          body: [u.email, u.phone].filter(Boolean).join(' · '),
        };
      }
    } else if (type === 'conversation') {
      const res = await apiClient.get(`/admin/conversations/${id}`);
      const c = res.data?.conversation;
      if (c) {
        return {
          kind: 'conversation',
          title: c.displayName ?? c.name ?? id,
          body: `${(res.data?.members ?? []).length} thành viên`,
        };
      }
    }
  } catch {
    // Fallthrough → unknown
  }
  return { kind: 'unknown', title: id };
}

/**
 * Drawer moderation context (DESIGN.md §11): nội dung gốc → target info +
 * deep-link → lịch sử report cũ → actions. Không chuyển tab ở bước nào.
 */
export function ReportDrawer({
  report,
  onClose,
  onResolve,
  onDismiss,
  busy,
}: {
  report: ReportItem | null;
  onClose: () => void;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  busy: boolean;
}) {
  const [preview, setPreview] = useState<TargetPreview | null>(null);
  const [history, setHistory] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!report) return;
    setLoading(true);
    setPreview(null);
    setHistory([]);
    Promise.all([
      fetchTargetPreview(report.targetType, report.targetId),
      apiClient
        .get('/admin/reports', { params: { page: 1, limit: 6, targetType: report.targetType } })
        .then((r) =>
          ((r.data?.data ?? []) as ReportItem[]).filter(
            (x) => x.targetId === report.targetId && x._id !== report._id,
          ),
        )
        .catch(() => [] as ReportItem[]),
    ])
      .then(([p, h]) => {
        setPreview(p);
        setHistory(h.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, [report]);

  return (
    <Dialog open={report !== null} onClose={onClose} labelId="report-drawer-title" variant="drawer">
      {report && (
        <div className="drawer">
          <div className="drawer-header">
            <div>
              <div className="page-eyebrow">Báo cáo · {report.targetType}</div>
              <h2 id="report-drawer-title" className="panel-title">
                Xử lý báo cáo
              </h2>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
              Đóng
            </button>
          </div>
          <div className="drawer-body">
            {loading && <div className="skeleton-card" aria-label="Đang tải ngữ cảnh" />}
            {!loading && preview && (
              <div className="page-stack">
                <section className="panel">
                  <div className="panel-header">
                    <div className="panel-title">Nội dung gốc</div>
                  </div>
                  <div className="panel-body">
                    <p className="cell-title">{preview.title}</p>
                    {preview.body && <p className="cell-meta">{preview.body}</p>}
                    {preview.mediaKey && (
                      <p className="cell-meta">
                        Có media đính kèm (key <span className="k-mono">{preview.mediaKey}</span>) —
                        preview ảnh cần backend bổ sung endpoint admin.
                      </p>
                    )}
                    <p className="cell-meta" style={{ marginTop: 'var(--space-2)' }}>
                      Lý do báo cáo: {report.reason}
                    </p>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <div className="panel-title">Target</div>
                  </div>
                  <div className="panel-body">
                    <dl className="description-list">
                      <dt>Loại</dt>
                      <dd>{report.targetType}</dd>
                      <dt>ID</dt>
                      <dd>
                        <ReportTargetLink type={report.targetType} id={report.targetId} />
                      </dd>
                      <dt>Người báo cáo</dt>
                      <dd className="k-mono">{report.reporterId}</dd>
                    </dl>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <div className="panel-title">Báo cáo cũ của target ({history.length})</div>
                  </div>
                  <div className="panel-body">
                    {history.length === 0 && <p className="cell-meta">Chưa có báo cáo khác.</p>}
                    {history.map((h) => (
                      <div className="queue-item" key={h._id}>
                        <div>
                          <strong>{h.reason}</strong>
                          <span>
                            {h.status} · {h.createdAt ?? ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="table-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => onResolve(report._id)}
                    disabled={busy || report.status !== 'pending'}
                    type="button"
                  >
                    Resolve
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => onDismiss(report._id)}
                    disabled={busy || report.status !== 'pending'}
                    type="button"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
