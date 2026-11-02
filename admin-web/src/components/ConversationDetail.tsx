import '../pages/ConversationsPage.css';
import '../pages/moderation-media.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import apiClient from '../apiClient';
import { StatusBadge } from './StatusBadge';
import { reportStatusLabel, reportStatusTone } from './report-labels';
import { initials, formatDateTime } from './formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

export interface ConversationMember {
  userId: string;
  role?: string;
  displayName?: string | null;
  avatar?: string | null;
  accountType?: string | null;
  joinedAt?: string;
}

export interface DetailMessage {
  _id: string;
  senderId: string;
  content?: string;
  type?: string;
  /** MinIO key thô — không phát được trực tiếp trên web. */
  mediaUrl?: string;
  /** URL đã ký; null nghĩa là presign thất bại (khác với field không tồn tại). */
  mediaUrlSigned?: string | null;
  mediaMimeType?: string;
  mediaSize?: number;
  createdAt?: string;
  deleted?: boolean;
  /** Ngữ cảnh trả lời/like — backend trả sẵn, trước đây bị bỏ qua. */
  replyTo?: string | null;
  replyToPreview?: { senderId: string; text?: string; mediaType?: string } | null;
  reactions?: Array<{ userId: string; emoji: string }>;
}

export interface RelatedReport {
  _id: string;
  reason: string;
  status: string;
  targetId?: string;
  reporterName?: string | null;
  createdAt?: string;
  /** Chỉ có ở bản resolved/dismissed — dùng cho section lịch sử. */
  resolvedByName?: string | null;
  resolvedAt?: string;
}

/** Pinned đã backend resolve: messageId + nội dung + tên người ghim (§B2). */
export interface PinnedMessagePreview {
  messageId: string;
  pinnedBy: string;
  pinnedByName: string | null;
  pinnedAt: string;
  found: boolean;
  content?: string;
  type?: string;
  deleted?: boolean;
  senderName?: string | null;
  mediaUrlSigned?: string;
}

export interface ConversationDetailPayload {
  conversation: {
    _id: string;
    type: string;
    name?: string | null;
    displayName?: string | null;
    createdAt?: string;
    lastMessageAt?: string | null;
    avatar?: string | null;
    createdBy?: string;
  };
  members: ConversationMember[];
  recentMessages: DetailMessage[];
  pinnedMessages?: PinnedMessagePreview[];
  hasMore: boolean;
  reportedMessageCounts: Record<string, number>;
}

const MSG_PAGE = 20;
const DELETED_NAME = 'Người dùng đã xóa';
const GROUP_GAP_MS = 5 * 60 * 1000;

function senderColorIdx(senderId: string) {
  let h = 0;
  for (let i = 0; i < senderId.length; i++) h = (h * 31 + senderId.charCodeAt(i)) >>> 0;
  return h % 8;
}

function msgTimeMs(m: DetailMessage) {
  const t = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
}

export function typeLabel(type: string) {
  return type === 'group' ? 'Nhóm' : type === 'direct' ? 'Trực tiếp' : type;
}

function convName(c: { displayName?: string | null; name?: string | null } | null | undefined) {
  return c?.displayName || c?.name || '(Không tên)';
}

function formatClock(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Ngày ngắn theo locale — dùng trong chip member (không cần giờ). */
function shortDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN');
}

function formatSize(bytes?: number | null) {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileNameOf(url?: string) {
  if (!url) return 'Tệp đính kèm';
  try {
    const tail = new URL(url).pathname.split('/').pop();
    return decodeURIComponent(tail || 'Tệp đính kèm');
  } catch {
    const tail = url.split('/').pop();
    return tail || 'Tệp đính kèm';
  }
}

function escapeFind(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hi(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeFind(q)})`, 'gi'));
  if (parts.length <= 1) return text;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="conv-mark">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Presign thất bại — cho moderator thử ký lại URL thay vì phải tải lại trang. */
function MediaUnavailable({
  m,
  find,
  onRetry,
}: {
  m: DetailMessage;
  find?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="conv-msg-media">
      <div className="mod-media-error">
        <span>Không tải được media</span>
        {onRetry && (
          <button className="btn btn-secondary btn-sm" type="button" onClick={onRetry}>
            Thử lại
          </button>
        )}
      </div>
      {/* Vẫn giữ phần chữ để moderator đọc được ngữ cảnh khi media hỏng. */}
      {m.content ? <p className="conv-msg-text">{hi(m.content, find ?? '')}</p> : null}
    </div>
  );
}

function MessageBody({
  m,
  find,
  onRetry,
}: {
  m: DetailMessage;
  find?: string;
  onRetry?: () => void;
}) {
  if (m.deleted) return <p className="conv-msg-text conv-msg-deleted">(Nội dung đã gỡ)</p>;
  // mediaUrl là MinIO key, chỉ mediaUrlSigned mở được trên web. Signed = null
  // (khác undefined) là presign thất bại — báo lỗi thay vì render key hỏng.
  const url = m.mediaUrlSigned ?? '';
  const presignFailed = Boolean(m.mediaUrl) && m.mediaUrlSigned === null;
  const kind = m.type ?? 'text';
  if (kind === 'image' && (url || presignFailed)) {
    if (presignFailed || !url) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="conv-msg-media">
        <img src={url} alt={m.content || 'Ảnh'} loading="lazy" className="conv-msg-img" />
        {m.content ? <p className="conv-msg-text">{hi(m.content, find ?? '')}</p> : null}
      </a>
    );
  }
  if (kind === 'voice' && (url || presignFailed)) {
    if (presignFailed || !url) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
    return (
      <div className="conv-msg-media">
        {/* ponytail: native player, add custom waveform if moderators need scrubbing */}
        <audio controls preload="none" src={url} className="conv-msg-audio" />
        {m.content ? <p className="conv-msg-text">{hi(m.content, find ?? '')}</p> : null}
      </div>
    );
  }
  if (kind === 'video' && (url || presignFailed)) {
    if (presignFailed || !url) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
    return (
      <div className="conv-msg-media">
        <video controls preload="metadata" src={url} className="conv-msg-video" />
        {m.content ? <p className="conv-msg-text">{hi(m.content, find ?? '')}</p> : null}
      </div>
    );
  }
  if (kind === 'file' && (url || presignFailed)) {
    if (presignFailed || !url) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="conv-msg-file">
        <span className="conv-msg-file-icon" aria-hidden="true"><FileText size={16} strokeWidth={2} /></span>
        <span className="conv-msg-file-meta">
          <span className="conv-msg-file-name">{m.content ? hi(m.content, find ?? '') : fileNameOf(url)}</span>
          {formatSize(m.mediaSize) ? (
            <span className="conv-msg-file-size">{formatSize(m.mediaSize)}</span>
          ) : null}
        </span>
      </a>
    );
  }
  return <p className="conv-msg-text">{hi(m.content || '(tin nhắn trống)', find ?? '')}</p>;
}

/**
 * Chi tiết một hội thoại — component inline ở route `/conversations/:id`
 * (DESIGN §3B). Tách từ drawer cũ: luồng tin nhắn, nhóm 5 phút, thanh tìm,
 * tải thêm giữ vị trí cuộn và presign-retry giữ nguyên hành vi.
 */
export function ConversationDetail({ id, backTo }: { id: string; backTo: string }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const msgScrollRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const msgRowRefs = useRef(new Map<string, HTMLDivElement>());
  const scrolledIdRef = useRef<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const res = await apiClient.get<ConversationDetailPayload>(`/admin/conversations/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });

  // Báo cáo chờ xử lý fetch thẳng theo targetId — trước đây tải 50 báo cáo của
  // mọi hội thoại rồi lọc ở trình duyệt, sai ngay khi vượt một trang.
  const reportsQuery = useQuery({
    queryKey: ['conversation-reports', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RelatedReport[] }>('/admin/reports', {
        params: { targetType: 'conversation', targetId: id, status: 'pending', limit: 50 },
      });
      return (res.data.data ?? []).filter((r) => r.status === 'pending');
    },
    enabled: Boolean(id),
  });

  // Lịch sử: query RIÊNG không truyền status (mới nhất trước), tách client —
  // không nới lỏng query pending, không bao giờ trộn báo cáo cũ vào hàng đợi.
  const historyQuery = useQuery({
    queryKey: ['conversation-reports-history', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RelatedReport[] }>('/admin/reports', {
        params: { targetType: 'conversation', targetId: id, limit: 20 },
      });
      return (res.data.data ?? []).filter((r) => r.status !== 'pending');
    },
    enabled: Boolean(id),
  });

  // Tin nhắn cũ tải thêm nằm riêng; danh sách hiển thị = cũ + trang đầu từ query.
  // Trang chi tiết mount lại theo `key={id}` nên không cần effect reset.
  const [olderMessages, setOlderMessages] = useState<DetailMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const [moreLoading, setMoreLoading] = useState(false);

  const detail = detailQuery.data?.conversation;
  const members = detailQuery.data?.members ?? [];
  const reportedCounts = detailQuery.data?.reportedMessageCounts ?? {};
  const reports = reportsQuery.data ?? [];
  const reportHistory = historyQuery.data ?? [];
  const pinned = detailQuery.data?.pinnedMessages ?? [];

  // Server trả mới nhất trước; stream đọc từ trên xuống.
  const messages = useMemo(
    () =>
      [...olderMessages, ...(detailQuery.data?.recentMessages ?? []).slice().reverse()].map(
        (m) => (deletedIds.has(m._id) ? { ...m, deleted: true } : m),
      ),
    [olderMessages, detailQuery.data, deletedIds],
  );
  const hasMore = hasMoreOlder ?? Boolean(detailQuery.data?.hasMore);

  // Tìm trong hội thoại: server search + fallback lọc client.
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIdx, setFindIdx] = useState(0);
  const [serverIds, setServerIds] = useState<Set<string> | null>(null);
  const [findHint, setFindHint] = useState(false);
  const findQ = findOpen ? findQuery.trim() : '';

  useEffect(() => {
    if (!findOpen || !findQ) {
      setServerIds(null);
      setFindHint(false);
      return;
    }
    const timer = setTimeout(() => {
      apiClient
        .get('/admin/messages/search', { params: { q: findQ, conversationId: id, limit: 100 } })
        .then((res) => {
          const data: { _id: string; conversationId?: string }[] = res.data.data ?? [];
          // Fallback client-side nếu kết quả lẫn hội thoại khác.
          if (data.some((d) => d.conversationId && String(d.conversationId) !== id)) {
            setServerIds(null);
            setFindHint(true);
            return;
          }
          setServerIds(new Set(data.map((d) => String(d._id))));
          setFindHint(false);
        })
        .catch(() => {
          setServerIds(null);
          setFindHint(true);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [findOpen, findQ, id]);

  const findMatches = !findQ
    ? []
    : serverIds
      ? messages.filter((m) => serverIds.has(m._id))
      : messages.filter((m) => (m.content ?? '').toLowerCase().includes(findQ.toLowerCase()));
  const activeMatchId = findMatches.length > 0 ? findMatches[findIdx % findMatches.length]._id : null;

  useEffect(() => setFindIdx(0), [findQ]);

  useEffect(() => {
    if (!activeMatchId) return;
    msgRowRefs.current.get(activeMatchId)?.scrollIntoView({ block: 'center' });
  }, [activeMatchId, findIdx]);

  // Ctrl/Cmd+F mở thanh tìm khi đang ở trang chi tiết.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Cuộn xuống đáy chỉ ở lần mở đầu tiên; tải thêm tự giữ vị trí.
  useEffect(() => {
    if (!id || messages.length === 0) return;
    if (scrolledIdRef.current === id) return;
    scrolledIdRef.current = id;
    const box = msgScrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [id, messages.length]);

  function stepFind(dir: 1 | -1) {
    if (findMatches.length === 0) return;
    setFindIdx((i) => (i + dir + findMatches.length) % findMatches.length);
  }

  function closeFind() {
    setFindOpen(false);
    setFindQuery('');
    setFindIdx(0);
    setServerIds(null);
    setFindHint(false);
  }

  const loadOlder = useCallback(async () => {
    if (moreLoading || messages.length === 0) return;
    const oldest = messages[0].createdAt;
    if (!oldest) return;
    setMoreLoading(true);
    const box = msgScrollRef.current;
    const prevHeight = box?.scrollHeight ?? 0;
    try {
      const res = await apiClient.get<ConversationDetailPayload>(`/admin/conversations/${id}`, {
        params: { before: oldest, limit: MSG_PAGE },
      });
      const older: DetailMessage[] = (res.data.recentMessages ?? []).slice().reverse();
      setOlderMessages((prev) => [...older, ...prev]);
      setHasMoreOlder(Boolean(res.data.hasMore));
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight;
      });
    } catch {
      addToast('error', 'Không tải thêm được tin nhắn.');
    } finally {
      setMoreLoading(false);
    }
  }, [id, messages, moreLoading, addToast]);

  // Gỡ tin nhắn: luôn qua hộp xác nhận (§0.5).
  const [confirmMsg, setConfirmMsg] = useState<{ id: string; preview: string } | null>(null);
  const [msgBusy, setMsgBusy] = useState(false);

  async function executeSoftDelete() {
    if (!confirmMsg || msgBusy) return;
    setMsgBusy(true);
    try {
      await apiClient.post(`/admin/messages/${confirmMsg.id}/soft-delete`);
      setDeletedIds((prev) => new Set(prev).add(confirmMsg.id));
      addToast('success', 'Đã gỡ tin nhắn vi phạm.');
      setConfirmMsg(null);
    } catch {
      addToast('error', 'Gỡ tin nhắn thất bại. Vui lòng thử lại.');
    } finally {
      setMsgBusy(false);
    }
  }

  const [reportBusy, setReportBusy] = useState<string | null>(null);
  // Resolve/dismiss luôn qua confirm (task 4.5) — cùng copy với ReportDetail,
  // vì hai nơi xử lý đúng một hàng đợi báo cáo.
  const [reportConfirm, setReportConfirm] = useState<{
    id: string;
    action: 'resolve' | 'dismiss';
    reason: string;
  } | null>(null);

  async function actOnReport(reportId: string, action: 'resolve' | 'dismiss') {
    setReportBusy(reportId);
    try {
      await apiClient.post(`/admin/reports/${reportId}/${action}`);
      setReportConfirm(null);
      addToast('success', action === 'resolve' ? 'Đã giải quyết báo cáo.' : 'Đã bỏ qua báo cáo.');
      // List mang pendingReportCount/oldestPendingReportAt → phải lấy lại số mới.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversation-reports', id] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', id] }),
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-stats'] }),
      ]);
    } catch {
      addToast('error', 'Thao tác báo cáo thất bại.');
    } finally {
      setReportBusy(null);
    }
  }

  const nameOf = (userId: string) =>
    members.find((m) => String(m.userId) === String(userId))?.displayName || DELETED_NAME;

  // Chỉ http(s) mới render — avatar là URL từ user, không tin scheme khác (§0.7).
  const avatarSrc =
    detail && /^https?:\/\//i.test(detail.avatar ?? '') ? detail.avatar! : null;

  /** Tally emoji: [{emoji: '👍' ×2}] → "👍 2" —userId là dữ liệu thô, không hiện. */
  function reactionTally(m: DetailMessage): Array<{ emoji: string; n: number }> {
    if (!m.reactions?.length) return [];
    const tally = new Map<string, number>();
    for (const r of m.reactions) tally.set(r.emoji, (tally.get(r.emoji) ?? 0) + 1);
    return [...tally.entries()].map(([emoji, n]) => ({ emoji, n }));
  }

  /** Quote trả lời: sender + snippet (text hoặc nhãn loại media). */
  function replyQuote(m: DetailMessage): { name: string; text: string } | null {
    const p = m.replyToPreview;
    if (!m.replyTo || !p) return null;
    return {
      name: p.senderId ? nameOf(p.senderId) : DELETED_NAME,
      text: p.text || (p.mediaType ? `[${typeLabel(p.mediaType)}]` : ''),
    };
  }

  const loadError = (detailQuery.error as { response?: { data?: { message?: string } } } | null)
    ?.response?.data?.message;

  if (detailQuery.isLoading) {
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết hội thoại">
        <div className="conv-skeleton" aria-label="Đang tải chi tiết">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-line conv-skel-msg" />
          ))}
        </div>
      </section>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết hội thoại">
        <div className="empty-state" role="alert">
          <div>
            <div className="state-title">Không tải được hội thoại</div>
            <p className="state-copy">
              {loadError ?? 'Hội thoại có thể đã bị xoá hoặc kết nối gián đoạn.'}
            </p>
            <div className="table-actions state-actions">
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void detailQuery.refetch()}>
                Thử lại
              </button>
              <Link className="btn btn-ghost btn-sm" to={backTo}>Về danh sách</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const pendingCount = reports.length;

  return (
    <section className="table-shell detail-card conv-detail" aria-label={`Hội thoại ${convName(detail)}`}>
      <div className="detail-header">
        <div className="detail-avatar" aria-hidden="true">
          {avatarSrc ? <img src={avatarSrc} alt="" /> : initials(convName(detail), 'H')}
        </div>
        <div className="detail-heading">
          <div className="detail-title-row">
            <h1 className="detail-title">{convName(detail)}</h1>
            <StatusBadge tone="muted" label={typeLabel(detail.type)} />
            <StatusBadge tone="muted" label={`${members.length} thành viên`} />
            {pendingCount > 0 && <StatusBadge tone="warning" label={`${pendingCount} báo cáo`} />}
          </div>
          <div className="detail-subline">
            <span>Tạo {formatDateTime(detail.createdAt)}</span>
            <span className="detail-dot" aria-hidden>·</span>
            <span>Hoạt động cuối {formatDateTime(detail.lastMessageAt)}</span>
          </div>
        </div>
        {!findOpen && (
          <button
            className="btn btn-ghost btn-sm conv-icon-btn"
            onClick={() => {
              setFindOpen(true);
              requestAnimationFrame(() => findInputRef.current?.focus());
            }}
            type="button"
            aria-label="Tìm trong hội thoại"
            title="Tìm trong hội thoại"
          >
            <Search size={16} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>

      <div className="detail-card-body conv-detail-body">
        <div className="conv-findbar" hidden={!findOpen}>
          <input
            ref={findInputRef}
            className="input conv-find-input"
            type="search"
            placeholder="Tìm trong hội thoại…"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                stepFind(e.shiftKey ? -1 : 1);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                stepFind(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                stepFind(-1);
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                closeFind();
              }
            }}
            aria-label="Tìm tin nhắn trong hội thoại"
          />
          <span className="cell-meta conv-find-count" aria-live="polite">
            {findQ ? `${findMatches.length > 0 ? (findIdx % findMatches.length) + 1 : 0}/${findMatches.length}` : ''}
          </span>
          <button className="btn btn-ghost btn-sm conv-icon-btn" onClick={() => stepFind(-1)} type="button" aria-label="Kết quả trước" title="Kết quả trước" disabled={findMatches.length === 0}><ChevronUp size={16} strokeWidth={2} aria-hidden /></button>
          <button className="btn btn-ghost btn-sm conv-icon-btn" onClick={() => stepFind(1)} type="button" aria-label="Kết quả tiếp" title="Kết quả tiếp" disabled={findMatches.length === 0}><ChevronDown size={16} strokeWidth={2} aria-hidden /></button>
          <button className="btn btn-ghost btn-sm conv-icon-btn" onClick={closeFind} type="button" aria-label="Đóng tìm kiếm" title="Đóng tìm kiếm"><X size={16} strokeWidth={2} aria-hidden /></button>
        </div>
        {/* Server fallback hoặc còn tin ngoài trang đầu — gợi ý tải thêm (khớp drawer cũ). */}
        {(findHint || hasMore) && findQ ? <p className="cell-meta conv-find-hint">Tải thêm để tìm tiếp</p> : null}

        <dl className="description-list conv-desc">
          <div>
            <dt>Loại hội thoại</dt>
            <dd>{typeLabel(detail.type)}</dd>
          </div>
          <div>
            <dt>Số thành viên</dt>
            <dd>{members.length}</dd>
          </div>
          <div>
            <dt>Tạo lúc</dt>
            <dd>{formatDateTime(detail.createdAt)}</dd>
          </div>
          <div>
            <dt>Hoạt động cuối</dt>
            <dd>{formatDateTime(detail.lastMessageAt)}</dd>
          </div>
          <div className="conv-desc-technical">
            <details>
              <summary>Chi tiết kỹ thuật</summary>
              <dl className="description-list">
                <div>
                  <dt>Mã hội thoại</dt>
                  <dd className="k-mono">{detail._id}</dd>
                </div>
                <div>
                  <dt>Người tạo</dt>
                  <dd className="k-mono">{detail.createdBy ?? '—'}</dd>
                </div>
              </dl>
            </details>
          </div>
        </dl>

        {pinned.length > 0 && (
          <section aria-label="Tin đã ghim" className="conv-reports">
            <h2 className="panel-title">Đã ghim ({pinned.length})</h2>
            {pinned.map((p) => (
              <div key={p.messageId} className="surface-card conv-report">
                <p className="cell-title">
                  {!p.found
                    ? 'Tin nhắn không còn tồn tại'
                    : p.deleted
                      ? '(Nội dung đã gỡ)'
                      : p.content || (p.type ? typeLabel(p.type) : '(không có nội dung)')}
                </p>
                {p.found && !p.deleted && p.mediaUrlSigned && p.type === 'image' && (
                  <img src={p.mediaUrlSigned} alt="" className="conv-msg-img conv-pinned-img" loading="lazy" />
                )}
                <div className="cell-meta">
                  Đã ghim bởi {p.pinnedByName ?? 'Không rõ'}
                  {p.senderName ? ` · tin của ${p.senderName}` : ''} · {formatDateTime(p.pinnedAt)}
                </div>
              </div>
            ))}
          </section>
        )}

        <section aria-label="Thành viên" className="conv-members-section">
          <h2 className="panel-title">Thành viên ({members.length})</h2>
          <div className="conv-members">
            {members.map((m) => (
              <Link
                key={String(m.userId)}
                to={`/users/${m.userId}`}
                className="conv-member-chip"
                title={m.displayName ?? DELETED_NAME}
              >
                <span className="conv-member-avatar" aria-hidden="true">
                  {initials(m.displayName ?? '?', '?')}
                </span>
                {m.displayName ?? DELETED_NAME}
                {m.accountType === 'business' ? (
                  <span className="badge badge-muted conv-member-biz">Doanh nghiệp</span>
                ) : null}
                {m.role === 'admin' ? <span className="badge badge-primary">Quản trị</span> : null}
                {m.joinedAt ? (
                  <span className="conv-member-since">tham gia {shortDate(m.joinedAt)}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="Tin nhắn">
          <h2 className="panel-title">Tin nhắn gần đây</h2>
          <div className="conv-chat" ref={msgScrollRef} role="log">
            <div className="conv-more-wrap">
              {hasMore && (
                <button
                  className="btn btn-secondary btn-sm conv-more"
                  onClick={() => void loadOlder()}
                  disabled={moreLoading}
                  type="button"
                >
                  {moreLoading ? 'Đang tải…' : <><ChevronUp size={16} strokeWidth={2} aria-hidden /> Tải thêm tin nhắn</>}
                </button>
              )}
            </div>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const sameSender = prev && String(prev.senderId) === String(m.senderId);
              const t = msgTimeMs(m);
              const pt = prev ? msgTimeMs(prev) : null;
              const grouped = Boolean(sameSender && t != null && pt != null && t - pt < GROUP_GAP_MS);
              const nextSame = next && String(next.senderId) === String(m.senderId);
              const nt = next ? msgTimeMs(next) : null;
              const showTime = !(nextSame && t != null && nt != null && nt - t < GROUP_GAP_MS);
              const isActiveMatch = activeMatchId === m._id;
              const reportedCount = reportedCounts[m._id] ?? 0;
              const quote = replyQuote(m);
              const tally = reactionTally(m);
              return (
                <div
                  key={m._id}
                  ref={(el) => {
                    if (el) msgRowRefs.current.set(m._id, el);
                    else msgRowRefs.current.delete(m._id);
                  }}
                  className={`conv-msg-row${grouped ? ' conv-msg-grouped' : ''}${isActiveMatch ? ' conv-match-active' : ''}`}
                >
                  {!grouped && (
                    <div className="conv-msg-head">
                      <span className="conv-msg-avatar" aria-hidden="true">
                        {initials(nameOf(m.senderId), '?')}
                      </span>
                      <span className={`conv-msg-name conv-sender-${senderColorIdx(String(m.senderId))}`}>{nameOf(m.senderId)}</span>
                      {reportedCount > 0 && (
                        <StatusBadge tone="warning" label={`${reportedCount} báo cáo`} />
                      )}
                    </div>
                  )}
                  <div className="conv-msg-line">
                    <span className="conv-msg-gutter" aria-hidden="true" />
                    <div className="conv-bubble">
                      {quote && (
                        <div className="conv-reply-quote" aria-label="Trả lời tin nhắn">
                          <span className="conv-reply-name">{quote.name}</span>
                          <span className="conv-reply-text">{quote.text}</span>
                        </div>
                      )}
                      <MessageBody
                        m={m}
                        find={findQ}
                        onRetry={() => void detailQuery.refetch()}
                      />
                      {tally.length > 0 && (
                        <div className="conv-reactions" aria-label="Phản ứng">
                          {tally.map((t) => (
                            <span key={t.emoji} className="conv-reaction">
                              {t.emoji} {t.n}
                            </span>
                          ))}
                        </div>
                      )}
                      {showTime && (
                        <div className="conv-bubble-foot">
                          <span>{formatClock(m.createdAt) || formatDateTime(m.createdAt)}</span>
                          {grouped && reportedCount > 0 ? (
                            <StatusBadge tone="warning" label={`${reportedCount} báo cáo`} />
                          ) : null}
                          {m.deleted ? (
                            <StatusBadge tone="muted" label="Đã gỡ" />
                          ) : (
                            <button
                              className="conv-del"
                              onClick={() => setConfirmMsg({ id: m._id, preview: (m.content ?? '').slice(0, 80) })}
                              type="button"
                              aria-label="Gỡ tin nhắn này"
                              title="Gỡ tin nhắn này"
                            >
                              <Trash2 size={13} strokeWidth={2} aria-hidden />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && <p className="cell-meta">Chưa có tin nhắn nào.</p>}
          </div>
        </section>

        {reports.length > 0 && (
          <section aria-label="Báo cáo chờ xử lý" className="conv-reports">
            <h2 className="panel-title">Báo cáo chờ xử lý ({reports.length})</h2>
            {reports.map((r) => (
              <div key={r._id} className="surface-card conv-report">
                <p className="cell-title">{r.reason}</p>
                <div className="cell-meta">
                  {r.reporterName ? `${r.reporterName} · ` : ''}{formatDateTime(r.createdAt)}
                </div>
                <div className="table-actions conv-report-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setReportConfirm({ id: r._id, action: 'resolve', reason: r.reason })}
                    type="button"
                    disabled={reportBusy === r._id}
                  >
                    {reportBusy === r._id ? 'Đang xử lý…' : <><Check size={16} strokeWidth={2} aria-hidden /> Giải quyết</>}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setReportConfirm({ id: r._id, action: 'dismiss', reason: r.reason })}
                    type="button"
                    disabled={reportBusy === r._id}
                    aria-label="Bỏ qua báo cáo"
                  >
                    <X size={16} strokeWidth={2} aria-hidden /> Bỏ qua
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {reportHistory.length > 0 && (
          <section aria-label="Lịch sử báo cáo" className="conv-reports">
            <h2 className="panel-title">Lịch sử báo cáo ({reportHistory.length})</h2>
            {reportHistory.map((r) => (
              <div key={r._id} className="surface-card conv-report">
                <div className="conv-report-history-head">
                  <p className="cell-title">{r.reason}</p>
                  <StatusBadge
                    tone={reportStatusTone(r.status)}
                    label={reportStatusLabel(r.status)}
                  />
                </div>
                <div className="cell-meta">
                  {r.reporterName ?? 'Không rõ'} · {formatDateTime(r.createdAt)}
                  {r.resolvedByName ? ` · xử lý bởi ${r.resolvedByName}` : ''}
                  {r.resolvedAt ? ` ${formatDateTime(r.resolvedAt)}` : ''}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="detail-bottombar">
        <Link className="btn btn-secondary btn-sm" to={backTo}>Về danh sách</Link>
        <span className="detail-bottombar-spacer" />
        <span className="detail-bottombar-note">Mở tin nhắn để gỡ nội dung vi phạm</span>
      </div>

      <ConfirmDialog
        open={reportConfirm !== null}
        onClose={() => {
          if (!reportBusy) setReportConfirm(null);
        }}
        title={reportConfirm?.action === 'resolve' ? 'Đánh dấu báo cáo đã xử lý?' : 'Bỏ qua báo cáo này?'}
        description={
          reportConfirm
            ? reportConfirm.action === 'resolve'
              ? `“${reportConfirm.reason}” — đóng báo cáo khỏi hàng đợi. Không gỡ nội dung; muốn gỡ thì dùng nút gỡ tin nhắn trên dòng tin.`
              : `“${reportConfirm.reason}” — báo cáo bị bỏ qua và rời khỏi hàng đợi. Người dùng không nhận được phản hồi nào.`
            : undefined
        }
        confirmLabel={reportConfirm?.action === 'resolve' ? 'Đánh dấu xử lý' : 'Bỏ qua'}
        variant={reportConfirm?.action === 'resolve' ? 'primary' : 'danger'}
        busy={reportBusy !== null}
        onConfirm={() => {
          if (reportConfirm) void actOnReport(reportConfirm.id, reportConfirm.action);
        }}
      />

      <ConfirmDialog
        open={confirmMsg !== null}
        onClose={() => {
          if (!msgBusy) setConfirmMsg(null);
        }}
        title="Gỡ tin nhắn vi phạm?"
        description={
          confirmMsg
            ? `Tin nhắn "${confirmMsg.preview || '(không nội dung)'}" sẽ bị gỡ khỏi hội thoại. Hành động này không thể hoàn tác.`
            : undefined
        }
        confirmLabel="Xác nhận gỡ"
        onConfirm={() => void executeSoftDelete()}
        busy={msgBusy}
        variant="danger"
      />
    </section>
  );
}

export { convName };
