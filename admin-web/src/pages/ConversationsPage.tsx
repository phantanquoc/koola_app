import './ConversationsPage.css';
import './moderation-media.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Funnel,
  Inbox,
  Search,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import apiClient from '../apiClient';
import { StatusBadge } from '../components/StatusBadge';
import { initials } from '../components/formatters';
import Dialog from '../components/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';

interface Conversation {
  _id: string;
  name?: string | null;
  displayName?: string | null;
  type: string;
  members?: unknown[];
  pendingReportCount?: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
}

interface MemberSummary {
  userId: string;
  role?: string;
  displayName?: string | null;
  avatar?: string | null;
  accountType?: string | null;
}

interface DetailMessage {
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
}

interface RelatedReport {
  _id: string;
  reason: string;
  status: string;
  targetId?: string;
  createdAt?: string;
}

const LIMIT = 20;
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

function typeLabel(type: string) {
  return type === 'group' ? 'Nhóm' : type === 'direct' ? 'Trực tiếp' : type;
}

function convName(c: Conversation | null | undefined) {
  return c?.displayName || c?.name || '(Không tên)';
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN');
}

function formatRelative(value?: string | null) {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 0) return formatTime(value);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}g`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'hôm qua';
  if (d < 7) return `${d}ng`;
  return formatTime(value);
}

function formatClock(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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
  const url = m.mediaUrlSigned ?? m.mediaUrl ?? '';
  const presignFailed = Boolean(m.mediaUrl) && m.mediaUrlSigned === null;
  const kind = m.type ?? 'text';
  if (kind === 'image' && url) {
    if (presignFailed) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="conv-msg-media">
        <img src={url} alt={m.content || 'Ảnh'} loading="lazy" className="conv-msg-img" />
        {m.content ? <p className="conv-msg-text">{hi(m.content, find ?? '')}</p> : null}
      </a>
    );
  }
  if (kind === 'voice' && url) {
    if (presignFailed) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
    return (
      <div className="conv-msg-media">
        {/* ponytail: native player, add custom waveform if moderators need scrubbing */}
        <audio controls preload="none" src={url} className="conv-msg-audio" />
        {m.content ? <p className="conv-msg-text">{hi(m.content, find ?? '')}</p> : null}
      </div>
    );
  }
  if (kind === 'video' && url) {
    if (presignFailed) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
    return (
      <div className="conv-msg-media">
        <video controls preload="metadata" src={url} className="conv-msg-video" />
        {m.content ? <p className="conv-msg-text">{hi(m.content, find ?? '')}</p> : null}
      </div>
    );
  }
  if (kind === 'file' && url) {
    if (presignFailed) return <MediaUnavailable m={m} find={find} onRetry={onRetry} />;
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

/** Presign thất bại — cho moderator thử ký lại URL thay vì phải đóng/mở drawer. */
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

export default function ConversationsPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState({ type: '', size: '', pending: false, media: false, recent: false, sort: 'recent' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailConv, setDetailConv] = useState<Conversation | null>(null);
  const [detailMembers, setDetailMembers] = useState<MemberSummary[]>([]);
  const [detailMessages, setDetailMessages] = useState<DetailMessage[]>([]);
  const [detailHasMore, setDetailHasMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [detailReports, setDetailReports] = useState<RelatedReport[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const msgScrollRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const msgRowRefs = useRef(new Map<string, HTMLDivElement>());

  // In-drawer message find: server search + client fallback
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIdx, setFindIdx] = useState(0);
  const [serverIds, setServerIds] = useState<Set<string> | null>(null);
  const [findHint, setFindHint] = useState(false);

  const [confirmMsg, setConfirmMsg] = useState<{ id: string; preview: string } | null>(null);
  const [msgBusy, setMsgBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState<string | null>(null);

  // "/" focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Search debounce ~300ms; filter commits reset to page 1
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setRequestedPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(requestedPage), limit: String(LIMIT) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filter.type) params.set('type', filter.type);
    if (filter.pending) params.set('hasPendingReport', 'true');
    if (filter.size === 'small') params.set('maxMembers', '9');
    else if (filter.size === 'medium') {
      params.set('minMembers', '10');
      params.set('maxMembers', '99');
    } else if (filter.size === 'large') params.set('minMembers', '100');
    if (filter.media) params.set('hasMedia', 'true');
    if (filter.recent) params.set('activeAfter', new Date(Date.now() - 3600_000).toISOString());
    if (filter.sort === 'created') params.set('sort', 'created');
    apiClient
      .get(`/admin/conversations?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data.data ?? []);
        setTotal(res.data.total ?? 0);
        setPage(res.data.page ?? requestedPage);
      })
      .catch(() => {
        if (!cancelled) setError('Không thể tải danh sách hội thoại.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedPage, debouncedSearch, filter, reloadToken]);

  function setFilterAndReset(next: Partial<typeof filter>) {
    setRequestedPage(1);
    setFilter((f) => ({ ...f, ...next }));
  }

  function clearFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setFilter({ type: '', size: '', pending: false, media: false, recent: false, sort: 'recent' });
    setRequestedPage(1);
  }

  const closeDetail = useCallback(() => {
    setDetailId(null);
    openedIdRef.current = null;
    setFindOpen(false);
    setFindQuery('');
    setFindIdx(0);
    setServerIds(null);
    setFindHint(false);
  }, []);

  // Deep-link `?focus=<conversationId>` từ trang báo cáo: mở sẵn drawer.
  // Xoá param khi đóng để reload không bật lại drawer người dùng vừa tắt.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const closeDetailAndClearFocus = useCallback(() => {
    closeDetail();
    if (focusId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('focus');
          return next;
        },
        { replace: true },
      );
    }
  }, [closeDetail, focusId, setSearchParams]);

  useEffect(() => {
    if (focusId) void openDetail(focusId);
    // Chỉ chạy khi param đổi — openDetail đọc state khác nên không đưa vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const findQ = findOpen ? findQuery.trim() : '';

  // Server search scoped to open conversation (debounced 300ms).
  useEffect(() => {
    if (!findOpen || !detailId || !findQ) {
      setServerIds(null);
      setFindHint(false);
      return;
    }
    const id = setTimeout(() => {
      apiClient
        .get('/admin/messages/search', {
          params: { q: findQ, conversationId: detailId, limit: 100 },
        })
        .then((res) => {
          const data: { _id: string; conversationId?: string }[] = res.data.data ?? [];
          // Fallback client-side nếu kết quả lẫn hội thoại khác.
          if (data.some((d) => d.conversationId && String(d.conversationId) !== detailId)) {
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
    return () => clearTimeout(id);
  }, [findOpen, detailId, findQ]);

  const findMatches = !findQ
    ? []
    : serverIds
      ? detailMessages.filter((m) => serverIds.has(m._id))
      : detailMessages.filter((m) => (m.content ?? '').toLowerCase().includes(findQ.toLowerCase()));

  const activeMatchId = findMatches.length > 0 ? findMatches[findIdx % findMatches.length]._id : null;

  function stepFind(dir: 1 | -1) {
    if (findMatches.length === 0) return;
    setFindIdx((i) => (i + dir + findMatches.length) % findMatches.length);
  }

  // Scroll current match into view
  useEffect(() => {
    if (!activeMatchId) return;
    msgRowRefs.current.get(activeMatchId)?.scrollIntoView({ block: 'center' });
  }, [activeMatchId, findIdx]);

  // Reset index on new query
  useEffect(() => {
    setFindIdx(0);
  }, [findQ]);

  // Ctrl/Cmd+F focuses drawer find when drawer open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!detailId) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailId]);

  function closeFind() {
    setFindOpen(false);
    setFindQuery('');
    setFindIdx(0);
    setServerIds(null);
    setFindHint(false);
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setDetailConv(null);
    setDetailMembers([]);
    setDetailMessages([]);
    setDetailHasMore(false);
    setDetailReports([]);
    setFindOpen(false);
    setFindQuery('');
    setFindIdx(0);
    setServerIds(null);
    setFindHint(false);
    setDetailLoading(true);
    try {
      const [detail, reports] = await Promise.all([
        apiClient.get(`/admin/conversations/${id}`),
        apiClient.get('/admin/reports', { params: { targetType: 'conversation', limit: 50 } }),
      ]);
      setDetailConv(detail.data.conversation);
      setDetailMembers(detail.data.members ?? []);
      setDetailMessages((detail.data.recentMessages ?? []).slice().reverse());
      setDetailHasMore(Boolean(detail.data.hasMore));
      const pending = (reports.data.data ?? []).filter(
        (r: RelatedReport) => String(r.targetId ?? '') === id && r.status === 'pending',
      );
      setDetailReports(pending);
      if (pending.length > 0) setPendingIds((prev) => new Set(prev).add(id));
    } catch {
      addToast('error', 'Không thể tải chi tiết hội thoại.');
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  // Auto-scroll to bottom ONLY on first open of a conversation.
  // loadOlder preserves scroll itself; no scroll on prepend.
  const openedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (detailLoading || !detailId) return;
    if (openedIdRef.current === detailId) return;
    openedIdRef.current = detailId;
    const box = msgScrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [detailId, detailLoading, detailMessages.length]);

  async function loadOlder() {
    if (!detailId || moreLoading || detailMessages.length === 0) return;
    const oldest = detailMessages[0].createdAt;
    if (!oldest) return;
    setMoreLoading(true);
    const box = msgScrollRef.current;
    const prevHeight = box?.scrollHeight ?? 0;
    try {
      const res = await apiClient.get(`/admin/conversations/${detailId}`, {
        params: { before: oldest, limit: MSG_PAGE },
      });
      const older: DetailMessage[] = (res.data.recentMessages ?? []).slice().reverse();
      setDetailMessages((prev) => [...older, ...prev]);
      setDetailHasMore(Boolean(res.data.hasMore));
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight;
      });
    } catch {
      addToast('error', 'Không tải thêm được tin nhắn.');
    } finally {
      setMoreLoading(false);
    }
  }

  async function executeSoftDelete() {
    if (!confirmMsg || msgBusy) return;
    setMsgBusy(true);
    try {
      await apiClient.post(`/admin/messages/${confirmMsg.id}/soft-delete`);
      setDetailMessages((prev) =>
        prev.map((m) => (m._id === confirmMsg.id ? { ...m, deleted: true } : m)),
      );
      addToast('success', 'Đã gỡ tin nhắn vi phạm.');
      setConfirmMsg(null);
    } catch {
      addToast('error', 'Gỡ tin nhắn thất bại. Vui lòng thử lại.');
    } finally {
      setMsgBusy(false);
    }
  }

  async function actOnReport(id: string, action: 'resolve' | 'dismiss') {
    setReportBusy(id);
    try {
      await apiClient.post(`/admin/reports/${id}/${action}`);
      setDetailReports((prev) => prev.filter((r) => r._id !== id));
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(detailId ?? '');
        return next;
      });
      addToast('success', action === 'resolve' ? 'Đã giải quyết báo cáo.' : 'Đã bỏ qua báo cáo.');
      setReloadToken((t) => t + 1);
    } catch {
      addToast('error', 'Thao tác báo cáo thất bại.');
    } finally {
      setReportBusy(null);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const nameOf = (userId: string) =>
    detailMembers.find((m) => String(m.userId) === String(userId))?.displayName || DELETED_NAME;

  return (
    <div className="conv-page">
      <header className="conv-head">
        <h1 className="conv-title">
          Danh sách các cuộc hội thoại <span className="conv-count">{loading && rows.length === 0 ? '…' : total.toLocaleString('vi-VN')}</span>
        </h1>
        <div className="conv-toolbar">
          <div className="conv-search-wrap">
            <Search size={16} strokeWidth={2} aria-hidden className="conv-search-icon" />
            <input
              ref={searchRef}
              className="input conv-search conv-search--with-icon"
              type="search"
              placeholder="Tìm theo tên…  ( / )"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Tìm kiếm hội thoại"
            />
          </div>
          <select
            className="select conv-sort"
            value={filter.sort}
            onChange={(e) => setFilterAndReset({ sort: e.target.value })}
            aria-label="Sắp xếp"
          >
            <option value="recent">Mới hoạt động</option>
            <option value="created">Mới tạo</option>
          </select>
          <div className="conv-filter">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setFilterOpen((o) => !o)}
              type="button"
              aria-expanded={filterOpen}
              aria-label="Lọc"
              title="Lọc"
            >
              <Funnel size={16} strokeWidth={2} aria-hidden />
            </button>
            {filterOpen && (
              <div className="surface-card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 10, padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)', minWidth: 180 }}>
                <label className="cell-meta" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input type="checkbox" checked={filter.type === 'direct'} onChange={(e) => setFilterAndReset({ type: e.target.checked ? 'direct' : '' })} />
                  Trực tiếp
                </label>
                <label className="cell-meta" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input type="checkbox" checked={filter.type === 'group'} onChange={(e) => setFilterAndReset({ type: e.target.checked ? 'group' : '' })} />
                  Nhóm
                </label>
                <label className="cell-meta" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input type="checkbox" checked={filter.media} onChange={(e) => setFilterAndReset({ media: e.target.checked })} />
                  Có media
                </label>
                <label className="cell-meta" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  Quy mô
                  <select
                    className="select"
                    value={filter.size}
                    onChange={(e) => setFilterAndReset({ size: e.target.value })}
                    aria-label="Lọc theo quy mô"
                  >
                    <option value="">Tất cả</option>
                    <option value="small">Nhỏ (&lt;10)</option>
                    <option value="medium">Vừa (10–99)</option>
                    <option value="large">Lớn (100+)</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="table-actions">
          <button
            className="filter-chip"
            onClick={() => setFilterAndReset({ pending: !filter.pending })}
            type="button"
            aria-pressed={filter.pending}
          >
            Chờ xử lý{filter.pending ? <X size={14} strokeWidth={2.5} aria-hidden className="filter-chip-x" /> : null}
          </button>
          <button
            className="filter-chip"
            onClick={() => setFilterAndReset({ recent: !filter.recent })}
            type="button"
            aria-pressed={filter.recent}
          >
            Mới hoạt động{filter.recent ? <X size={14} strokeWidth={2.5} aria-hidden className="filter-chip-x" /> : null}
          </button>
          {(debouncedSearch || filter.type || filter.size || filter.pending || filter.media || filter.recent) && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} type="button" aria-label="Xóa lọc" title="Xóa lọc">
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      </header>

      <section className="table-shell conv-shell" aria-label="Danh sách hội thoại">
        {error && <p className="alert" role="alert" style={{ margin: 'var(--space-4)' }}>{error}</p>}

        {loading && rows.length > 0 && (
          <div className="conv-reloading" role="status" aria-label="Đang tải">
            <span className="conv-spinner" aria-hidden="true" />
          </div>
        )}

        {loading && rows.length === 0 && !error ? (
          <div className="conv-skeleton" aria-label="Đang tải">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="conv-skel-row">
                <div className="skeleton-card conv-skel-avatar" />
                <div className="conv-skel-main">
                  <div className="skeleton-line conv-skel-l1" />
                  <div className="skeleton-line conv-skel-l2" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 && !error ? (
          <div className="empty-state">
            <div>
              <div className="state-icon" aria-hidden="true"><Inbox size={24} strokeWidth={2} /></div>
              <div className="state-title">Không tìm thấy hội thoại</div>
              <p className="state-copy">Thử đổi từ khóa hoặc xóa bộ lọc.</p>
            </div>
          </div>
        ) : (
          <div className={`table-scroll${loading ? ' conv-stale' : ''}`}>
            <table className="data-table conv-table" aria-label="Danh sách hội thoại">
              <thead>
                <tr>
                  <th scope="col">Hội thoại</th>
                  <th scope="col">TV</th>
                  <th scope="col">Hoạt động cuối</th>
                  <th scope="col">Báo cáo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c._id}
                    className="conv-row"
                    onClick={() => openDetail(c._id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openDetail(c._id);
                    }}
                    tabIndex={0}
                  >
                    <td>
                      <div className="cell-primary">
                        <div className="cell-avatar" aria-hidden="true">
                          {initials(convName(c), 'H')}
                          <span
                            className={`conv-type-dot${c.type === 'group' ? ' conv-type-group' : ''}`}
                            title={typeLabel(c.type)}
                            aria-label={typeLabel(c.type)}
                          >
                            {c.type === 'group' ? (
                              <Users size={10} strokeWidth={2.5} aria-hidden />
                            ) : (
                              <User size={10} strokeWidth={2.5} aria-hidden />
                            )}
                          </span>
                        </div>
                        <div className="conv-cell-main">
                          <span className="cell-title">{convName(c)}</span>
                          <div className="cell-meta conv-preview">
                            {c.lastMessagePreview ? c.lastMessagePreview.slice(0, 80) : '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><span className="cell-title">{c.members?.length ?? 0}</span></td>
                    <td><div className="cell-meta" title={formatTime(c.lastMessageAt)}>{formatRelative(c.lastMessageAt)}</div></td>
                    <td>
                      {(c.pendingReportCount ?? 0) > 0 || pendingIds.has(c._id) ? (
                        <StatusBadge tone="warning" label="Chờ xử lý" />
                      ) : (
                        <span className="cell-meta">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-footer">
          <span className="cell-meta">
            Trang {page} / {Math.max(totalPages, 1)} · {total.toLocaleString('vi-VN')} hội thoại
          </span>
          <div className="pagination-controls">
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setRequestedPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Trước
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setRequestedPage((p) => p + 1)}
              type="button"
            >
              Sau
            </button>
          </div>
        </div>
      </section>

      <Dialog open={detailId !== null} onClose={closeDetailAndClearFocus} labelId="conv-detail-title" variant="drawer">
        {detailId && (
          <aside className="drawer conv-drawer">
            <div className="drawer-header conv-drawer-head">
              <div className="cell-primary">
                <div className="cell-avatar" aria-hidden="true">
                  {initials(convName(detailConv), 'H')}
                </div>
                <div>
                  <h2 id="conv-detail-title" className="conv-drawer-title">{convName(detailConv)}</h2>
                  <p className="cell-meta">
                    {detailConv ? typeLabel(detailConv.type) : ''} · {detailMembers.length} thành viên · Esc để đóng
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!findOpen && !detailLoading && (
                  <button className="btn btn-ghost btn-sm conv-icon-btn" onClick={() => { setFindOpen(true); requestAnimationFrame(() => findInputRef.current?.focus()); }} type="button" aria-label="Tìm trong hội thoại" title="Tìm trong hội thoại"><Search size={16} strokeWidth={2} aria-hidden /></button>
                )}
                <button className="btn btn-ghost btn-sm conv-icon-btn" onClick={closeDetailAndClearFocus} type="button" aria-label="Đóng" title="Đóng"><X size={16} strokeWidth={2} aria-hidden /></button>
              </div>
            </div>
            {detailId && !detailLoading && (
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
            )}
            {(findHint || detailHasMore) && findOpen && findQ ? (
              <p className="cell-meta conv-find-hint">Tải thêm để tìm tiếp</p>
            ) : null}
            <div className="drawer-body conv-drawer-body">
              {detailLoading ? (
                <div className="conv-skeleton" aria-label="Đang tải chi tiết">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton-line conv-skel-msg" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="conv-members" aria-label="Thành viên">
                    {detailMembers.map((m) => (
                      <span key={String(m.userId)} className="conv-member-chip" title={m.displayName ?? DELETED_NAME}>
                        <span className="conv-member-avatar" aria-hidden="true">
                          {initials(m.displayName ?? '?', '?')}
                        </span>
                        {m.displayName ?? DELETED_NAME}
                        {m.role === 'admin' ? <span className="badge badge-primary">QT</span> : null}
                      </span>
                    ))}
                  </div>

                  <div className="conv-chat" ref={msgScrollRef} aria-label="Tin nhắn" role="log">
                    <div className="conv-more-wrap">
                    {detailHasMore && (
                      <button
                        className="btn btn-secondary btn-sm conv-more"
                        onClick={loadOlder}
                        disabled={moreLoading}
                        type="button"
                      >
                        {moreLoading ? 'Đang tải…' : <><ChevronUp size={16} strokeWidth={2} aria-hidden /> Tải thêm tin nhắn</>}
                      </button>
                    )}
                    </div>
                    {detailMessages.map((m, i) => {
                      const prev = detailMessages[i - 1];
                      const next = detailMessages[i + 1];
                      const sameSender = prev && String(prev.senderId) === String(m.senderId);
                      const t = msgTimeMs(m);
                      const pt = prev ? msgTimeMs(prev) : null;
                      const grouped = Boolean(sameSender && t != null && pt != null && t - pt < GROUP_GAP_MS);
                      const nextSame = next && String(next.senderId) === String(m.senderId);
                      const nt = next ? msgTimeMs(next) : null;
                      const showTime = !(nextSame && t != null && nt != null && nt - t < GROUP_GAP_MS);
                      const isActiveMatch = activeMatchId === m._id;
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
                            </div>
                          )}
                          <div className="conv-msg-line">
                            <span className="conv-msg-gutter" aria-hidden="true" />
                            <div className="conv-bubble">
                              <MessageBody
                                m={m}
                                find={findQ}
                                onRetry={detailId ? () => void openDetail(detailId) : undefined}
                              />
                              {showTime && (
                                <div className="conv-bubble-foot">
                                  <span>{formatClock(m.createdAt) || formatTime(m.createdAt)}</span>
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
                    {detailMessages.length === 0 && (
                      <p className="cell-meta">Chưa có tin nhắn nào.</p>
                    )}
                  </div>

                  {detailReports.length > 0 && (
                    <section aria-label="Báo cáo chờ xử lý" className="conv-reports">
                      <h3 className="panel-title">Báo cáo chờ xử lý ({detailReports.length})</h3>
                      {detailReports.map((r) => (
                        <div key={r._id} className="surface-card conv-report">
                          <p className="cell-title">{r.reason}</p>
                          <div className="cell-meta">{formatTime(r.createdAt)}</div>
                          <div className="table-actions conv-report-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => actOnReport(r._id, 'resolve')}
                              type="button"
                              disabled={reportBusy === r._id}
                            >
                              {reportBusy === r._id ? 'Đang xử lý…' : <><Check size={16} strokeWidth={2} aria-hidden /> Giải quyết</>}
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => actOnReport(r._id, 'dismiss')}
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

                  <section aria-label="Vùng nguy hiểm" className="conv-reports">
                    <h3 className="panel-title">Vùng nguy hiểm</h3>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      disabled
                      title="Sắp có — xóa hội thoại chưa được hỗ trợ"
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden /> Xóa hội thoại
                    </button>
                  </section>
                </>
              )}
            </div>
          </aside>
        )}
      </Dialog>

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
        onConfirm={executeSoftDelete}
        busy={msgBusy}
        variant="danger"
      />
    </div>
  );
}
