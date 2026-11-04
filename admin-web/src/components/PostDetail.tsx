import '../pages/moderation-media.css';
import './post-admin.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Flag,
  Heart,
  MessageCircle,
  RotateCcw,
  Share2,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../apiClient';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';
import { apiErrorMessage, formatDateTime, formatNumber, initials } from './formatters';
import { auditActionLabel, auditActionTone, auditTargetLabel } from './audit-labels';
import { scopeLabel, scopeTableLabel, scopeTone } from '../pages/PostsPage';
import { PostLikersPanel } from './PostLikersPanel';

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
  /** Phạm vi hiển thị — quyết định mức độ nghiêm trọng khi gỡ. */
  audienceScope?: 'public' | 'connections' | 'custom';
  audienceListId?: string | null;
  audienceListName?: string | null;
  /** Tên người được gắn thẻ, server đã resolve — không phải ObjectId thô. */
  mentionUserNames?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface PostCommentView {
  _id: string;
  content: string;
  authorId?: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  isActive?: boolean;
  parentId?: string | null;
  likeCount?: number;
  createdAt?: string;
  replies?: PostCommentView[];
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
  const [likersOpen, setLikersOpen] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: 'lifecycle' }
    | { kind: 'report'; id: string; action: 'resolve' | 'dismiss'; reason: string }
    | { kind: 'comment'; id: string; action: 'takedown' | 'restore' }
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

  // Bình luận, kèm cả bình luận đã gỡ — moderator cần thấy để khôi phục.
  const commentsQuery = useQuery({
    queryKey: ['post-comments', id],
    queryFn: async () => {
      const res = await apiClient.get<{ comments: PostCommentView[]; total: number }>(
        `/admin/posts/${id}/comments`,
        { params: { limit: 50 } },
      );
      return res.data;
    },
    enabled: Boolean(id),
  });

  const post = postQuery.data;
  const reports = reportsQuery.data ?? [];
  const comments = commentsQuery.data?.comments ?? [];

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

  async function actOnComment(commentId: string, action: 'takedown' | 'restore') {
    setBusy(true);
    try {
      await apiClient.post(`/admin/posts/comments/${commentId}/${action}`);
      setConfirm(null);
      addToast(
        'success',
        action === 'takedown' ? 'Đã gỡ bình luận.' : 'Đã khôi phục bình luận.',
      );
      // Counter bình luận trên bài đổi theo → nạp lại cả chi tiết.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['post-comments', id] }),
        queryClient.invalidateQueries({ queryKey: ['post', id] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
        queryClient.invalidateQueries({ queryKey: ['post-audit', id] }),
      ]);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Thao tác bình luận thất bại.'));
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
  const media = post.media ?? [];
  const mentions = post.mentionUserNames ?? [];

  return (
    <section className="table-shell detail-card detail-page--split">
      <div className="post-detail-layout">
        {/* Rail: danh tính + tín hiệu quyết định. Moderator mở bài để trả lời
            "có nên gỡ không" — câu trả lời nằm ở đây, không nằm trong danh sách
            field. */}
        <aside className="post-rail" aria-label="Tóm tắt bài đăng">
          <div className="post-rail-identity">
            {post.authorAvatar ? (
              <img
                className="post-rail-avatar"
                src={post.authorAvatar}
                alt=""
                width={48}
                height={48}
              />
            ) : (
              <div className="post-rail-avatar post-rail-avatar--initial" aria-hidden>
                {initials(post.authorName ?? '?', '?')}
              </div>
            )}
            <div className="post-rail-name">
              <h2>{post.authorName ?? 'Tài khoản đã xoá'}</h2>
              <p className="cell-meta">Đăng {formatDateTime(post.createdAt)}</p>
            </div>
            <div className="post-rail-badges">
              {hidden
                ? <StatusBadge tone="muted" label="Đã gỡ" />
                : <StatusBadge tone="success" label="Đang hiển thị" />}
              <span title={scopeLabel(post)}>
                <StatusBadge
                  tone={scopeTone(post.audienceScope)}
                  label={scopeTableLabel(post)}
                />
              </span>
            </div>
          </div>

          <dl className="post-rail-signals">
            <div className="post-rail-signal">
              <dt><Flag size={14} aria-hidden /> Báo cáo chờ</dt>
              <dd>
                {(post.pendingReportCount ?? 0) > 0 ? (
                  <strong>{formatNumber(post.pendingReportCount ?? 0)}</strong>
                ) : (
                  <span className="cell-meta">Không có</span>
                )}
              </dd>
            </div>
            <div className="post-rail-signal">
              <dt><Heart size={14} aria-hidden /> Lượt thích</dt>
              <dd>
                {(post.likeCount ?? 0) > 0 ? (
                  <button
                    className="post-rail-link"
                    type="button"
                    onClick={() => setLikersOpen(true)}
                  >
                    {formatNumber(post.likeCount ?? 0)}
                  </button>
                ) : (
                  <span className="cell-meta">0</span>
                )}
              </dd>
            </div>
            <div className="post-rail-signal">
              <dt><MessageCircle size={14} aria-hidden /> Bình luận</dt>
              <dd>{formatNumber(post.commentCount ?? 0)}</dd>
            </div>
            <div className="post-rail-signal">
              <dt><Share2 size={14} aria-hidden /> Chia sẻ</dt>
              <dd>{formatNumber(post.shareCount ?? 0)}</dd>
            </div>
            <div className="post-rail-signal">
              <dt><Users size={14} aria-hidden /> Phạm vi</dt>
              <dd>{scopeLabel(post)}</dd>
            </div>
            {mentions.length > 0 && (
              <div className="post-rail-signal">
                <dt>Gắn thẻ</dt>
                <dd>{mentions.join(', ')}</dd>
              </div>
            )}
          </dl>

          <div className="post-rail-id">
            <span className="cell-meta">Mã bài đăng</span>
            <span className="k-mono">{post._id}</span>
          </div>
        </aside>

        <div className="post-body">
          {/* Nội dung như người dùng thấy — một khối liền, không tách
              "Nội dung / Media" theo schema. */}
          <article className="post-preview" aria-label="Nội dung bài đăng">
            <p className={`post-caption${post.caption?.trim() ? '' : ' post-caption--empty'}`}>
              {post.caption?.trim() || 'Bài đăng chỉ có media, không có chữ.'}
            </p>
            {media.length > 0 && (
              <div className="post-media-grid">
                {media.map((m, i) => (
                  <div key={`${m.mediaKey}-${i}`}>
                    {!m.mediaUrlSigned ? (
                      <p className="alert" role="alert">
                        Không tải được media — URL có thể đã hết hạn.
                      </p>
                    ) : m.mediaType === 'video' ? (
                      <video
                        controls
                        src={m.mediaUrlSigned}
                        poster={m.thumbnailUrlSigned ?? undefined}
                        className="post-media-item"
                      />
                    ) : (
                      <a
                        href={m.mediaUrlSigned}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="post-media-item"
                      >
                        <img src={m.mediaUrlSigned} alt={`Ảnh ${i + 1} của bài đăng`} loading="lazy" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="post-meta-line">
              <span><strong>{formatNumber(post.likeCount ?? 0)}</strong> thích</span>
              <span><strong>{formatNumber(post.commentCount ?? 0)}</strong> bình luận</span>
              <span><strong>{formatNumber(post.shareCount ?? 0)}</strong> chia sẻ</span>
            </p>
          </article>

          <section className="detail-section">
            <h3 className="detail-section-title">
              Báo cáo chờ xử lý ({reports.length})
            </h3>
            {reportsQuery.isError ? (
              <p className="cell-meta">Không tải được báo cáo.</p>
            ) : reports.length === 0 ? (
              <p className="cell-meta">Không có báo cáo nào đang chờ.</p>
            ) : (
              <ul className="post-report-list" aria-label="Báo cáo đang chờ">
                {reports.map((r) => (
                  <li key={r._id} className="post-report-item">
                    <div className="post-report-main">
                      <p className="post-report-reason">{r.reason}</p>
                      <p className="cell-meta">
                        {r.reporterName ?? 'Không rõ'} · {formatDateTime(r.createdAt)}
                      </p>
                    </div>
                    {/* Hai quyết định ngang hàng về nghiệp vụ, nhưng "Bỏ qua" là
                        hành động phụ — để ghost để mắt không bị chia đôi. */}
                    <div className="post-report-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ kind: 'report', id: r._id, action: 'dismiss', reason: r.reason })
                        }
                      >
                        Bỏ qua
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ kind: 'report', id: r._id, action: 'resolve', reason: r.reason })
                        }
                      >
                        <Check size={15} strokeWidth={2.2} aria-hidden /> Đã xử lý
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="detail-section">
            <h3 className="detail-section-title">
              Bình luận ({formatNumber(commentsQuery.data?.total ?? 0)})
            </h3>
            {commentsQuery.isError ? (
              <p className="cell-meta">Không tải được bình luận.</p>
            ) : commentsQuery.isLoading ? (
              <p className="cell-meta">Đang tải bình luận…</p>
            ) : comments.length === 0 ? (
              <p className="cell-meta">Bài đăng chưa có bình luận nào.</p>
            ) : (
              <div>
                {comments.map((c) => (
                  <div key={c._id} className="post-comment-item">
                    <CommentAvatar name={c.authorName} />
                    <div className="post-comment-body">
                      <p className={`post-comment-text${c.isActive === false ? ' post-comment-text--removed' : ''}`}>
                        {c.content}
                      </p>
                      <p className="post-comment-meta">
                        <span>{c.authorName ?? 'Tài khoản đã xoá'}</span>
                        <span>·</span>
                        <span>{formatDateTime(c.createdAt)}</span>
                        {c.isActive === false && <StatusBadge tone="muted" label="Đã gỡ" />}
                      </p>
                      {(c.replies ?? []).length > 0 && (
                        <div className="post-comment-replies">
                          {(c.replies ?? []).map((r) => (
                            <div key={r._id} className="post-comment-item">
                              <CommentAvatar name={r.authorName} small />
                              <div className="post-comment-body">
                                <p className={`post-comment-text${r.isActive === false ? ' post-comment-text--removed' : ''}`}>
                                  {r.content}
                                </p>
                                <p className="post-comment-meta">
                                  <span>{r.authorName ?? 'Tài khoản đã xoá'}</span>
                                  <span>·</span>
                                  <span>{formatDateTime(r.createdAt)}</span>
                                  {r.isActive === false && <StatusBadge tone="muted" label="Đã gỡ" />}
                                </p>
                              </div>
                              <CommentAction
                                removed={r.isActive === false}
                                disabled={busy}
                                onClick={() =>
                                  setConfirm({
                                    kind: 'comment',
                                    id: r._id,
                                    action: r.isActive === false ? 'restore' : 'takedown',
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <CommentAction
                      removed={c.isActive === false}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          kind: 'comment',
                          id: c._id,
                          action: c.isActive === false ? 'restore' : 'takedown',
                        })
                      }
                    />
                  </div>
                ))}
              </div>
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
      </div>

      <footer className="detail-bottombar">
        <Link className="btn btn-ghost btn-sm" to={backTo}>
          <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
        </Link>
        <span className="detail-bottombar-spacer" />
        {hidden ? (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={busy}
            onClick={() => setConfirm({ kind: 'lifecycle' })}
          >
            <RotateCcw size={15} strokeWidth={2.2} aria-hidden /> Khôi phục bài đăng
          </button>
        ) : (
          <button
            className="btn btn-danger btn-sm"
            type="button"
            disabled={busy}
            onClick={() => setConfirm({ kind: 'lifecycle' })}
          >
            <Trash2 size={15} strokeWidth={2.2} aria-hidden /> Gỡ bài đăng
          </button>
        )}
      </footer>

      {likersOpen && (
        <PostLikersPanel
          postId={post._id}
          total={post.likeCount ?? 0}
          onClose={() => setLikersOpen(false)}
        />
      )}

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

      <ConfirmDialog
        open={confirm?.kind === 'comment'}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={
          confirm?.kind === 'comment' && confirm.action === 'restore'
            ? 'Khôi phục bình luận?'
            : 'Gỡ bình luận?'
        }
        description={
          confirm?.kind === 'comment'
            ? confirm.action === 'restore'
              ? 'Bình luận hiện lại. Các trả lời bị gỡ trước đó vẫn ẩn cho tới khi khôi phục riêng.'
              : 'Bình luận bị ẩn khỏi bài, nội dung vẫn giữ trong DB. Nếu đây là bình luận gốc, các trả lời cũng bị ẩn theo.'
            : undefined
        }
        confirmLabel={confirm?.kind === 'comment' && confirm.action === 'restore' ? 'Khôi phục' : 'Gỡ bình luận'}
        variant={confirm?.kind === 'comment' && confirm.action === 'restore' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => {
          if (confirm?.kind === 'comment') void actOnComment(confirm.id, confirm.action);
        }}
      />
    </section>
  );
}

/** Avatar tròn nhỏ cho một dòng bình luận — cùng quy ước rail nhưng gọn hơn. */
function CommentAvatar({ name, small }: { name?: string | null; small?: boolean }) {
  return (
    <span
      className={`post-rail-avatar post-rail-avatar--initial ${small ? 'post-rail-avatar--small' : 'post-comment-avatar'}`}
      aria-hidden
    >
      {initials(name ?? '?', '?')}
    </span>
  );
}

/**
 * Nút gỡ/khôi phục của một bình luận: icon-only, hiện khi hover.
 *
 * Bình luận là nội dung để đọc; nếu mỗi dòng đều có nút chữ "Gỡ" thì nút át
 * chính nội dung (đo trên bài 20 bình luận). Icon + `aria-label` + `title` vẫn
 * đủ nghĩa cho screen reader và tooltip.
 */
function CommentAction({
  removed,
  disabled,
  onClick,
}: {
  removed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`btn btn-icon btn-sm post-comment-action ${removed ? 'btn-secondary' : 'btn-danger-ghost'}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={removed ? 'Khôi phục bình luận' : 'Gỡ bình luận'}
      aria-label={removed ? 'Khôi phục bình luận' : 'Gỡ bình luận'}
    >
      {removed
        ? <Undo2 size={14} strokeWidth={2} aria-hidden />
        : <Trash2 size={14} strokeWidth={2} aria-hidden />}
    </button>
  );
}
