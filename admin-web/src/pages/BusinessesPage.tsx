import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Plus, Trash2, X, RotateCcw, PauseCircle } from 'lucide-react';
import apiClient from '../apiClient';
import { StatusTabs } from '../components/StatusTabs';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { ColumnHeader } from '../components/ColumnHeader';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { VerificationBadge, StatusBadge } from '../components/StatusBadge';
import { MaskedPII } from '../components/MaskedPII';
import { ExportButton } from '../components/ExportButton';
import { formatDateTime, ageLabel, ageTone, apiErrorMessage } from '../components/formatters';
import { categoryVi, relationshipVi, RELATIONSHIP_VI, PROVINCES, CATEGORY_OPTIONS } from '../components/vn-data';
import Dialog from '../components/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BulkBar } from '../components/BulkBar';
import { useToast } from '../components/Toast';
import { BusinessDetailDrawer } from '../components/BusinessDetailDrawer';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';
import { useBusinessDecision, REJECT_TEMPLATES, appendReason } from '../hooks/useBusinessDecision';
import { BanDialog } from '../components/UserModeration';
import { useAuth } from '../useAuth';

interface Business {
  _id: string;
  displayName: string;
  email?: string;
  contactEmail?: string;
  contactPhone?: string;
  taxCode?: string;
  businessCategory?: string;
  province?: string;
  relationshipType?: 'partner' | 'supplier';
  verificationStatus: string;
  suspended?: boolean;
  isBanned?: boolean;
  assignee?: string;
  licenseExpiresAt?: string;
  deletedAt?: string | null;
  createdAt?: string;
  licenseImageUrl?: string | null;
}

/** Response thật của bulk-approve / bulk-reject (xem AdminService.bulk*Business). */
interface BulkResult {
  modified: number;
  results: { id: string; ok: boolean; error?: string }[];
}

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'verified', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Bị từ chối' },
  { key: 'expiring', label: 'Giấy phép' },
  { key: 'archived', label: 'Lưu trữ' },
] as const;

/** Bucket SLA theo tuổi hồ sơ chờ duyệt — bấm để lọc. */
const SLA_BUCKETS = [
  { key: 'over72', label: 'Quá 72h' },
  { key: 'day1_3', label: '24–72h' },
  { key: 'fresh', label: 'Mới <24h' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const PAGE_SIZES = [10, 20, 50];

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

function toCsvCell(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Ngày hết hạn giấy phép: quá hạn tô đỏ, ≤30 ngày tô vàng, còn lại xám. */
function LicenseExpiry({ date }: { date?: string | null }) {
  if (!date) return <span className="cell-meta">Chưa có hạn</span>;
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000);
  const tone = days < 0 ? 'danger' : days <= 30 ? 'warning' : 'muted';
  const label = days < 0 ? `Quá hạn ${Math.abs(days)} ngày` : `Còn ${days} ngày`;
  return (
    <StatusBadge tone={tone} label={label} />
  );
}

export default function BusinessesPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { identity } = useAuth();
  const { values, set, reset } = useUrlFilters({
    tab: 'pending', search: '', category: '', province: '', mine: '', page: '1', pageSize: '20', sort: '', sla: '', relationship: '', banned: '', suspended: '',
  });

  const tab = (TABS.some((t) => t.key === values.tab) ? values.tab : 'pending') as TabKey;
  const pageNum = Math.max(1, Number(values.page) || 1);
  const pageSize = [10, 20, 50].includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  // P0: tab chờ duyệt mặc định cũ nhất trước — duyệt theo thứ tự quá hạn.
  // Tab giấy phép: hạn gần nhất lên đầu, đó mới là việc cần làm.
  // Tab lưu trữ: vừa xoá lên đầu — đó là hồ sơ có thể phải cứu ngay.
  const effectiveSort = values.sort
    || (tab === 'pending' ? 'createdAt:asc'
      : tab === 'expiring' ? 'licenseExpiresAt:asc'
        : tab === 'archived' ? 'deletedAt:desc'
          : undefined);
  const params = useMemo(() => ({
    status: tab,
    search: values.search || undefined,
    category: values.category || undefined,
    province: values.province || undefined,
    assignee: values.mine === '1' ? identity?.email : undefined,
    sla: tab === 'pending' && values.sla ? values.sla : undefined,
    relationshipType: values.relationship || undefined,
    banned: values.banned || undefined,
    suspended: values.suspended || undefined,
    page: pageNum,
    limit: pageSize,
    sort: effectiveSort,
  }), [tab, values.search, values.category, values.province, values.mine, values.sort, values.sla, values.relationship, values.banned, values.suspended, pageNum, pageSize, effectiveSort, identity?.email]);
  const { rows: businesses, total, isLoading, isError, error, refetch } = useAdminList<Business>(
    ['businesses', tab, values.search, values.category, values.province, values.mine, pageNum, pageSize, values.sort, values.sla, values.relationship, values.banned, values.suspended],
    '/admin/businesses/pending',
    params,
    { refetchOnWindowFocus: true },
  );

  // Mini-metric từ stats có sẵn
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => (await apiClient.get<{ pendingVerification: number; verifiedBusinesses: number; rejectedBusinesses: number; slaOver72: number; slaDay1_3: number; slaFresh: number; expiringSoon: number; archivedBusinesses: number }>('/admin/stats')).data,
    staleTime: 60_000,
  });

  const [searchInput, setSearchInput] = useState(values.search);
  useEffect(() => setSearchInput(values.search), [values.search]);
  // Debounce search server-side: gõ xong 400ms tự tìm, khỏi nút Tìm
  useEffect(() => {
    if (searchInput.trim() === values.search) return;
    const t = setTimeout(() => set({ search: searchInput.trim(), page: '1' }), 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const goDetail = (id: string) => setDetailId(id);
  // ponytail: index-only highlight, no scroll management until list outgrows viewport
  // -1 = chưa chọn dòng nào; nếu mặc định 0 thì dòng đầu trông như "đang chọn" khi vừa mở trang
  const [highlight, setHighlight] = useState(-1);
  const [helpOpen, setHelpOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; action: 'ban' | 'unban' } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; name: string } | null>(null);

  // Một nguồn sự thật cho duyệt/từ chối/vô hiệu hóa — dùng chung với route chi tiết.
  const decision = useBusinessDecision({
    onChanged: () => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    undoable: true,
    nextOf: (id) => {
      const idx = businesses.findIndex((b) => b._id === id);
      const next = businesses[idx + 1] ?? businesses[idx - 1];
      return next && next._id !== id ? { id: next._id, displayName: next.displayName } : undefined;
    },
    // Duyệt liên tiếp: nhảy sang hồ sơ kế tiếp nếu đang mở drawer
    onAdvance: (next) => setDetailId((cur) => (cur ? next.id : cur)),
  });

  // Đổi bộ lọc/trang thì bỏ chọn + bỏ con trỏ bàn phím
  useEffect(() => {
    setSelected(new Set());
    setHighlight(-1);
  }, [tab, values.search, values.category, values.province, values.sla, pageNum, pageSize]);

  // Danh sách co lại thì kẹp con trỏ vào phạm vi; rỗng thì bỏ chọn hẳn
  useEffect(() => {
    setHighlight((h) => (h < 0 ? -1 : businesses.length === 0 ? -1 : Math.min(h, businesses.length - 1)));
  }, [businesses.length]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedRows = businesses.filter((b) => selected.has(b._id));

  function refresh() {
    setSelected(new Set());
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  }

  const hasActiveFilter = Boolean(values.search || values.category || values.province || values.mine || values.sla || values.relationship || values.banned || values.suspended);
  /** Chip hiển thị đúng thứ đang lọc — mỗi chip gỡ được riêng, thay vì nút "Xóa lọc" mù. */
  const activeFilters: Array<{ key: 'search' | 'category' | 'province' | 'mine' | 'sla' | 'relationship' | 'banned' | 'suspended'; label: string }> = [];
  if (values.search) activeFilters.push({ key: 'search', label: `Từ khóa: ${values.search}` });
  if (values.category) activeFilters.push({ key: 'category', label: `Danh mục: ${categoryVi(values.category)}` });
  if (values.province) activeFilters.push({ key: 'province', label: `Tỉnh: ${values.province}` });
  if (values.mine === '1') activeFilters.push({ key: 'mine', label: 'Của tôi' });
  if (values.sla) activeFilters.push({ key: 'sla', label: `Ưu tiên: ${SLA_BUCKETS.find((b) => b.key === values.sla)?.label ?? values.sla}` });
  if (values.relationship) activeFilters.push({ key: 'relationship', label: `Loại: ${relationshipVi(values.relationship)}` });
  if (values.banned) activeFilters.push({ key: 'banned', label: values.banned === 'true' ? 'Đang bị cấm' : 'Không bị cấm' });
  if (values.suspended) activeFilters.push({ key: 'suspended', label: values.suspended === 'true' ? 'Đang tạm ngưng bán' : 'Đang bán' });

  function clearFilters() {
    setSearchInput('');
    reset();
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === businesses.length && businesses.length > 0 ? new Set() : new Set(businesses.map((b) => b._id)),
    );
  }

  function toggleSort(field: string) {
    const [cur, dir] = (effectiveSort ?? '').split(':');
    set({ sort: cur === field && dir === 'asc' ? `${field}:desc` : `${field}:asc`, page: '1' });
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.delete(`/admin/businesses/${deleteTarget}`);
      addToast('success', 'Đã xoá hồ sơ — xem lại ở tab Lưu trữ nếu cần khôi phục.', {
        label: 'Xem lưu trữ',
        onClick: () => set({ tab: 'archived', page: '1' }),
      });
      setDeleteTarget(null);
      // ở lại list sau mutation
      refresh();
    } catch {
      addToast('error', 'Xóa thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  /** Toast chung cho bulk-approve/bulk-reject — đọc đúng shape `{modified, results}`. */
  function reportBulk(verb: string, res: BulkResult) {
    const failed = res.results.filter((r) => !r.ok);
    addToast(failed.length > 0 ? 'warning' : 'success',
      failed.length > 0
        ? `Đã ${verb} ${res.modified}/${res.results.length} hồ sơ. Lỗi: ${failed.slice(0, 3).map((f) => f.error ?? 'không rõ').join('; ')}${failed.length > 3 ? ` (+${failed.length - 3})` : ''}`
        : `Đã ${verb} ${res.modified} doanh nghiệp.`);
  }

  async function confirmBulkApprove() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const res = await apiClient.post<BulkResult>(
        '/admin/businesses/bulk-approve', { ids: [...selected] },
      );
      reportBulk('duyệt', res.data);
      setBulkApproveOpen(false);
      refresh();
    } catch {
      addToast('error', 'Duyệt hàng loạt thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmBulkAssign() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      // Không gửi assignee = backend lấy email của chính admin đang đăng nhập.
      const res = await apiClient.post<{ modified: number }>(
        '/admin/businesses/bulk-assign', { ids: [...selected] },
      );
      addToast('success', `Đã nhận ${res.data.modified} hồ sơ về bạn.`);
      setSelected(new Set());
      refresh();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Nhận hồ sơ thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkReject() {
    if (selected.size === 0 || busy) return;
    if (!bulkReason.trim()) {
      setBulkError('Vui lòng nhập lý do từ chối.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post<BulkResult>(
        '/admin/businesses/bulk-reject', { ids: [...selected], rejectionReason: bulkReason.trim() },
      );
      reportBulk('từ chối', res.data);
      setBulkRejectOpen(false);
      setBulkReason('');
      refresh();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) setBulkError('Lý do từ chối không hợp lệ.');
      else addToast('error', 'Từ chối hàng loạt thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiClient.get<{ data: Business[]; total: number; truncated: boolean }>('/admin/businesses/export', {
        params: {
          status: tab,
          search: values.search || undefined,
          category: values.category || undefined,
          province: values.province || undefined,
          assignee: values.mine === '1' ? identity?.email : undefined,
          sla: tab === 'pending' && values.sla ? values.sla : undefined,
          sort: effectiveSort,
          relationshipType: values.relationship || undefined,
          banned: values.banned || undefined,
          suspended: values.suspended || undefined,
        },
      });
      if (res.data.truncated) addToast('warning', `Xuất 500/${res.data.total} dòng đầu tiên. Thu hẹp bộ lọc để xuất hết.`);
      const header = ['ID', 'Tên doanh nghiệp', 'Email', 'Điện thoại', 'Loại quan hệ', 'Danh mục', 'Tỉnh', 'Mã số thuế', 'Giấy phép hết hạn', 'Người phụ trách', 'Trạng thái', 'Bị cấm', 'Tạm ngưng bán', 'Ngày đăng ký'];
      const lines = res.data.data.map((b) => [
        b._id, b.displayName, b.contactEmail ?? b.email ?? '', b.contactPhone ?? '',
        relationshipVi(b.relationshipType), b.businessCategory ?? '', b.province ?? '',
        b.taxCode ?? '', b.licenseExpiresAt ? formatDateTime(b.licenseExpiresAt) : '',
        b.assignee ?? '', b.verificationStatus, b.isBanned ? 'Có' : '', b.suspended ? 'Có' : '',
        b.createdAt ?? '',
      ].map(toCsvCell).join(','));
      const blob = new Blob([['﻿' + header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `doanh-nghiep-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast('success', `Đã xuất ${lines.length} dòng CSV.`);
      setExportConfirmOpen(false);
    } catch {
      addToast('error', 'Xuất CSV thất bại. Vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  }

  async function confirmRestore() {
    if (!restoreTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/businesses/${restoreTarget.id}/restore`);
      addToast('success', `Đã khôi phục ${restoreTarget.name} — hồ sơ về Chờ duyệt.`);
      setRestoreTarget(null);
      refresh();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Khôi phục thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  // Keyboard: J/K di chuyển, Enter mở drawer, A duyệt, R từ chối (pending), ? trợ giúp
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (detailId || bulkApproveOpen || bulkRejectOpen || deleteTarget || exportConfirmOpen || helpOpen) return;
      if (e.key === 'j' || e.key === 'J') setHighlight((h) => Math.min(h + 1, businesses.length - 1));
      else if (e.key === 'k' || e.key === 'K') setHighlight((h) => Math.max(h - 1, -1));
      else if (e.key === 'Enter') {
        const b = businesses[highlight];
        if (b) goDetail(b._id);
      } else if ((e.key === 'a' || e.key === 'A') && tab === 'pending') {
        const b = businesses[highlight];
        if (b) decision.requestApprove({ id: b._id, displayName: b.displayName });
      } else if ((e.key === 'r' || e.key === 'R') && tab === 'pending') {
        const b = businesses[highlight];
        if (b) decision.requestReject({ id: b._id, displayName: b.displayName });
      } else if (e.key === '?') setHelpOpen(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [businesses, highlight, detailId, bulkApproveOpen, bulkRejectOpen, deleteTarget, exportConfirmOpen, helpOpen, tab]);

  const showCheckbox = tab === 'pending';
  const loadError = axios.isAxiosError(error)
    ? (error.response?.data as { message?: string } | undefined)?.message ?? `Lỗi ${error.response?.status ?? 'mạng'}`
    : undefined;

  return (
    <div className="page-stack">
      <ListHeader
        title="Danh sách doanh nghiệp"
        count={total}
        actions={<><ExportButton onExport={() => setExportConfirmOpen(true)} /><button className="btn btn-primary btn-sm" onClick={() => setDetailId('new')} type="button"><Plus size={14} aria-hidden /> Thêm</button></>}
      >
        <input
          className="input filter-search" type="search" value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') set({ search: searchInput.trim(), page: '1' }); }}
          placeholder="Tìm theo tên, email, SĐT, MST hoặc ID" aria-label="Tìm kiếm doanh nghiệp"
        />
        <label className="filter-check">
          <input type="checkbox" checked={values.mine === '1'} onChange={(e) => set({ mine: e.target.checked ? '1' : '', page: '1' })} />
          Của tôi
        </label>
        {/* `banned` / `suspended` trước đây chỉ nằm trong URL: server lọc được
            nhưng không có nút nào bật — giờ có lối vào thật. */}
        <label className="filter-check">
          <input
            type="checkbox"
            checked={values.banned === 'true'}
            onChange={(e) => set({ banned: e.target.checked ? 'true' : '', page: '1' })}
          />
          Đang bị cấm
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={values.suspended === 'true'}
            onChange={(e) => set({ suspended: e.target.checked ? 'true' : '', page: '1' })}
          />
          Tạm ngưng bán
        </label>
      </ListHeader>

      <div className="filter-bar">
        <StatusTabs
          tabs={TABS.map((t) => ({
            ...t,
            count: stats
              ? t.key === 'pending' ? stats.pendingVerification
                : t.key === 'verified' ? stats.verifiedBusinesses
                  : t.key === 'rejected' ? stats.rejectedBusinesses
                    : t.key === 'expiring' ? stats.expiringSoon
                      : t.key === 'archived' ? stats.archivedBusinesses
                        : undefined
              : undefined,
          }))}
          active={tab}
          onChange={(k) => set({ tab: k === 'pending' ? '' : k, page: '1' })}
        />
        <span className="cell-meta">Nhấn dòng để xem chi tiết · phím ? trợ giúp</span>
      </div>

      {/* Một hàng duy nhất cho mọi điều kiện đang lọc + bucket SLA:
          trước đây tách 2 hàng chip riêng nên đẩy bảng xuống quá xa. */}
      {(tab === 'pending' || activeFilters.length > 0) && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {tab === 'pending' && stats && (
            <>
              <span className="cell-meta">Ưu tiên duyệt:</span>
              {SLA_BUCKETS.map(({ key, label }) => {
                const count = key === 'over72' ? stats.slaOver72 ?? 0 : key === 'day1_3' ? stats.slaDay1_3 ?? 0 : stats.slaFresh ?? 0;
                const active = values.sla === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip${active ? ' filter-chip-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => set({ sla: active ? '' : key, page: '1' })}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </>
          )}
          {activeFilters.length > 0 && (
            <>
              {tab === 'pending' && stats && <span className="context-row-sep" aria-hidden />}
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="filter-chip filter-chip-removable"
                  onClick={() => {
                    if (f.key === 'search') setSearchInput('');
                    set({ [f.key]: '', page: '1' });
                  }}
                  aria-label={`Gỡ lọc ${f.label}`}
                >
                  {f.label} <X size={12} aria-hidden />
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <TableShell>
        {showCheckbox && (
          <BulkBar
            count={selected.size}
            names={selectedRows.map((b) => b.displayName)}
            onApprove={() => setBulkApproveOpen(true)}
            onReject={() => { setBulkRejectOpen(true); setBulkReason(''); setBulkError(null); }}
            onAssign={confirmBulkAssign}
            onClear={() => setSelected(new Set())}
            busy={busy}
          />
        )}

        {isError && (
          <StateBlock variant="error" title="Không tải được danh sách" copy={loadError ?? 'Kiểm tra kết nối rồi thử lại.'}>
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && <StateBlock variant="loading" title="Đang tải danh sách" copy="Đang lấy hồ sơ doanh nghiệp." />}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Danh sách doanh nghiệp">
              <thead>
                <tr>
                  {showCheckbox && (
                    <th scope="col" className="th-check"><input type="checkbox" checked={businesses.length > 0 && selected.size === businesses.length} onChange={toggleAll} aria-label="Chọn tất cả trang này" /></th>
                  )}
                  <ColumnHeader
                    label="Doanh nghiệp"
                    sortField="displayName"
                    sort={effectiveSort}
                    onSort={toggleSort}
                  />
                  <ColumnHeader label="Liên hệ" />
                  <ColumnHeader
                    label="Loại"
                    className="col-hide-mobile"
                    sortField="relationshipType"
                    sort={effectiveSort}
                    onSort={toggleSort}
                    filter={{
                      value: values.relationship,
                      options: [
                        { value: '', label: 'Tất cả loại' },
                        ...Object.entries(RELATIONSHIP_VI).map(([value, label]) => ({ value, label })),
                      ],
                      onChange: (v) => set({ relationship: v, page: '1' }),
                    }}
                  />
                  <ColumnHeader
                    label="Danh mục"
                    className="col-hide-mobile"
                    sortField="businessCategory"
                    sort={effectiveSort}
                    onSort={toggleSort}
                    filter={{
                      value: values.category,
                      options: [{ value: '', label: 'Tất cả danh mục' }, ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: categoryVi(c) }))],
                      onChange: (v) => set({ category: v, page: '1' }),
                    }}
                  />
                  <ColumnHeader
                    label="Tỉnh / Thành"
                    className="col-hide-mobile"
                    sortField="province"
                    sort={effectiveSort}
                    onSort={toggleSort}
                    filter={{
                      value: values.province,
                      options: [{ value: '', label: 'Tất cả tỉnh thành' }, ...PROVINCES.map((p) => ({ value: p, label: p }))],
                      onChange: (v) => set({ province: v, page: '1' }),
                    }}
                  />
                  <ColumnHeader
                    label={
                      tab === 'expiring' ? 'Giấy phép hết hạn'
                        : tab === 'archived' ? 'Xoá lúc'
                          : tab === 'pending' ? 'Chờ từ' : 'Đăng ký'
                    }
                    sortField={tab === 'expiring' ? 'licenseExpiresAt' : tab === 'archived' ? 'deletedAt' : 'createdAt'}
                    sort={effectiveSort}
                    onSort={toggleSort}
                  />
                  {/* Tab theo trạng thái thì mọi dòng cùng một trạng thái — cột này chỉ có nghĩa ở tab trộn */}
                  {(tab === 'all' || tab === 'expiring' || tab === 'archived') && <ColumnHeader label="Trạng thái" />}
                  <th scope="col" className="th-center col-sticky">{tab === 'archived' ? 'Khôi phục' : 'Hành động'}</th>
                </tr>
              </thead>
              <tbody>
                {businesses.length === 0 && (
                  <tr>
                    <td colSpan={(showCheckbox ? 8 : 7) + (tab === 'all' || tab === 'expiring' || tab === 'archived' ? 1 : 0)}>
                      <EmptyState
                        title={hasActiveFilter ? 'Không khớp hồ sơ nào' : tab === 'pending' ? 'Đã duyệt hết hồ sơ chờ' : tab === 'archived' ? 'Chưa có hồ sơ nào bị xoá' : tab === 'expiring' ? 'Không có giấy phép nào cần gia hạn' : 'Chưa có hồ sơ nào'}
                        copy={hasActiveFilter
                          ? 'Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm.'
                          : tab === 'pending' ? 'Hàng đợi trống — chuyển sang tab khác để kiểm tra.'
                            : tab === 'archived' ? 'Hồ sơ bị xoá mềm sẽ nằm ở đây và khôi phục được.'
                              : tab === 'expiring' ? 'Mọi giấy phép còn hạn trên 30 ngày.'
                                : 'Hồ sơ sẽ xuất hiện ở đây khi doanh nghiệp đăng ký.'}
                        action={hasActiveFilter ? <button className="btn btn-secondary btn-sm" type="button" onClick={clearFilters}>Xóa bộ lọc</button> : undefined}
                      />
                    </td>
                  </tr>
                )}
                {businesses.map((b, i) => (
                  <tr
                    key={b._id}
                    className={i === highlight ? 'row-highlight' : undefined}
                    onClick={(e) => {
                      const t = e.target as HTMLElement;
                      if (t.closest('button,input,select,a')) return;
                      goDetail(b._id);
                    }}
                  >
                    {showCheckbox && (
                      <td><input type="checkbox" checked={selected.has(b._id)} onChange={() => toggleOne(b._id)} aria-label={`Chọn ${b.displayName}`} /></td>
                    )}
                    <td>
                      <div className="cell-title">
                        {b.displayName}
                        {b.isBanned && <span className="badge badge-danger cell-badge">Bị cấm</span>}
                        {b.suspended && !b.isBanned && <span className="badge badge-muted cell-badge">Tạm ngưng</span>}
                      </div>
                      <div className="cell-meta">
                        <span className="k-mono">{shortId(b._id)}</span>
                        {/* Người phụ trách: "Của tôi" lọc theo field này, phải thấy được
                            để biết hồ sơ đã có người nhận hay còn trong hàng đợi chung. */}
                        {b.assignee && <span> · {b.assignee}</span>}
                      </div>
                    </td>
                    <td>
                      <div>{b.contactPhone ? <MaskedPII value={b.contactPhone} kind="phone" /> : '—'}</div>
                      <div className="cell-meta">{(b.contactEmail ?? b.email) ? <MaskedPII value={b.contactEmail ?? b.email ?? ''} kind="email" /> : '—'}</div>
                    </td>
                    <td className="col-hide-mobile">
                      <div className="cell-title">{relationshipVi(b.relationshipType)}</div>
                    </td>
                    <td className="col-hide-mobile">
                      <div className="cell-title">{categoryVi(b.businessCategory)}</div>
                    </td>
                    <td className="col-hide-mobile">
                      <div className="cell-title">{b.province ?? '—'}</div>
                    </td>
                    <td>
                      <span className="cell-date" title={tab === 'expiring' ? 'Giấy phép hết hạn' : formatDateTime(b.createdAt)}>
                        {/* Tab chờ duyệt: tuổi là tín hiệu ưu tiên (badge màu).
                            Tab giấy phép: ngày hết hạn mới là thứ cần đọc.
                            Tab khác: tuổi không phải việc gấp — hiện ngày đăng ký. */}
                        {tab === 'expiring'
                          ? <LicenseExpiry date={b.licenseExpiresAt} />
                          : tab === 'pending'
                            ? <StatusBadge tone={ageTone(b.createdAt)} label={ageLabel(b.createdAt)} />
                            : tab === 'archived'
                              ? <span className="cell-meta">Xoá lúc {formatDateTime(b.deletedAt)}</span>
                              : formatDateTime(b.createdAt)}
                      </span>
                    </td>
                    {(tab === 'all' || tab === 'expiring' || tab === 'archived') && (
                      <td><VerificationBadge status={b.verificationStatus} /></td>
                    )}
                    <td className="col-sticky">
                      {tab === 'archived' ? (
                        <div className="table-actions table-actions--end">
                          {/* Xem được trước khi khôi phục — không thì phải khôi phục
                              mò rồi mới biết là hồ sơ nào. */}
                          <button className="btn btn-ghost btn-icon" type="button" onClick={() => goDetail(b._id)} aria-label={`Xem ${b.displayName}`} title="Chi tiết"><Eye size={16} aria-hidden /></button>
                          <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => setRestoreTarget({ id: b._id, name: b.displayName })}>Khôi phục</button>
                        </div>
                      ) : (
                        <div className="table-actions table-actions--end">
                          <button className="btn btn-ghost btn-icon" type="button" onClick={() => goDetail(b._id)} aria-label={`Xem ${b.displayName}`} title="Chi tiết"><Eye size={16} aria-hidden /></button>
                          {tab === 'pending' && (
                            <>
                              <button className="btn btn-primary btn-icon" type="button" disabled={busy} onClick={() => decision.requestApprove({ id: b._id, displayName: b.displayName })} aria-label={`Duyệt ${b.displayName}`} title="Duyệt"><Check size={16} aria-hidden /></button>
                              <button className="btn btn-danger-ghost btn-icon" type="button" disabled={busy} onClick={() => decision.requestReject({ id: b._id, displayName: b.displayName })} aria-label={`Từ chối ${b.displayName}`} title="Từ chối"><X size={16} aria-hidden /></button>
                            </>
                          )}
                          {tab === 'verified' && (
                            b.suspended
                              ? <button className="btn btn-secondary btn-icon" type="button" disabled={busy} onClick={() => decision.requestSuspend({ id: b._id, displayName: b.displayName, suspend: false })} aria-label={`Cho ${b.displayName} bán lại`} title="Cho bán lại"><RotateCcw size={16} aria-hidden /></button>
                              : <button className="btn btn-secondary btn-icon" type="button" disabled={busy} onClick={() => decision.requestSuspend({ id: b._id, displayName: b.displayName, suspend: true })} aria-label={`Tạm ngưng bán ${b.displayName}`} title="Tạm ngưng bán"><PauseCircle size={16} aria-hidden /></button>
                          )}
                          <button className="btn btn-ghost btn-icon" type="button" disabled={busy} onClick={() => setDeleteTarget(b._id)} aria-label={`Xóa ${b.displayName}`} title="Xóa"><Trash2 size={16} aria-hidden /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={pageNum} totalPages={totalPages} total={total}
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      <BusinessDetailDrawer
        businessId={detailId}
        onClose={() => setDetailId(null)}
        onApprove={(id) => {
          const b = businesses.find((x) => x._id === id);
          decision.requestApprove({ id, displayName: b?.displayName ?? '' });
        }}
        onReject={(id) => {
          const b = businesses.find((x) => x._id === id);
          decision.requestReject({ id, displayName: b?.displayName ?? '' });
        }}
        onSuspend={(_id, displayName, suspend) => {
          decision.requestSuspend({ id: _id, displayName, suspend });
        }}
        onBan={(id, displayName, ban) => {
          setBanTarget({ id, name: displayName, action: ban ? 'ban' : 'unban' });
        }}
      />

      <BanDialog
        target={banTarget}
        onClose={() => setBanTarget(null)}
        onDone={() => {
          setBanTarget(null);
          refresh();
        }}
      />

      {/* Confirm duyệt / từ chối / vô hiệu hóa dùng chung với route chi tiết */}
      {decision.dialogs}

      <ConfirmDialog
        open={bulkApproveOpen} onClose={() => setBulkApproveOpen(false)}
        title={`Duyệt ${selected.size} doanh nghiệp?`} confirmLabel="Duyệt hàng loạt"
        variant="primary" busy={busy} requireText="XACNHAN" onConfirm={confirmBulkApprove}
        description="Thao tác diện rộng — kiểm tra lại danh sách trước khi xác nhận."
        preview={(
          <ul className="confirm-list">
            {selectedRows.slice(0, 10).map((b) => <li key={b._id}>{b.displayName} <span className="cell-meta k-mono">{b._id}</span></li>)}
            {selectedRows.length > 10 && <li>...và {selectedRows.length - 10} hồ sơ nữa</li>}
          </ul>
        )}
      />

      <ConfirmDialog
        open={restoreTarget !== null} onClose={() => setRestoreTarget(null)}
        title={`Khôi phục ${restoreTarget?.name ?? ''}?`}
        description="Hồ sơ được đưa về Chờ duyệt để kiểm tra lại trước khi bán hàng. Không tự động xác minh lại."
        confirmLabel="Khôi phục hồ sơ" variant="primary" busy={busy} onConfirm={confirmRestore}
      />

      <ConfirmDialog
        open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="Xóa hồ sơ doanh nghiệp?"
        description="Hồ sơ bị xóa mềm, không hiện trong danh sách nhưng vẫn giữ trong DB để đối soát."
        confirmLabel="Xóa hồ sơ" variant="danger" busy={busy} onConfirm={confirmDelete}
        requireText="XACNHAN"
      />

      <ConfirmDialog
        open={exportConfirmOpen} onClose={() => setExportConfirmOpen(false)}
        title="Xuất CSV danh sách doanh nghiệp?"
        description="File chứa số điện thoại và email đầy đủ (không che) của tối đa 500 hồ sơ khớp bộ lọc hiện tại."
        confirmLabel="Tải CSV" variant="primary" busy={exporting} onConfirm={handleExport}
        preview={(
          <dl className="description-list">
            <div><dt>Phạm vi</dt><dd>{total} hồ sơ khớp bộ lọc</dd></div>
            <div><dt>Dữ liệu nhạy cảm</dt><dd>SĐT, email — không che</dd></div>
          </dl>
        )}
      />

      <Dialog open={bulkRejectOpen} onClose={() => { setBulkRejectOpen(false); setBulkError(null); }} labelId="bulk-reject-title" variant="dialog">
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="bulk-reject-title" className="panel-title">Từ chối {selected.size} doanh nghiệp</h2>
              <p className="panel-subtitle">Cùng một lý do được gửi cho tất cả hồ sơ đã chọn.</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkRejectOpen(false); setBulkError(null); }} type="button">Đóng</button>
          </div>
          <div className="dialog-body page-stack">
            <div className="filter-chip-row" style={{ padding: 0 }}>
              {REJECT_TEMPLATES.map((t) => (
                <button
                  className="filter-chip filter-chip-removable" key={t.short}
                  onClick={() => setBulkReason((r) => appendReason(r, t.text))}
                  type="button"
                  title={t.text}
                >
                  <Plus size={12} aria-hidden /> {t.short}
                </button>
              ))}
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="bulk-reject-reason">Lý do gửi cho doanh nghiệp</label>
              <textarea
                className="textarea" id="bulk-reject-reason" value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                aria-label="Nhập lý do từ chối" aria-required="true" rows={4}
                placeholder="Nêu cụ thể cần sửa gì để doanh nghiệp nộp lại đúng..."
              />
              <span className="cell-meta">{bulkReason.trim().length} ký tự · doanh nghiệp sẽ đọc lý do này</span>
            </div>
            {bulkError && <p className="alert" role="alert">{bulkError}</p>}
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => { setBulkRejectOpen(false); setBulkError(null); }} type="button">Hủy</button>
              <button className="btn btn-danger" onClick={handleBulkReject} type="button" disabled={busy}>
                {busy ? 'Đang gửi...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} labelId="shortcuts-title" variant="dialog">
        <div className="dialog">
          <div className="dialog-header">
            <h2 id="shortcuts-title" className="panel-title">Phím tắt</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setHelpOpen(false)} type="button">Đóng</button>
          </div>
          <div className="dialog-body">
            <dl className="description-list">
              <div><dt><kbd>J</kbd> / <kbd>K</kbd></dt><dd>Di chuyển dòng</dd></div>
              <div><dt><kbd>Enter</kbd></dt><dd>Mở chi tiết</dd></div>
              <div><dt><kbd>A</kbd> / <kbd>R</kbd></dt><dd>Duyệt / Từ chối (tab Chờ duyệt)</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>Mở bảng này</dd></div>
            </dl>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
