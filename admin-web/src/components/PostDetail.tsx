import '../pages/moderation-media.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../apiClient';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';
import { apiErrorMessage, formatDateTime, formatNumber } from './formatters';
import { auditActionLabel, auditActionTone, auditTargetLabel } from './audit-labels';

interface PostMediaItem {
  mediaKey: string;
  mediaType: 'image' | 'video';
  thumbnailKey?: string | null;
  mediaUrlSigned?: string | null;
  thumbnailUrlSigned?: string | null;
}

interface PostDetailData {
  _id: string;
  authorId?: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  caption?: string;
  isActive?: boolean;
  media?: PostMediaItem[];
  likeCount?: number;
  commentCount?: number;
  topLevelCommentCount?: number;
  shareCount?: number;
  pendingReportCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface PostReport {
  _id: string;
  reason: string;
  status: string;
  reporterName?: string | null;
  createdAt?: string;
}

interface AuditRow {
  _id: string;
  action: string;
  targetType: string;
  actorName?: string | null;
  createdAt: string;
}

/**
 * Chi tiết một bài đăng: nội dung + media + báo cáo đang chờ + lịch sử gỡ.
 *
 * Không có "duyệt": bài đã lên feed từ trước. Trang này phục vụ đọc kỹ trước
 * khi gỡ, và xử lý báo cáo bài đăng — thứ trước đây moderator không làm được vì
 * backend không resolve được `targetType: 'post'`.
 */
export function PostDetail({ id, backTo }: { id: string; backTo: string }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: 'lifecycle' }
    | { kind: 'report'; id: string; action: 'resolve' | 'dismiss'; reason: string }
    | null
  >(null);

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: async () => (await apiClient.get<PostDetailData>(`/admin/posts/${id}`)).data,
    enabled: Boolean(id),
  });

  const reportsQuery = useQuery({
    queryKey: ['post-reports', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PostReport[] }>('/admin/reports', {
        params: { targetType: 'post', targetId: id, status: 'pending', limit: 50 },
      });
      return (res.data.data ?? []).filter((r) => r.status === 'pending');
    },
    enabled: Boolean(id),
  });

  // `search` khớp một phần trên targetId — đường duy nhất hiện có để lọc audit
  // theo đối tượng. Một `_id` ObjectId là duy nhất nên "một phần" ở đây thực tế
  // là "đúng id" (không id nào khác chứa cùng chuỗi 24 ký tự).
  const auditQuery = useQuery({
    queryKey: ['post-audit', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AuditRow[] }>('/admin/audit-logs', {
        params: { targetType: 'post', search: id, limit: 20 },
      });
      return res.data.data ?? [];
    },
    enabled: Boolean(id),
  });

  const post = postQuery.data;
  const reports = reportsQuery.data ?? [];

  async function toggleLifecycle() {
    if (!post) return;
    setBusy(true);
    try {
      if (post.isActive === false) {
        await apiClient.post(`/admin/posts/${id}/restore`);
        addToast('success', 'Đã khôi phục bài đăng.');
      } else {
        await apiClient.post(`/admin/posts/${id}/takedown`);
        addToast('success', 'Đã gỡ bài đăng.');
      }
      setConfirm(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['post', id] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
        queryClient.invalidateQueries({ queryKey: ['post-audit', id] }),
        queryClient.invalidateQueries({ queryKey: ['moderation-queue'] }),
      ]);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Thao tác thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  async function actOnReport(reportId: string, action: 'resolve' | 'dismiss') {
    setBusy(true);
    try {
      await apiClient.post(`/admin/reports/${reportId}/${action}`);
      setConfirm(null);
      addToast(
        'success',
        action === 'resolve' ? 'Đã giải quyết báo cáo.' : 'Đã bỏ qua báo cáo.',
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['post-reports', id] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['post', id] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
      ]);
    } catch {
      addToast('error', 'Thao tác báo cáo thất bại.');
    } finally {
      setBusy(false);
    }
  }

  if (postQuery.isError) {
    return (
      <section className="table-shell detail-card">
        <div className="detail-card-body">
          <p className="form-error" role="alert">
            {apiErrorMessage(postQuery.error, 'Không tải được bài đăng.')}
          </p>
          <Link className="btn btn-secondary btn-sm" to={backTo}>Về danh sách</Link>
        </div>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="table-shell detail-card">
        <div className="detail-card-body">
          <p className="cell-meta">Đang tải bài đăng…</p>
        </div>
      </section>
    );
  }

  const hidden = post.isActive === false;

  return (
    <section className="table-shell detail-card">
      <header className="detail-header">
        <div className="detail-heading">
          <div className="detail-title-row">
            <h2 className="detail-title">
              {post.caption?.trim() ? post.caption.trim().slice(0, 120) : 'Bài đăng không có nội dung'}
            </h2>
            <div className="detail-header-badges">
              {hidden
                ? <StatusBadge tone="muted" label="Đã gỡ" />
                : <StatusBadge tone="success" label="Đang hiển thị" />}
              {(post.pendingReportCount ?? 0) > 0 && (
                <StatusBadge
                  tone="warning"
                  label={`${formatNumber(post.pendingReportCount ?? 0)} báo cáo chờ`}
                />
              )}
            </div>
          </div>
          <p className="detail-subline">
            {post.authorName ?? 'Tài khoản đã xoá'}
            <span className="detail-dot" aria-hidden> · </span>
            Đăng {formatDateTime(post.createdAt)}
          </p>
        </div>
      </header>

      <div className="detail-card-body page-stack">
        <section className="detail-section">
          <h3 className="detail-section-title">Nội dung</h3>
          <div className="report-quote">
            {post.caption?.trim() || 'Bài đăng chỉ có media, không có chữ.'}
          </div>
          <p className="cell-meta">
            {formatNumber(post.likeCount ?? 0)} lượt thích ·{' '}
            {formatNumber(post.commentCount ?? 0)} bình luận ·{' '}
            {formatNumber(post.shareCount ?? 0)} chia sẻ
          </p>
        </section>

        <section className="detail-section">
          <h3 className="detail-section-title">Media ({(post.media ?? []).length})</h3>
          {(post.media ?? []).length === 0 ? (
            <p className="cell-meta">Bài đăng không có ảnh hoặc video.</p>
          ) : (
            (post.media ?? []).map((m, i) => (
              <div key={`${m.mediaKey}-${i}`}>
                {!m.mediaUrlSigned ? (
                  <p className="alert" role="alert">Không tải được media — URL có thể đã hết hạn.</p>
                ) : m.mediaType === 'video' ? (
                  <video
                    controls
                    src={m.mediaUrlSigned}
                    poster={m.thumbnailUrlSigned ?? undefined}
                    className="mod-report-media"
                  />
                ) : (
                  <a
                    href={m.mediaUrlSigned}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mod-report-media"
                  >
                    <img src={m.mediaUrlSigned} alt={`Media ${i + 1}`} />
                  </a>
                )}
              </div>
            ))
          )}
        </section>

        <section className="detail-section">
          <h3 className="detail-section-title">
            Báo cáo chờ xử lý ({reports.length})
          </h3>
          {reportsQuery.isError ? (
            <p className="cell-meta">Không tải được báo cáo.</p>
          ) : reports.length === 0 ? (
            <p className="cell-meta">Không có báo cáo nào đang chờ.</p>
          ) : (
            reports.map((r) => (
              <div key={r._id} className="surface-card conv-report">
                <div className="conv-report-history-head">
                  <p className="cell-title">{r.reason}</p>
                  <StatusBadge tone="warning" label="Chờ xử lý" />
                </div>
                <div className="cell-meta">
                  {r.reporterName ?? 'Không rõ'} · {formatDateTime(r.createdAt)}
                </div>
                <div className="table-actions conv-report-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({ kind: 'report', id: r._id, action: 'resolve', reason: r.reason })
                    }
                  >
                    <Check size={16} strokeWidth={2} aria-hidden /> Giải quyết
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({ kind: 'report', id: r._id, action: 'dismiss', reason: r.reason })
                    }
                  >
                    <X size={16} strokeWidth={2} aria-hidden /> Bỏ qua
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="detail-section">
          <h3 className="detail-section-title">Lịch sử thao tác</h3>
          {auditQuery.isError ? (
            <p className="cell-meta">Không tải được lịch sử.</p>
          ) : (auditQuery.data ?? []).length === 0 ? (
            <p className="cell-meta">Chưa có thao tác nào trên bài này.</p>
          ) : (
            <ul className="audit-list">
              {(auditQuery.data ?? []).map((a) => (
                <li key={a._id} className="audit-list-row">
                  <StatusBadge tone={auditActionTone(a.action)} label={auditActionLabel(a.action)} />
                  <span className="cell-meta">{a.actorName ?? 'Không rõ'}</span>
                  <span className="cell-meta">{auditTargetLabel(a.targetType)}</span>
                  <span className="cell-meta k-mono">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="detail-bottombar">
        <Link className="btn btn-ghost btn-sm" to={backTo}>
          <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
        </Link>
        <span className="detail-bottombar-spacer" />
        {hidden ? (
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={busy}
            onClick={() => setConfirm({ kind: 'lifecycle' })}
          >
            Khôi phục bài đăng
          </button>
        ) : (
          <button
            className="btn btn-danger btn-sm"
            type="button"
            disabled={busy}
            onClick={() => setConfirm({ kind: 'lifecycle' })}
          >
            Gỡ bài đăng
          </button>
        )}
      </footer>

      <ConfirmDialog
        open={confirm?.kind === 'lifecycle'}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={hidden ? 'Khôi phục bài đăng?' : 'Gỡ bài đăng?'}
        description={
          hidden
            ? 'Bài sẽ hiện lại trong feed của người theo dõi ở lần tải kế tiếp.'
            : 'Bài bị ẩn khỏi feed, nội dung vẫn giữ trong DB và có thể khôi phục.'
        }
        confirmLabel={hidden ? 'Khôi phục' : 'Gỡ bài đăng'}
        variant={hidden ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => void toggleLifecycle()}
      />

      <ConfirmDialog
        open={confirm?.kind === 'report'}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={
          confirm?.kind === 'report' && confirm.action === 'resolve'
            ? 'Đánh dấu báo cáo đã xử lý?'
            : 'Bỏ qua báo cáo này?'
        }
        description={
          confirm?.kind === 'report'
            ? confirm.action === 'resolve'
              ? `“${confirm.reason}” — đóng báo cáo khỏi hàng đợi. Không gỡ nội dung; muốn gỡ thì dùng nút gỡ bài.`
              : `“${confirm.reason}” — báo cáo bị bỏ qua và rời khỏi hàng đợi.`
            : undefined
        }
        confirmLabel={
          confirm?.kind === 'report' && confirm.action === 'resolve' ? 'Đánh dấu xử lý' : 'Bỏ qua'
        }
        variant={confirm?.kind === 'report' && confirm.action === 'resolve' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => {
          if (confirm?.kind === 'report') void actOnReport(confirm.id, confirm.action);
        }}
      />
    </section>
  );
}
