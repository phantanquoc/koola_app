import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Pencil, Plus, Trash2, Undo2, X, Ban, RotateCcw } from 'lucide-react';
import apiClient from '../apiClient';
import { StatusTabs } from '../components/StatusTabs';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { VerificationBadge, StatusBadge } from '../components/StatusBadge';
import { MaskedPII } from '../components/MaskedPII';
import { ExportButton } from '../components/ExportButton';
import { formatDateTime, ageLabel, ageTone } from '../components/formatters';
import { categoryVi, PROVINCES, CATEGORY_OPTIONS } from '../components/vn-data';
import Dialog from '../components/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BulkBar } from '../components/BulkBar';
import { useToast } from '../components/Toast';
import { BusinessDetailDrawer } from '../components/BusinessDetailDrawer';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';
import { useAuth } from '../useAuth';

interface Business {
  _id: string;
  displayName: string;
  email?: string;
  contactEmail?: string;
  contactPhone?: string;
  businessCategory?: string;
  province?: string;
  verificationStatus: string;
  suspended?: boolean;
  createdAt?: string;
  licenseImageUrl?: string | null;
}

const rejectTemplates = [
  'Ảnh giấy phép không rõ, vui lòng tải lại ảnh sắc nét hơn.',
  'Thông tin doanh nghiệp chưa khớp với giấy phép.',
  'Thiếu giấy phép hợp lệ để xác minh doanh nghiệp.',
];

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'verified', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Bị từ chối' },
  { key: 'expiring', label: 'Sắp hết hạn' },
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

export default function BusinessesPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { identity } = useAuth();
  const { values, set, reset } = useUrlFilters({
    tab: 'pending', search: '', category: '', province: '', mine: '', page: '1', pageSize: '20', sort: '',
  });

  const tab = (TABS.some((t) => t.key === values.tab) ? values.tab : 'pending') as TabKey;
  const pageNum = Math.max(1, Number(values.page) || 1);
  const pageSize = [10, 20, 50].includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const params = useMemo(() => ({
    status: tab,
    search: values.search || undefined,
    category: values.category || undefined,
    province: values.province || undefined,
    assignee: values.mine === '1' ? identity?.email : undefined,
    page: pageNum,
    limit: pageSize,
    sort: values.sort || undefined,
  }), [tab, values.search, values.category, values.province, values.mine, values.sort, pageNum, pageSize, identity?.email]);
  const { rows: businesses, total, isLoading, isError, error, refetch } = useAdminList<Business & { assignee?: string }>(
    ['businesses', tab, values.search, values.category, values.province, values.mine, pageNum, pageSize, values.sort],
    '/admin/businesses/pending',
    params,
    { refetchOnWindowFocus: true },
  );

  // Mini-metric từ stats có sẵn
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => (await apiClient.get<{ pendingVerification: number; verifiedBusinesses: number; rejectedBusinesses: number }>('/admin/stats')).data,
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
  const [highlight, setHighlight] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [rejectTargets, setRejectTargets] = useState<string[] | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; suspend: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setHighlight(0);
  }, [tab, values.search, values.category, values.province, pageNum, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedRows = businesses.filter((b) => selected.has(b._id));
  const approvingBusiness = businesses.find((b) => b._id === approveTarget);

  function refresh() {
    setSelected(new Set());
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
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
    const [cur, dir] = values.sort.split(':');
    set({ sort: cur === field && dir === 'asc' ? `${field}:desc` : `${field}:asc`, page: '1' });
  }

  function sortAria(field: string): 'ascending' | 'descending' | 'none' {
    const [cur, dir] = values.sort.split(':');
    if (cur !== field) return 'none';
    return dir === 'desc' ? 'descending' : 'ascending';
  }

  function copyId(id: string) {
    void navigator.clipboard?.writeText(id).then(
      () => addToast('success', 'Đã sao chép ID.'),
      () => addToast('error', 'Sao chép thất bại.'),
    );
  }

  async function confirmApprove() {
    if (!approveTarget || busy) return;
    const targetId = approveTarget;
    const targetName = approvingBusiness?.displayName ?? '';
    setBusy(true);
    try {
      await apiClient.post(`/admin/businesses/${targetId}/approve`);
      // Xét tiếp: sang hồ sơ kế tiếp trong queue thay vì đóng drawer
      const idx = businesses.findIndex((b) => b._id === targetId);
      const next = businesses[idx + 1] ?? businesses[idx - 1];
      addToast('success', `Đã duyệt ${targetName} thành công.`, {
        label: 'Hoàn tác',
        onClick: () => {
          apiClient.post(`/admin/businesses/${targetId}/reopen`)
            .then(() => { addToast('success', 'Đã hoàn tác, hồ sơ về Chờ duyệt.'); refresh(); })
            .catch(() => addToast('error', 'Hoàn tác thất bại.'));
        },
      });
      setApproveTarget(null);
      refresh();
    } catch {
      addToast('error', 'Duyệt thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.delete(`/admin/businesses/${deleteTarget}`);
      addToast('success', 'Đã xóa hồ sơ.');
      setDeleteTarget(null);
      // ở lại list sau mutation
      refresh();
    } catch {
      addToast('error', 'Xóa thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmBulkApprove() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const res = await apiClient.post<{ approved: number; failed: string[] }>(
        '/admin/businesses/bulk-approve', { ids: [...selected] },
      );
      addToast(res.data.failed.length > 0 ? 'error' : 'success',
        res.data.failed.length > 0
          ? `Đã duyệt ${res.data.approved}, thất bại ${res.data.failed.length} hồ sơ.`
          : `Đã duyệt ${res.data.approved} doanh nghiệp.`);
      setBulkApproveOpen(false);
      refresh();
    } catch {
      addToast('error', 'Duyệt hàng loạt thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function openReject(ids: string[]) {
    setRejectTargets(ids);
    setRejectReason('');
    setRejectError(null);
  }

  async function handleRejectSubmit() {
    if (!rejectTargets || rejectTargets.length === 0 || busy) return;
    if (!rejectReason.trim()) {
      setRejectError('Vui lòng nhập lý do từ chối.');
      return;
    }
    setBusy(true);
    try {
      if (rejectTargets.length === 1) {
        await apiClient.post(`/admin/businesses/${rejectTargets[0]}/reject`, { rejectionReason: rejectReason.trim() });
      } else {
        const res = await apiClient.post<{ approved: number; failed: string[] }>(
          '/admin/businesses/bulk-reject', { ids: rejectTargets, rejectionReason: rejectReason.trim() },
        );
        if (res.data.failed.length > 0) addToast('error', `Đã từ chối ${res.data.approved}, thất bại ${res.data.failed.length} hồ sơ.`);
      }
      addToast('success', rejectTargets.length === 1
        ? `Đã từ chối ${businesses.find((b) => b._id === rejectTargets[0])?.displayName ?? ''}.`
        : `Đã từ chối ${rejectTargets.length} doanh nghiệp.`);
      setRejectTargets(null);
      setRejectReason('');
      // ở lại list sau mutation
      refresh();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) setRejectError('Lý do từ chối không hợp lệ.');
      else addToast('error', 'Từ chối thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSuspend() {
    if (!suspendTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/businesses/${suspendTarget.id}/${suspendTarget.suspend ? 'disable' : 'enable'}`);
      addToast('success', suspendTarget.suspend ? 'Đã vô hiệu hóa doanh nghiệp.' : 'Đã kích hoạt lại doanh nghiệp.');
      setSuspendTarget(null);
      // ở lại list sau mutation
      refresh();
    } catch {
      addToast('error', 'Thao tác thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    try {
      const res = await apiClient.get<{ data: Business[]; total: number }>('/admin/businesses/pending', {
        params: { ...params, page: 1, limit: 500 },
      });
      if (res.data.total > 500) addToast('warning', `Xuất 500/${res.data.total} dòng đầu tiên. Thu hẹp bộ lọc để xuất hết.`);
      const header = ['ID', 'Tên doanh nghiệp', 'Email', 'Điện thoại', 'Danh mục', 'Tỉnh', 'Trạng thái', 'Ngày đăng ký'];
      const lines = res.data.data.map((b) => [b._id, b.displayName, b.contactEmail ?? b.email ?? '', b.contactPhone ?? '', b.businessCategory ?? '', b.province ?? '', b.verificationStatus, b.createdAt ?? ''].map(toCsvCell).join(','));
      const blob = new Blob([['﻿' + header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `doanh-nghiep-${tab}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast('success', `Đã xuất ${lines.length} dòng CSV.`);
    } catch {
      addToast('error', 'Xuất CSV thất bại. Vui lòng thử lại.');
    }
  }

  // Keyboard: J/K di chuyển, Enter mở drawer, A duyệt, R từ chối (pending), ? trợ giúp
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (approveTarget || rejectTargets || suspendTarget || bulkApproveOpen || helpOpen) return;
      if (e.key === 'j' || e.key === 'J') setHighlight((h) => Math.min(h + 1, businesses.length - 1));
      else if (e.key === 'k' || e.key === 'K') setHighlight((h) => Math.max(h - 1, 0));
      else if (e.key === 'Enter') {
        const b = businesses[highlight];
        if (b) goDetail(b._id);
      } else if ((e.key === 'a' || e.key === 'A') && tab === 'pending') {
        const b = businesses[highlight];
        if (b) setApproveTarget(b._id);
      } else if ((e.key === 'r' || e.key === 'R') && tab === 'pending') {
        const b = businesses[highlight];
        if (b) openReject([b._id]);
      } else if (e.key === '?') setHelpOpen(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [businesses, highlight, approveTarget, rejectTargets, suspendTarget, bulkApproveOpen, helpOpen, tab]);

  const showCheckbox = tab === 'pending';
  const loadError = axios.isAxiosError(error)
    ? (error.response?.data as { message?: string } | undefined)?.message ?? `Lỗi ${error.response?.status ?? 'mạng'}`
    : undefined;

  return (
    <div className="page-stack">
      <ListHeader
        title="Danh sách doanh nghiệp"
        count={total}
        actions={<><ExportButton onExport={handleExport} /><button className="btn btn-primary btn-sm" onClick={() => setDetailId('new')} type="button"><Plus size={14} aria-hidden /> Thêm</button></>}
      >
        <input
          className="input filter-search" type="search" value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') set({ search: searchInput.trim(), page: '1' }); }}
          placeholder="Tên, email, SĐT, ID...  ( / )" aria-label="Tìm kiếm doanh nghiệp"
        />
        <select className="input input-sm filter-select" value={values.category} onChange={(e) => set({ category: e.target.value, page: '1' })} aria-label="Danh mục">
          <option value="">Danh mục</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{categoryVi(c)}</option>)}
        </select>
        <select className="input input-sm filter-select" value={values.province} onChange={(e) => set({ province: e.target.value, page: '1' })} aria-label="Tỉnh/Thành">
          <option value="">Tỉnh/Thành</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="filter-check">
          <input type="checkbox" checked={values.mine === '1'} onChange={(e) => set({ mine: e.target.checked ? '1' : '', page: '1' })} />
          Của tôi
        </label>
        {(values.search || values.category || values.province || values.mine) && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setSearchInput(''); reset(); }}>Xóa lọc</button>
        )}
      </ListHeader>

      <div className="filter-bar">
        <StatusTabs tabs={[...TABS]} active={tab} onChange={(k) => set({ tab: k === 'pending' ? '' : k, page: '1' })} />
        <span className="cell-meta">
          {stats ? `Chờ ${stats.pendingVerification} · Đã duyệt ${stats.verifiedBusinesses} · Từ chối ${stats.rejectedBusinesses}` : 'Nhấn dòng để xem · phím ? trợ giúp'}
        </span>
      </div>

      <TableShell>
        {showCheckbox && (
          <BulkBar count={selected.size} onApprove={() => setBulkApproveOpen(true)} onReject={() => openReject([...selected])} busy={busy} />
        )}

        {isError && (
          <StateBlock variant="error" icon="!" title="Không tải được danh sách" copy={loadError ?? 'Kiểm tra kết nối rồi thử lại.'}>
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && <StateBlock variant="loading" icon="⌁" title="Đang tải danh sách" copy="Koola đang lấy hồ sơ doanh nghiệp." />}
        {!isLoading && !isError && (
          <div className="table-scroll">
            <table className="data-table data-table--compact" aria-label="Danh sách doanh nghiệp">
              <thead>
                <tr>
                  {showCheckbox && (
                    <th scope="col"><input type="checkbox" checked={businesses.length > 0 && selected.size === businesses.length} onChange={toggleAll} aria-label="Chọn tất cả trang này" /></th>
                  )}
                  <th scope="col" aria-sort={sortAria('displayName')}>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => toggleSort('displayName')}>Doanh nghiệp</button>
                  </th>
                  <th scope="col">Liên hệ</th>
                  <th scope="col" className="col-hide-mobile">Danh mục/Tỉnh</th>
                  <th scope="col" aria-sort={sortAria('createdAt')}>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => toggleSort('createdAt')}>Tuổi</button>
                  </th>
                  {tab === 'all' && <th scope="col">Trạng thái</th>}
                  <th scope="col" className="col-hide-mobile">Ngày đăng ký</th>
                  <th scope="col" className="col-sticky">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {businesses.length === 0 && (
                  <tr>
                    <td colSpan={showCheckbox ? 8 : 7}>
                      <EmptyState title="Không có hồ sơ" copy="Thử đổi từ khóa hoặc xóa bộ lọc." />
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
                      <div className="cell-title">{b.displayName}</div>
                      <div className="cell-meta k-mono">{shortId(b._id)}
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => copyId(b._id)} aria-label={`Sao chép ID ${b.displayName}`}>Sao chép</button>
                      </div>
                      {b.licenseImageUrl && (
                        <a href={b.licenseImageUrl} target="_blank" rel="noopener noreferrer" className="license-thumb" aria-label={`Xem giấy phép ${b.displayName}`}>
                          <img src={b.licenseImageUrl} alt="" loading="lazy" width={40} height={28} />
                        </a>
                      )}
                    </td>
                    <td>
                      <div>{b.contactPhone ? <MaskedPII value={b.contactPhone} kind="phone" /> : '—'}</div>
                      <div className="cell-meta">{(b.contactEmail ?? b.email) ? <MaskedPII value={b.contactEmail ?? b.email ?? ''} kind="email" /> : '—'}</div>
                    </td>
                    <td className="col-hide-mobile">
                      <div className="cell-title">{categoryVi(b.businessCategory)}</div>
                      <div className="cell-meta">{b.province ?? ''}</div>
                    </td>
                    <td>
                      {tab === 'pending'
                        ? <span title={formatDateTime(b.createdAt)}><StatusBadge tone={ageTone(b.createdAt)} label={ageLabel(b.createdAt)} /></span>
                        : <span title={formatDateTime(b.createdAt)}>{ageLabel(b.createdAt)}</span>}
                    </td>
                    {tab === 'all' && <td><VerificationBadge status={b.verificationStatus} /></td>}
                    <td className="col-hide-mobile cell-meta">{formatDateTime(b.createdAt)}</td>
                    <td className="col-sticky">
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-icon" type="button" onClick={() => goDetail(b._id)} aria-label={`Xem ${b.displayName}`} title="Chi tiết"><Eye size={16} aria-hidden /></button>
                        {tab === 'pending' && (
                          <>
                            <button className="btn btn-primary btn-icon" type="button" disabled={busy} onClick={() => setApproveTarget(b._id)} aria-label={`Duyệt ${b.displayName}`} title="Duyệt"><Check size={16} aria-hidden /></button>
                            <button className="btn btn-danger-ghost btn-icon" type="button" disabled={busy} onClick={() => openReject([b._id])} aria-label={`Từ chối ${b.displayName}`} title="Từ chối"><X size={16} aria-hidden /></button>
                          </>
                        )}
                        {tab === 'verified' && (
                          b.suspended
                            ? <button className="btn btn-secondary btn-icon" type="button" disabled={busy} onClick={() => setSuspendTarget({ id: b._id, suspend: false })} aria-label={`Kích hoạt ${b.displayName}`} title="Kích hoạt"><RotateCcw size={16} aria-hidden /></button>
                            : <button className="btn btn-danger-ghost btn-icon" type="button" disabled={busy} onClick={() => setSuspendTarget({ id: b._id, suspend: true })} aria-label={`Vô hiệu hóa ${b.displayName}`} title="Vô hiệu hóa"><Ban size={16} aria-hidden /></button>
                        )}
                        <button className="btn btn-ghost btn-icon" type="button" disabled={busy} onClick={() => setDeleteTarget(b._id)} aria-label={`Xóa ${b.displayName}`} title="Xóa"><Trash2 size={16} aria-hidden /></button>
                      </div>
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
        onApprove={(id) => setApproveTarget(id)}
        onReject={(id) => openReject([id])}
        onSuspend={(id, suspend) => setSuspendTarget({ id, suspend })}
      />

      <ConfirmDialog
        open={approveTarget !== null} onClose={() => setApproveTarget(null)}
        title="Xác nhận duyệt" confirmLabel="Xác nhận duyệt" variant="primary" busy={busy} onConfirm={confirmApprove}
        description={approvingBusiness ? `Duyệt "${approvingBusiness.displayName}" thành tài khoản business?` : undefined}
        preview={approvingBusiness ? (
          <dl className="description-list">
            <div><dt>Doanh nghiệp</dt><dd>{approvingBusiness.displayName}</dd></div>
            {approvingBusiness.email && <div><dt>Email</dt><dd className="k-mono">{approvingBusiness.email}</dd></div>}
            <div><dt>ID</dt><dd className="k-mono">{approvingBusiness._id}</dd></div>
          </dl>
        ) : undefined}
      />

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
        open={suspendTarget !== null} onClose={() => setSuspendTarget(null)}
        title={suspendTarget?.suspend ? 'Vô hiệu hóa doanh nghiệp?' : 'Kích hoạt lại doanh nghiệp?'}
        confirmLabel={suspendTarget?.suspend ? 'Vô hiệu hóa' : 'Kích hoạt'}
        variant={suspendTarget?.suspend ? 'danger' : 'primary'} busy={busy} onConfirm={confirmSuspend}
      />

      <ConfirmDialog
        open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="Xóa hồ sơ doanh nghiệp?"
        description="Hồ sơ bị xóa mềm, không hiện trong danh sách nhưng vẫn giữ trong DB để đối soát."
        confirmLabel="Xóa hồ sơ" variant="danger" busy={busy} onConfirm={confirmDelete}
      />

      <Dialog open={rejectTargets !== null} onClose={() => { setRejectTargets(null); setRejectError(null); }} labelId="reject-dialog-title" variant="dialog">
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="reject-dialog-title" className="panel-title">
                {rejectTargets && rejectTargets.length > 1 ? `Từ chối ${rejectTargets.length} doanh nghiệp` : 'Lý do từ chối'}
              </h2>
              <p className="panel-subtitle">Gửi phản hồi rõ ràng để doanh nghiệp nộp lại đúng.</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setRejectTargets(null); setRejectError(null); }} type="button">Đóng</button>
          </div>
          <div className="dialog-body page-stack">
            <div className="filter-chip-row" style={{ padding: 0 }}>
              {rejectTemplates.map((t) => (
                <button className="filter-chip" key={t} onClick={() => setRejectReason(t)} type="button">{t.split(',')[0]}</button>
              ))}
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="reject-reason">Lý do</label>
              <textarea className="textarea" id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} aria-label="Nhập lý do từ chối" aria-required="true" placeholder="Nhập lý do cụ thể để doanh nghiệp biết cần sửa gì..." />
            </div>
            {rejectError && <p className="alert" role="alert">{rejectError}</p>}
            <div className="table-actions">
              <button className="btn btn-danger" onClick={handleRejectSubmit} type="button" disabled={busy}>{busy ? 'Đang gửi...' : 'Xác nhận từ chối'}</button>
              <button className="btn btn-secondary" onClick={() => { setRejectTargets(null); setRejectError(null); }} type="button">Hủy</button>
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
