import './ConversationsPage.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, Search, User, Users, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { StatusTabs } from '../components/StatusTabs';
import { TableShell } from '../components/TableShell';
import { ColumnHeader } from '../components/ColumnHeader';
import { FilterPopover } from '../components/FilterPopover';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import Dialog from '../components/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportButton } from '../components/ExportButton';
import { ExportDateRange } from '../components/ExportDateRange';
import { useToast } from '../components/Toast';
import {
  ageLabel,
  ageTone,
  apiErrorMessage,
  formatDateTime,
  initials,
} from '../components/formatters';
import { dayLabel, dayToIso } from '../components/date-range';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';

/** List row theo hợp đồng backend 1.4+: memberCount/hasMedia, KHÔNG có members. */
interface Conversation {
  _id: string;
  name?: string | null;
  displayName?: string | null;
  type: string;
  memberCount?: number;
  pendingReportCount?: number;
  oldestPendingReportAt?: string;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  createdAt?: string;
  hasMedia?: boolean;
}

interface ConversationStats {
  all: number;
  pendingReport: number;
  group: number;
  direct: number;
  hasMedia: number;
  active24h: number;
}

const PAGE_SIZES = [10, 20, 50];

const TAB_KEYS = ['all', 'pendingReport', 'group', 'direct', 'hasMedia', 'active24h'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const SORT_VALUES = ['recent', 'created', 'reported', 'members', 'reportAge'] as const;

/** Sort allow-list của backend — URL giữ dạng thô, không `field:dir` (server chỉ desc,
    riêng `reportAge` là asc: báo cáo chờ cũ nhất trước). */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'recent', label: 'Mới hoạt động' },
  { value: 'created', label: 'Mới tạo' },
  { value: 'reported', label: 'Nhiều báo cáo' },
  { value: 'reportAge', label: 'Báo cáo cũ nhất' },
  { value: 'members', label: 'Nhiều thành viên' },
];

const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Mọi quy mô' },
  { value: 'small', label: 'Nhỏ (<10)' },
  { value: 'medium', label: 'Vừa (10–99)' },
  { value: 'large', label: 'Lớn (100+)' },
];

const SINCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Mọi thời điểm' },
  { value: '24h', label: '24 giờ qua' },
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
];

const MIN_REPORT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Mọi mức' },
  { value: '1', label: 'Từ 1 báo cáo' },
  { value: '3', label: 'Từ 3 báo cáo' },
  { value: '5', label: 'Từ 5 báo cáo' },
  { value: '10', label: 'Từ 10 báo cáo' },
];

const SINCE_HOURS: Record<string, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

const FILTER_DEFAULTS = {
  tab: 'all',
  q: '',
  sort: 'recent',
  type: '',
  size: '',
  minReports: '',
  media: '',
  since: '',
  // `from`/`to` là chuỗi ngày `YYYY-MM-DD` của `type="date"` — input bind thẳng,
  // chip hiện dayLabel; ISO (biên đầu 00:00 / biên cuối 23:59:59.999) chỉ sinh
  // lúc request qua dayToIso, không lưu trong URL. `afrom`/`ato` cùng quy ước
  // cho khoảng Hoạt động (lastMessageAt) — map sang activeFrom/activeTo.
  from: '',
  to: '',
  afrom: '',
  ato: '',
  page: '1',
  pageSize: '20',
  // Chỉ là đích redirect (D6) — KHÔNG BAO GIỜ gửi lên API (forbidNonWhitelisted → 400).
  focus: '',
};

/** `activeAfter` ISO cho một bucket "hoạt động trong N giờ"; '' = bỏ lọc. */
function activeAfterOf(since: string): string | undefined {
  const hours = SINCE_HOURS[since];
  if (!hours) return undefined;
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function typeLabel(type: string) {
  return type === 'group' ? 'Nhóm' : type === 'direct' ? 'Trực tiếp' : type;
}

function convName(c: Pick<Conversation, 'displayName' | 'name'> | null | undefined) {
  return c?.displayName || c?.name || '(Không tên)';
}

/**
 * Trang Hội thoại — archetype list §3A, chi tiết là route `/conversations/:id`.
 *
 * Trước đây: useState filter + fetch tay, tab không có count, chi tiết là drawer
 * (trái §3B) và `?focus=` mở drawer. Nay mọi trạng thái nằm trong URL
 * (`useUrlFilters`), fetch qua `useAdminList`, count tab lấy từ
 * `/admin/conversations/stats`, `?focus=` redirect `replace` sang route chi tiết.
 */
export default function ConversationsPage() {
  const { addToast } = useToast();
  const { values, set, reset } = useUrlFilters(FILTER_DEFAULTS);
  const navigate = useNavigate();
  const location = useLocation();

  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const tab = (TAB_KEYS as readonly string[]).includes(values.tab) ? (values.tab as TabKey) : 'all';
  const sort = (SORT_VALUES as readonly string[]).includes(values.sort) ? values.sort : 'recent';
  const isTypeTab = tab === 'group' || tab === 'direct';

  const sizeFilter = useMemo(() => {
    if (values.size === 'small') return { maxMembers: 9 };
    if (values.size === 'medium') return { minMembers: 10, maxMembers: 99 };
    if (values.size === 'large') return { minMembers: 100 };
    return {};
  }, [values.size]);

  // Filter nền = mọi điều kiện KHÔNG do tab đảm nhiệm.
  const baseParams = useMemo(
    () => ({
      search: values.q.trim() || undefined,
      minReports: values.minReports ? Number(values.minReports) : undefined,
      ...(values.from ? { createdFrom: dayToIso(values.from, 'from') } : {}),
      ...(values.to ? { createdTo: dayToIso(values.to, 'to') } : {}),
      ...(values.afrom ? { activeFrom: dayToIso(values.afrom, 'from') } : {}),
      ...(values.ato ? { activeTo: dayToIso(values.ato, 'to') } : {}),
      ...sizeFilter,
    }),
    [values.q, values.minReports, values.from, values.to, values.afrom, values.ato, sizeFilter],
  );

  // Stats: tab cùng trục phải được strip, nếu không sáu count sẽ bị giới hạn
  // bởi chính tiêu chí chúng đang đếm (vd. tab=group mà vẫn gửi type=group
  // thì count direct = 0 thay vì tổng thật).
  const statsParams = useMemo(
    () => ({
      ...baseParams,
      type: isTypeTab ? undefined : values.type || undefined,
      hasMedia: tab === 'hasMedia' ? undefined : values.media || undefined,
      activeAfter: activeAfterOf(tab === 'active24h' ? '' : values.since),
    }),
    [baseParams, isTypeTab, tab, values.type, values.media, values.since],
  );

  // Filter cho list + export: tab đã dịch sang param, KHÔNG có phân trang —
// export cap 500 ở server nên không bao giờ được gửi page/limit theo.
  const filterParams = useMemo(
    () => ({
      ...baseParams,
      type: isTypeTab ? tab : values.type || undefined,
      hasPendingReport: tab === 'pendingReport' ? 'true' : undefined,
      hasMedia: tab === 'hasMedia' ? 'true' : values.media || undefined,
      activeAfter: activeAfterOf(tab === 'active24h' ? '24h' : values.since),
    }),
    [baseParams, isTypeTab, tab, values.type, values.media, values.since],
  );

  const listParams = useMemo(
    () => ({ ...filterParams, page, limit: pageSize, sort }),
    [filterParams, page, pageSize, sort],
  );

  // Query key chứa MỌI giá trị filter (DESIGN §8) — thiếu filter trong key là
  // không refetch. `focus` không gửi lên API nhưng vẫn giữ để key khớp URL.
  const { rows, total, isLoading, isError, error, refetch } = useAdminList<Conversation>(
    [
      'conversations',
      tab,
      values.q,
      values.sort,
      values.type,
      values.size,
      values.minReports,
      values.media,
      values.since,
      values.from,
      values.to,
      values.afrom,
      values.ato,
      page,
      pageSize,
      values.focus,
    ],
    '/admin/conversations',
    listParams,
  );

  const { data: stats } = useQuery({
    queryKey: [
      'conversations-stats',
      tab,
      values.q,
      values.type,
      values.size,
      values.minReports,
      values.media,
      values.since,
      values.from,
      values.to,
      values.afrom,
      values.ato,
    ],
    queryFn: async () =>
      (await apiClient.get<ConversationStats>('/admin/conversations/stats', { params: statsParams }))
        .data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Deep-link từ trang báo cáo: `?focus=<id>` → redirect `replace` sang route
  // chi tiết. Một lần navigate duy nhất (KHÔNG kèm set({focus:''})) — double
  // navigate sẽ đua nhau nuốt history. `state.from` = list URL bỏ focus.
  useEffect(() => {
    if (!values.focus) return;
    const next = new URLSearchParams(location.search);
    next.delete('focus');
    const qs = next.toString();
    navigate(`/conversations/${values.focus}`, {
      replace: true,
      state: { from: `${location.pathname}${qs ? `?${qs}` : ''}` },
    });
  }, [values.focus, location.pathname, location.search, navigate]);

  // Ô tìm kiếm: debounce 400ms + Enter chốt ngay (D7).
  const [searchInput, setSearchInput] = useState(values.q);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => setSearchInput(values.q), [values.q]);
  useEffect(() => {
    if (searchInput.trim() === values.q) return;
    const t = setTimeout(() => set({ q: searchInput.trim(), page: '1' }), 400);
    return () => clearTimeout(t);
    // Chỉ theo input người dùng gõ; values.q đã có effect riêng ở trên.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Deep-link trang vượt tổng số trang (vd. `?page=99`): kẹp về trang cuối
  // thay vì hiện empty-state "không khớp" sai.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (!isLoading && total > 0 && page > totalPages) set({ page: String(totalPages) });
  }, [isLoading, total, page, totalPages, set]);

  /** Filter trong popover cùng trục với tab → gỡ tab đi, để một nguồn sự thật. */
  function setFilter(patch: Partial<typeof FILTER_DEFAULTS>) {
    const next: Partial<typeof FILTER_DEFAULTS> = { ...patch, page: '1' };
    if ('type' in patch && isTypeTab) next.tab = 'all';
    if ('media' in patch && tab === 'hasMedia') next.tab = 'all';
    if ('since' in patch && tab === 'active24h') next.tab = 'all';
    set(next);
  }

  /** Đổi tab: xoá filter của cùng trục để tab và popover không cùng giữ một điều kiện. */
  function switchTab(nextTab: string) {
    const patch: Partial<typeof FILTER_DEFAULTS> = { tab: nextTab, page: '1' };
    if (nextTab === 'group' || nextTab === 'direct') patch.type = '';
    if (nextTab === 'hasMedia') patch.media = '';
    if (nextTab === 'active24h') patch.since = '';
    set(patch);
  }

  function openDetail(id: string) {
    navigate(`/conversations/${id}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  }

  // Sort allow-list: click cột đang active quay về mặc định (recent).
  // URL luôn giữ giá trị thô; ColumnHeader nhận `field:dir` — `reportAge` là
  // asc (cũ nhất trước), ba sort còn lại backend luôn desc.
  function toggleSort(field: string) {
    set({ sort: sort === field && field !== 'recent' ? 'recent' : field, page: '1' });
  }
  const sortDisplay = `${sort}:${sort === 'reportAge' ? 'asc' : 'desc'}`;

  // Bàn phím (D8, mẫu BusinessesPage): j/k di chuyển, Enter mở, ? trợ giúp.
  const [highlight, setHighlight] = useState(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    setHighlight((h) => (rows.length === 0 ? -1 : Math.min(h, rows.length - 1)));
  }, [rows.length]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (helpOpen) return;
      if (e.key === 'j' || e.key === 'J') {
        setHighlight((h) => Math.min(h + 1, rows.length - 1));
      } else if (e.key === 'k' || e.key === 'K') {
        setHighlight((h) => Math.max(h - 1, -1));
      } else if (e.key === 'Enter') {
        // Dòng/nút đang focus tự xử lý Enter — tránh mở chi tiết lần hai.
        if (typeof t.closest === 'function' && t.closest('button, a, tr[tabindex="0"]')) return;
        const c = rows[highlight];
        if (c) openDetail(c._id);
      } else if (e.key === '?') {
        setHelpOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, highlight, helpOpen]);

  // "/" tập trung ô tìm kiếm.
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

  // ── Export CSV (5.1) — cùng filter với list, khoảng ngày riêng cho file ──
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportRange, setExportRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  /**
   * Mở dialog export với khoảng ngày mặc định = bộ lọc ngày của bảng
   * (`createdFrom/To` là bắt buộc theo spec — export phải cùng filter với list),
   * để phần tóm tắt trong dialog nói đúng phạm vi file và người dùng đổi được.
   */
  function openExport() {
    setExportRange({
      from: values.from ? dayToIso(values.from, 'from') : '',
      to: values.to ? dayToIso(values.to, 'to') : '',
    });
    setExportOpen(true);
  }

  function toCsvCell(v: unknown) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function handleExport() {
    setExporting(true);
    try {
      // Export tự cap 500 ở server — filterParams không có phân trang,
      // chỉ cần cộng sort cho output ổn định.
      const res = await apiClient.get<{
        data: Conversation[];
        total: number;
        truncated: boolean;
      }>('/admin/conversations/export', {
        params: {
          ...filterParams,
          sort,
          ...(exportRange.from ? { createdFrom: exportRange.from } : {}),
          ...(exportRange.to ? { createdTo: exportRange.to } : {}),
        },
      });
      if (res.data.truncated) {
        addToast('warning', `Xuất 500/${res.data.total} dòng đầu tiên. Thu hẹp bộ lọc để xuất hết.`);
      }
      const header = [
        'ID',
        'Tên hội thoại',
        'Loại',
        'Thành viên',
        'Tin nhắn xem trước',
        'Báo cáo chờ',
        'Tuổi báo cáo cũ nhất',
        'Có media',
        'Hoạt động cuối',
        'Tạo lúc',
      ];
      const lines = res.data.data.map((c) =>
        [
          c._id,
          convName(c),
          typeLabel(c.type),
          c.memberCount ?? 0,
          c.lastMessagePreview ?? '',
          c.pendingReportCount ?? 0,
          c.oldestPendingReportAt ? ageLabel(c.oldestPendingReportAt) : '',
          c.hasMedia ? 'Có' : '',
          c.lastMessageAt ?? '',
          c.createdAt ?? '',
        ]
          .map(toCsvCell)
          .join(','),
      );
      // BOM để Excel đọc đúng tiếng Việt.
      const blob = new Blob([`\uFEFF${[header.join(','), ...lines].join('\n')}`], {
        type: 'text/csv;charset=utf-8',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `hoi-thoai-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast('success', `Đã xuất ${lines.length} dòng CSV.`);
      setExportOpen(false);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Xuất CSV thất bại. Vui lòng thử lại.'));
    } finally {
      setExporting(false);
    }
  }

  const advancedCount =
    (values.type ? 1 : 0) +
    (values.size ? 1 : 0) +
    (values.media === 'true' ? 1 : 0) +
    (values.minReports ? 1 : 0) +
    (values.since ? 1 : 0) +
    (values.from || values.to ? 1 : 0) +
    (values.afrom || values.ato ? 1 : 0);
  // Tab không phải "bộ lọc đang bật" — nó đã hiện active trên thanh tab.
  const hasFilter = Boolean(values.q || advancedCount);
  const loadError = apiErrorMessage(error, 'Không tải được danh sách hội thoại.');

  function emptyCopy(): { title: string; copy: string } {
    if (hasFilter)
      return {
        title: 'Không khớp hội thoại nào',
        copy: 'Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm.',
      };
    switch (tab) {
      case 'pendingReport':
        return {
          title: 'Hàng đợi trống',
          copy: 'Không còn hội thoại nào chờ báo cáo — chuyển sang tab khác để kiểm tra.',
        };
      case 'group':
        return { title: 'Chưa có hội thoại nhóm nào', copy: 'Hội thoại nhóm sẽ xuất hiện ở đây.' };
      case 'direct':
        return {
          title: 'Chưa có hội thoại trực tiếp nào',
          copy: 'Hội thoại 1-1 sẽ xuất hiện ở đây.',
        };
      case 'hasMedia':
        return {
          title: 'Không có hội thoại nào chứa media',
          copy: 'Ảnh, voice, video hoặc tệp đính kèm sẽ nằm ở đây.',
        };
      case 'active24h':
        return {
          title: 'Không có hoạt động trong 24 giờ qua',
          copy: 'Chưa có tin nhắn mới trong ngày hôm nay.',
        };
      default:
        return {
          title: 'Chưa có hội thoại nào',
          copy: 'Hội thoại sẽ xuất hiện khi người dùng bắt đầu trò chuyện.',
        };
    }
  }

  return (
    <div className="page-stack">
      <ListHeader
        title="Hội thoại"
        count={total}
        actions={(
          <>
            <ExportButton onExport={openExport} />
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
              Làm mới
            </button>
          </>
        )}
      >
        <div className="filter-search-wrap">
          <Search size={15} className="filter-search-icon" aria-hidden />
          <input
            ref={searchRef}
            className="input filter-search filter-search--icon"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') set({ q: searchInput.trim(), page: '1' });
            }}
            placeholder="Tên hội thoại hoặc thành viên ( / )"
            aria-label="Tìm hội thoại theo tên hoặc tên thành viên"
          />
        </div>

        <FilterPopover
          activeCount={advancedCount}
          onClear={() =>
            setFilter({
              type: '',
              size: '',
              media: '',
              minReports: '',
              since: '',
              from: '',
              to: '',
              afrom: '',
              ato: '',
            })
          }
        >
          <label className="form-field">
            <span className="form-label">Loại hội thoại</span>
            <select
              className="select"
              value={values.type}
              onChange={(e) => setFilter({ type: e.target.value })}
            >
              <option value="">Mọi loại</option>
              <option value="group">Nhóm</option>
              <option value="direct">Trực tiếp</option>
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Quy mô</span>
            <select
              className="select"
              value={values.size}
              onChange={(e) => setFilter({ size: e.target.value })}
            >
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Hoạt động trong</span>
            <select
              className="select"
              value={values.since}
              onChange={(e) => setFilter({ since: e.target.value })}
            >
              {SINCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Báo cáo chờ tối thiểu</span>
            <select
              className="select"
              value={values.minReports}
              onChange={(e) => setFilter({ minReports: e.target.value })}
            >
              {MIN_REPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cell-meta filter-checkbox">
            <input
              type="checkbox"
              checked={values.media === 'true'}
              onChange={(e) => setFilter({ media: e.target.checked ? 'true' : '' })}
            />
            Có media (ảnh, voice, video, tệp)
          </label>
          <div className="form-field">
            <span className="form-label">Ngày tạo</span>
            <div className="export-date-row">
              <input
                className="input input-sm"
                type="date"
                value={values.from}
                max={values.to || undefined}
                onChange={(e) => setFilter({ from: e.target.value })}
                aria-label="Từ ngày tạo"
              />
              <span className="cell-meta" aria-hidden>
                →
              </span>
              <input
                className="input input-sm"
                type="date"
                value={values.to}
                min={values.from || undefined}
                onChange={(e) => setFilter({ to: e.target.value })}
                aria-label="Đến ngày tạo"
              />
            </div>
          </div>
          <div className="form-field">
            <span className="form-label">Hoạt động (tin nhắn cuối)</span>
            <div className="export-date-row">
              <input
                className="input input-sm"
                type="date"
                value={values.afrom}
                max={values.ato || undefined}
                onChange={(e) => setFilter({ afrom: e.target.value })}
                aria-label="Từ ngày hoạt động"
              />
              <span className="cell-meta" aria-hidden>
                →
              </span>
              <input
                className="input input-sm"
                type="date"
                value={values.ato}
                min={values.afrom || undefined}
                onChange={(e) => setFilter({ ato: e.target.value })}
                aria-label="Đến ngày hoạt động"
              />
            </div>
          </div>
          <label className="form-field">
            <span className="form-label">Sắp xếp</span>
            <select
              className="select"
              value={sort}
              onChange={(e) => set({ sort: e.target.value, page: '1' })}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </FilterPopover>
      </ListHeader>

      <div className="filter-bar">
        <StatusTabs
          tabs={[
            { key: 'all', label: 'Tất cả', count: stats?.all },
            { key: 'pendingReport', label: 'Chờ báo cáo', count: stats?.pendingReport },
            { key: 'group', label: 'Nhóm', count: stats?.group },
            { key: 'direct', label: 'Trực tiếp', count: stats?.direct },
            { key: 'hasMedia', label: 'Có media', count: stats?.hasMedia },
            { key: 'active24h', label: '24 giờ qua', count: stats?.active24h },
          ]}
          active={tab}
          onChange={switchTab}
        />
        <span className="cell-meta">Nhấn dòng để xem chi tiết · phím ? để xem phím tắt</span>
      </div>

      {hasFilter && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {values.q && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => set({ q: '', page: '1' })}
            >
              Từ khoá: {values.q} <X size={12} aria-hidden />
            </button>
          )}
          {values.type && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => setFilter({ type: '' })}
            >
              Loại: {typeLabel(values.type)} <X size={12} aria-hidden />
            </button>
          )}
          {values.size && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => setFilter({ size: '' })}
            >
              Quy mô: {SIZE_OPTIONS.find((s) => s.value === values.size)?.label}{' '}
              <X size={12} aria-hidden />
            </button>
          )}
          {values.media === 'true' && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => setFilter({ media: '' })}
            >
              Có media <X size={12} aria-hidden />
            </button>
          )}
          {values.minReports && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => setFilter({ minReports: '' })}
            >
              Báo cáo ≥ {values.minReports} <X size={12} aria-hidden />
            </button>
          )}
          {values.since && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => setFilter({ since: '' })}
            >
              Hoạt động: {SINCE_OPTIONS.find((s) => s.value === values.since)?.label}{' '}
              <X size={12} aria-hidden />
            </button>
          )}
          {(values.from || values.to) && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => setFilter({ from: '', to: '' })}
            >
              Ngày tạo: {values.from ? dayLabel(values.from) : '…'} → {values.to ? dayLabel(values.to) : '…'}{' '}
              <X size={12} aria-hidden />
            </button>
          )}
          {(values.afrom || values.ato) && (
            <button
              className="filter-chip filter-chip-removable"
              type="button"
              onClick={() => setFilter({ afrom: '', ato: '' })}
            >
              Hoạt động: {values.afrom ? dayLabel(values.afrom) : '…'} → {values.ato ? dayLabel(values.ato) : '…'}{' '}
              <X size={12} aria-hidden />
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              setSearchInput('');
              reset();
            }}
          >
            Xoá bộ lọc
          </button>
        </div>
      )}

      <TableShell>
        {isError && (
          <StateBlock variant="error" title="Không tải được danh sách hội thoại" copy={loadError}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
              Thử lại
            </button>
          </StateBlock>
        )}

        {isLoading && (
          <div className="conv-skeleton" aria-label="Đang tải danh sách hội thoại">
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
        )}

        {!isLoading && !isError && (
          <div className="table-scroll">
            <table className="data-table data-table--compact" aria-label="Danh sách hội thoại">
              <thead>
                <tr>
                  <ColumnHeader label="Hội thoại" />
                  <ColumnHeader
                    label="Thành viên"
                    className="col-num"
                    sortField="members"
                    sort={sortDisplay}
                    onSort={toggleSort}
                  />
                  <ColumnHeader
                    label="Hoạt động cuối"
                    sortField="recent"
                    sort={sortDisplay}
                    onSort={toggleSort}
                  />
                  <ColumnHeader
                    label="Tạo lúc"
                    className="col-hide-mobile"
                    sortField="created"
                    sort={sortDisplay}
                    onSort={toggleSort}
                  />
                  <ColumnHeader
                    label="Báo cáo"
                    sortField="reported"
                    sort={sortDisplay}
                    onSort={toggleSort}
                  />
                  {/* Tuổi báo cáo (SLA): sort reportAge asc; ẩn ≤1099px, có dòng
                    .show-under-1100 ở ô đầu */}
                  <ColumnHeader
                    label="Tuổi"
                    className="col-hide-xs"
                    sortField="reportAge"
                    sort={sortDisplay}
                    onSort={toggleSort}
                  />
                  <ColumnHeader label="Media" className="col-hide-mobile" />
                  <th scope="col" className="th-center col-sticky">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        title={emptyCopy().title}
                        copy={emptyCopy().copy}
                        action={
                          hasFilter ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              type="button"
                              onClick={() => {
                                setSearchInput('');
                                reset();
                              }}
                            >
                              Xoá bộ lọc
                            </button>
                          ) : undefined
                        }
                      />
                    </td>
                  </tr>
                )}
                {rows.map((c, i) => (
                  <tr
                    key={c._id}
                    className={`${i === highlight ? 'row-highlight' : ''} conv-row`.trim()}
                    tabIndex={0}
                    aria-label={`Xem chi tiết ${convName(c)}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button,input')) return;
                      openDetail(c._id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      if ((e.target as HTMLElement).closest('a,button,input,textarea,select')) return;
                      e.preventDefault();
                      openDetail(c._id);
                    }}
                  >
                    <td>
                      <div className="cell-primary">
                        <div className="cell-avatar conv-avatar" aria-hidden="true">
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
                          {/* Dữ liệu của cột Tuổi khi ẩn ở ≤1099px (DESIGN §6) */}
                          {(c.pendingReportCount ?? 0) > 0 && c.oldestPendingReportAt && (
                            <div className="cell-meta show-under-1100">
                              Chờ báo cáo {ageLabel(c.oldestPendingReportAt)}
                            </div>
                          )}
                          {/* Dữ liệu của cột Tạo lúc + Media khi ẩn ở ≤860px */}
                          <div className="cell-meta show-under-860">
                            {typeLabel(c.type)} · Tạo {formatDateTime(c.createdAt)}
                            {c.hasMedia ? ' · Có media' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="col-num">
                      <span className="cell-title">{c.memberCount ?? 0}</span>
                    </td>
                    <td>
                      <span className="cell-date" title={formatDateTime(c.lastMessageAt)}>
                        {formatDateTime(c.lastMessageAt)}
                      </span>
                    </td>
                    <td className="col-hide-mobile">
                      <span className="cell-date">{formatDateTime(c.createdAt)}</span>
                    </td>
                    <td>
                      {(c.pendingReportCount ?? 0) > 0 ? (
                        <StatusBadge tone="warning" label={`${c.pendingReportCount} báo cáo`} />
                      ) : (
                        <span className="cell-meta">—</span>
                      )}
                    </td>
                    <td className="col-hide-xs">
                      {(c.pendingReportCount ?? 0) > 0 && c.oldestPendingReportAt ? (
                        <StatusBadge tone={ageTone(c.oldestPendingReportAt)} label={ageLabel(c.oldestPendingReportAt)} />
                      ) : (
                        <span className="cell-meta">—</span>
                      )}
                    </td>
                    <td className="col-hide-mobile">
                      {c.hasMedia ? (
                        <span className="badge badge-muted">Có media</span>
                      ) : (
                        <span className="cell-meta">—</span>
                      )}
                    </td>
                    <td className="col-sticky">
                      <div className="table-actions table-actions--end">
                        <button
                          className="btn btn-ghost btn-icon"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(c._id);
                          }}
                          aria-label={`Xem ${convName(c)}`}
                          title="Chi tiết"
                        >
                          <Eye size={16} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          unit="hội thoại"
          onPageChange={(p) => set({ page: String(p) })}
          showGoto
          pageSize={pageSize}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        labelId="conv-shortcuts-title"
        variant="dialog"
      >
        <div className="dialog">
          <div className="dialog-header">
            <h2 id="conv-shortcuts-title" className="panel-title">
              Phím tắt
            </h2>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setHelpOpen(false)}>
              Đóng
            </button>
          </div>
          <div className="dialog-body">
            <dl className="description-list">
              <div>
                <dt>
                  <kbd>J</kbd> / <kbd>K</kbd>
                </dt>
                <dd>Di chuyển dòng</dd>
              </div>
              <div>
                <dt>
                  <kbd>Enter</kbd>
                </dt>
                <dd>Mở chi tiết hội thoại</dd>
              </div>
              <div>
                <dt>
                  <kbd>/</kbd>
                </dt>
                <dd>Tìm hội thoại</dd>
              </div>
              <div>
                <dt>
                  <kbd>?</kbd>
                </dt>
                <dd>Mở bảng này</dd>
              </div>
            </dl>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={exportOpen}
        onClose={() => {
          setExportOpen(false);
          setExportRange({ from: '', to: '' });
        }}
        title={`Xuất ${total.toLocaleString('vi-VN')} hội thoại ra CSV?`}
        description="File chứa tên hội thoại và tin nhắn xem trước — đây là nội dung do người dùng tạo, không che. Tối đa 500 dòng theo bộ lọc hiện tại; khoảng ngày dưới đây là phạm vi của file (mặc định lấy từ bộ lọc bảng). Chỉ lưu ở máy được phép xử lý dữ liệu."
        preview={
          <ExportDateRange
            from={exportRange.from}
            to={exportRange.to}
            onChange={(patch) => setExportRange((prev) => ({ ...prev, ...patch }))}
          />
        }
        confirmLabel={exporting ? 'Đang xuất...' : 'Xuất CSV'}
        variant="primary"
        busy={exporting}
        onConfirm={handleExport}
      />
    </div>
  );
}
