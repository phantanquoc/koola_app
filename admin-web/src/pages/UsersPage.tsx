import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, Search, ShieldAlert, ShieldOff, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { StatusTabs } from '../components/StatusTabs';
import { TableShell } from '../components/TableShell';
import { ColumnHeader } from '../components/ColumnHeader';
import { FilterPopover } from '../components/FilterPopover';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge, VerificationBadge } from '../components/StatusBadge';
import { MaskedPII } from '../components/MaskedPII';
import { formatDateTime, initials, apiErrorMessage } from '../components/formatters';
import { accountTypeLabel } from '../components/user-labels';
import { ADMIN_ROLE_LABELS, adminRoleTone, resolveAdminRole } from '../components/admin-role';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportButton } from '../components/ExportButton';
import { ExportDateRange } from '../components/ExportDateRange';
import { BanDialog } from '../components/UserModeration';
import { useToast } from '../components/Toast';
import type { AdminUser } from '../components/UserDetail';

const PAGE_SIZES = [20, 50, 100];

const TAB_KEYS = ['all', 'banned', 'archived', 'admin'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const VERIFICATION_TABS = [
  { value: '', label: 'Mọi trạng thái' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'verified', label: 'Đã xác minh' },
  { value: 'rejected', label: 'Bị từ chối' },
];

const FILTER_DEFAULTS = {
  tab: 'all', search: '', accountType: '', verification: '', sort: '', page: '1', pageSize: '20',
};

/** Badge vai trò quản trị — "Có/Không" cũ không nói được admin này làm được gì. */
function adminRoleBadge(u: AdminUser) {
  const role = resolveAdminRole(u);
  if (!role) return <span className="cell-meta">—</span>;
  return <StatusBadge tone={adminRoleTone(role)} label={ADMIN_ROLE_LABELS[role]} />;
}

/**
 * Trang Người dùng — archetype list §3A.
 *
 * Trước đây: `PageHeader` + form submit tay + không có tab trạng thái, không
 * sort, không phân trang theo cỡ trang, và chi tiết là drawer trượt (trái §3B).
 * Bốn trục trạng thái của một tài khoản (loại, xác minh, bị cấm, quản trị) giờ
 * đều hiện trên bảng, lọc được ở server và đảo ngược được.
 */
export default function UsersPage() {
  const { addToast } = useToast();
  const { values, set, reset } = useUrlFilters(FILTER_DEFAULTS);
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;
  const tab = (TAB_KEYS as readonly string[]).includes(values.tab) ? (values.tab as TabKey) : 'all';
  // Tab Lưu trữ: cột hiển thị ngày xoá → sort theo ngày xoá mới nhất trước
  // (vừa xoá lên đầu, đó là hồ sơ có thể phải cứu ngay).
  const sort = values.sort || (tab === 'archived' ? 'deletedAt:desc' : 'createdAt:desc');

  const params = useMemo(() => ({
    page,
    limit: pageSize,
    search: values.search || undefined,
    // `all` = không gửi status: DTO mặc định coi như không lọc.
    status: tab === 'all' ? undefined : tab,
    accountType: values.accountType || undefined,
    verificationStatus: values.verification || undefined,
    sort,
  }), [page, pageSize, values.search, tab, values.accountType, values.verification, sort]);

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<AdminUser>(
    ['users', values.search, tab, values.accountType, values.verification, sort, page, pageSize],
    '/admin/users',
    params,
  );

  // Số trên tab lấy từ server — đếm ở client thì luôn lệch với trang thật.
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => (await apiClient.get<{
      totalPersonal: number;
      totalBusiness: number;
      bannedUsers: number;
      platformAdmins: number;
      archivedUsers: number;
    }>('/admin/stats')).data,
    staleTime: 60_000,
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; action: 'ban' | 'unban' } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; name: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Khoảng ngày chỉ áp cho file xuất, không đổi danh sách đang xem — người dùng
  // mở dialog để chốt phạm vi file, không phải để lọc bảng.
  const [exportRange, setExportRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [busy, setBusy] = useState(false);

  // Ô tìm kiếm chính: debounce 350ms + Enter chốt ngay, không bắt bấm nút.
  const [searchInput, setSearchInput] = useState(values.search);
  useEffect(() => setSearchInput(values.search), [values.search]);
  useEffect(() => {
    if (searchInput.trim() === values.search) return;
    const t = setTimeout(() => set({ search: searchInput.trim(), page: '1' }), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  function openDetail(id: string) {
    navigate(`/users/${id}`, { state: { from: `${location.pathname}${location.search}` } });
  }

  function afterBanAction(action: 'ban' | 'unban') {
    addToast('success', action === 'ban' ? 'Đã cấm tài khoản và thu hồi phiên đăng nhập.' : 'Đã bỏ cấm tài khoản.');
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  }

  async function confirmRestore() {
    if (!restoreTarget || busy) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/users/${restoreTarget.id}/restore`);
      addToast('success', `Đã khôi phục ${restoreTarget.name}.`);
      setRestoreTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Khôi phục thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  function toCsvCell(v: unknown) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** Xuất đúng tập đang xem — cùng filter/sort với list, KHÁC phân trang. */
  async function handleExport() {
    setExporting(true);
    try {
      // `params` của list có `page`/`limit`; ExportUsersDto không khai hai field
      // đó và ValidationPipe bật `forbidNonWhitelisted` → gửi thẳng là 400.
      // Export tự cap 500 dòng ở server nên bỏ phân trang là đúng nghĩa.
      const { page: _page, limit: _limit, ...exportParams } = params;
      const res = await apiClient.get<{ data: AdminUser[]; total: number; truncated: boolean }>(
        '/admin/users/export',
        {
          params: {
            ...exportParams,
            from: exportRange.from || undefined,
            to: exportRange.to || undefined,
          },
        },
      );
      if (res.data.truncated) {
        addToast('warning', `Xuất 500/${res.data.total} dòng đầu tiên. Thu hẹp bộ lọc để xuất hết.`);
      }
      const header = [
        'ID', 'Tên hiển thị', 'Tên đăng nhập', 'Email', 'Số điện thoại', 'Loại tài khoản',
        'Xác minh', 'Bị cấm', 'Lý do cấm', 'Cấm tới', 'Quản trị', 'Đăng nhập cuối',
        'IP đăng nhập cuối', 'Xoá mềm lúc', 'Ngày tham gia', 'Hoạt động cuối',
        'Ghi chú nội bộ',
      ];
      const lines = res.data.data.map((u) => {
        const role = resolveAdminRole(u);
        return [
          u._id, u.displayName, u.username ?? '', u.email ?? '', u.phone ?? '',
          accountTypeLabel(u.accountType), u.verificationStatus ?? '',
          u.isBanned ? 'Có' : '', u.banReason ?? '', u.bannedUntil ?? '',
          role ? ADMIN_ROLE_LABELS[role] : '', u.lastLoginAt ?? '', u.lastLoginIp ?? '',
          u.deletedAt ?? '', u.createdAt ?? '', u.lastSeen ?? '', u.internalNote ?? '',
        ].map(toCsvCell).join(',');
      });
      // BOM để Excel đọc đúng tiếng Việt.
      const blob = new Blob([`\uFEFF${[header.join(','), ...lines].join('\n')}`], {
        type: 'text/csv;charset=utf-8',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `nguoi-dung-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  function toggleSort(field: string) {
    const [cur, dir] = sort.split(':');
    set({ sort: cur === field && dir === 'asc' ? `${field}:desc` : `${field}:asc`, page: '1' });
  }

  const advancedCount = (values.accountType ? 1 : 0) + (values.verification ? 1 : 0);
  // Tab KHÔNG phải bộ lọc: đang ở tab "Bị cấm" mà rỗng thì câu đúng là
  // "không có ai bị cấm", không phải "bộ lọc không khớp".
  const hasFilter = Boolean(values.search || advancedCount);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const loadError = apiErrorMessage(error, 'Không tải được danh sách người dùng.');

  // Đang ở trang vượt quá tổng số trang (deep-link `?search=…&page=2` khi kết quả
  // chỉ còn 1 trang): bảng rỗng trong khi footer vẫn báo "1 hồ sơ" → đọc thành
  // "bộ lọc không khớp". Kẹp về trang cuối thay vì hiện empty-state sai.
  useEffect(() => {
    if (!isLoading && total > 0 && page > totalPages) set({ page: String(totalPages) });
  }, [isLoading, total, page, totalPages, set]);

  return (
    <div className="page-stack">
      <ListHeader
        title="Người dùng"
        count={total}
        actions={(
          <>
            <ExportButton onExport={() => setExportOpen(true)} />
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
              Làm mới
            </button>
          </>
        )}
      >
        <div className="filter-search-wrap">
          <Search size={15} className="filter-search-icon" aria-hidden />
          <input
            className="input filter-search filter-search--icon" type="search" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') set({ search: searchInput.trim(), page: '1' }); }}
            placeholder="Tên, email, SĐT hoặc mã tài khoản"
            aria-label="Tìm người dùng theo tên, email, số điện thoại hoặc mã tài khoản"
          />
        </div>

        <FilterPopover
          activeCount={advancedCount}
          onClear={() => set({ accountType: '', verification: '', page: '1' })}
        >
          <label className="form-field">
            <span className="form-label">Loại tài khoản</span>
            <select
              className="select" value={values.accountType}
              onChange={(e) => set({ accountType: e.target.value, page: '1' })}
            >
              <option value="">Mọi loại</option>
              <option value="personal">Cá nhân</option>
              <option value="business">Doanh nghiệp</option>
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Xác minh</span>
            <select
              className="select" value={values.verification}
              onChange={(e) => set({ verification: e.target.value, page: '1' })}
            >
              {VERIFICATION_TABS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="cell-meta">Chỉ áp dụng cho tài khoản doanh nghiệp.</span>
          </label>
        </FilterPopover>
      </ListHeader>

      <div className="filter-bar">
        <StatusTabs
          tabs={[
            { key: 'all', label: 'Tất cả', count: stats ? stats.totalPersonal + stats.totalBusiness : undefined },
            { key: 'banned', label: 'Bị cấm', count: stats?.bannedUsers },
            { key: 'archived', label: 'Lưu trữ', count: stats?.archivedUsers },
            { key: 'admin', label: 'Quản trị viên', count: stats?.platformAdmins },
          ]}
          active={tab}
          onChange={(k) => set({ tab: k === 'all' ? '' : k, page: '1' })}
        />
        <span className="cell-meta">Nhấn dòng để xem chi tiết</span>
      </div>

      {hasFilter && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {values.search && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ search: '', page: '1' })}>
              Từ khoá: {values.search} <X size={12} aria-hidden />
            </button>
          )}
          {values.accountType && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ accountType: '', page: '1' })}>
              Loại: {accountTypeLabel(values.accountType)} <X size={12} aria-hidden />
            </button>
          )}
          {values.verification && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ verification: '', page: '1' })}>
              Xác minh: {VERIFICATION_TABS.find((v) => v.value === values.verification)?.label} <X size={12} aria-hidden />
            </button>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setSearchInput(''); reset(); }}>Xoá bộ lọc</button>
        </div>
      )}

      <TableShell>
        {isError && (
          <StateBlock variant="error" title="Không tải được danh sách" copy={loadError}>
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && (
          <StateBlock variant="loading" title="Đang tải danh sách" copy="Đang lấy dữ liệu người dùng mới nhất." />
        )}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Danh sách người dùng">
              <thead>
                <tr>
                  <ColumnHeader label="Người dùng" sortField="displayName" sort={sort} onSort={toggleSort} />
                  <ColumnHeader label="Liên hệ" className="col-hide-xs" />
                  <ColumnHeader
                    label="Loại"
                    className="col-hide-mobile"
                    filter={{
                      value: values.accountType,
                      options: [
                        { value: '', label: 'Mọi loại' },
                        { value: 'personal', label: 'Cá nhân' },
                        { value: 'business', label: 'Doanh nghiệp' },
                      ],
                      onChange: (v) => set({ accountType: v, page: '1' }),
                    }}
                  />
                  <ColumnHeader
                    label="Xác minh"
                    className="col-hide-mobile"
                    filter={{
                      value: values.verification,
                      options: VERIFICATION_TABS,
                      onChange: (v) => set({ verification: v, page: '1' }),
                    }}
                  />
                  <ColumnHeader
                    label={tab === 'archived' ? 'Xoá lúc' : 'Tham gia'}
                    className="col-hide-xs"
                    sortField={tab === 'archived' ? 'deletedAt' : 'createdAt'}
                    sort={sort}
                    onSort={toggleSort}
                  />
                  {/* Chỉ tab Quản trị viên mới cần hai cột này — mọi hàng khác đều
                      trống, thêm vào làm bảng loãng. */}
                  {tab === 'admin' && (
                    <>
                      <ColumnHeader label="Vai trò" className="col-hide-mobile" />
                      <ColumnHeader label="Đăng nhập cuối" className="col-hide-xs" />
                    </>
                  )}
                  <th scope="col" className="th-center col-sticky">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'admin' ? 8 : 6}>
                      <EmptyState
                        title={hasFilter ? 'Không khớp tài khoản nào' : tab === 'banned' ? 'Không có ai đang bị cấm' : tab === 'archived' ? 'Chưa có tài khoản nào bị xoá' : tab === 'admin' ? 'Chưa có quản trị viên nào' : 'Chưa có tài khoản nào'}
                        copy={hasFilter
                          ? 'Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm.'
                          : tab === 'banned'
                            ? 'Mọi tài khoản đang hoạt động bình thường.'
                            : tab === 'archived'
                              ? 'Tài khoản bị xoá mềm sẽ nằm ở đây và khôi phục được.'
                              : tab === 'admin'
                                ? 'Quyền quản trị nền tảng cấp ngoài giao diện (script grant-admin); vai trò đổi được trong hồ sơ.'
                                : 'Tài khoản sẽ xuất hiện ở đây khi người dùng đăng ký.'}
                        action={hasFilter
                          ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setSearchInput(''); reset(); }}>Xoá bộ lọc</button>
                          : undefined}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((u) => {
                  const role = resolveAdminRole(u);
                  return (
                  <tr
                    key={u._id}
                    tabIndex={0}
                    aria-label={`Xem chi tiết ${u.displayName}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button,input')) return;
                      openDetail(u._id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      // Enter/Space trên nút bên trong hàng là của nút đó, không
                      // phải mở chi tiết — nếu không, bấm Cấm bằng bàn phím vừa
                      // mở dialog vừa điều hướng.
                      if ((e.target as HTMLElement).closest('a,button,input,textarea,select')) return;
                      e.preventDefault();
                      openDetail(u._id);
                    }}
                  >
                    <td>
                      <div className="cell-primary">
                        <div className="cell-avatar" aria-hidden="true">{initials(u.displayName, 'U')}</div>
                        <div>
                          <div className="cell-title">
                            {u.displayName}
                            {u.isBanned && <span className="badge badge-danger cell-badge">Bị cấm</span>}
                            {/* Badge "Quản trị" cũ chỉ nói Có/Không; nay hiện vai
                                trò cụ thể. Tab Quản trị viên đã có cột Vai trò
                                riêng nên khỏi lặp badge ở đây. */}
                            {role && tab !== 'admin' && (
                              <span className="cell-badge">
                                <StatusBadge tone={adminRoleTone(role)} label={ADMIN_ROLE_LABELS[role]} />
                              </span>
                            )}
                          </div>
                          {/* Cột bị ẩn theo bề ngang thì dữ liệu xuống dòng meta:
                              ≤1099px "Liên hệ" + "Tham gia"; ≤860px thêm "Loại" +
                              "Xác minh". Mỗi lớp có mốc ẩn riêng nên phải tách. */}
                          {u.username && <div className="cell-meta">@{u.username}</div>}
                          <div className="cell-meta show-under-1100">
                            {formatDateTime(tab === 'archived' ? u.deletedAt : u.createdAt)}
                            {(u.phone || u.email) && (
                              <>
                                {' · '}
                                {u.phone
                                  ? <MaskedPII value={u.phone} kind="phone" />
                                  : <MaskedPII value={u.email ?? ''} kind="email" />}
                              </>
                            )}
                          </div>
                          <div className="cell-meta show-under-860">
                            {accountTypeLabel(u.accountType)}
                            {u.accountType === 'business' && (
                              <> · <VerificationBadge status={u.verificationStatus} /></>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="col-hide-xs">
                      <div>
                        {u.phone
                          ? <MaskedPII value={u.phone} kind="phone" />
                          : <span className="cell-meta">—</span>}
                      </div>
                      <div className="cell-meta">
                        {u.email
                          ? <MaskedPII value={u.email} kind="email" />
                          : u.username ? `@${u.username}` : '—'}
                      </div>
                    </td>
                    <td className="col-hide-mobile">
                      <span className={u.accountType === 'business' ? 'badge badge-primary' : 'badge badge-muted'}>
                        {accountTypeLabel(u.accountType)}
                      </span>
                    </td>
                    <td className="col-hide-mobile">
                      {u.accountType === 'business'
                        ? <VerificationBadge status={u.verificationStatus} />
                        : <span className="cell-meta">—</span>}
                    </td>
                    <td className="col-hide-xs">
                      <span className="cell-date">
                        {tab === 'archived' ? formatDateTime(u.deletedAt) : formatDateTime(u.createdAt)}                      </span>
                    </td>
                    {tab === 'admin' && (
                      <>
                        <td className="col-hide-mobile">
                          {adminRoleBadge(u)}
                        </td>
                        <td className="col-hide-xs">
                          <span className="cell-date">{formatDateTime(u.lastLoginAt)}</span>
                        </td>
                      </>
                    )}
                    <td className="col-sticky">
                      <div className="table-actions table-actions--end">
                        <button
                          className="btn btn-ghost btn-icon" type="button"
                          onClick={(e) => { e.stopPropagation(); openDetail(u._id); }}
                          aria-label={`Xem ${u.displayName}`} title="Chi tiết"
                        >
                          <Eye size={16} aria-hidden />
                        </button>
                        {tab === 'archived' ? (
                          <button
                            className="btn btn-secondary btn-sm" type="button" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); setRestoreTarget({ id: u._id, name: u.displayName }); }}
                          >
                            Khôi phục
                          </button>
                        ) : u.isBanned ? (
                          <button
                            className="btn btn-ghost btn-icon" type="button"
                            onClick={(e) => { e.stopPropagation(); setBanTarget({ id: u._id, name: u.displayName, action: 'unban' }); }}
                            aria-label={`Bỏ cấm ${u.displayName}`} title="Bỏ cấm"
                          >
                            <ShieldOff size={16} aria-hidden />
                          </button>
                        ) : (
                          <button
                            className="btn btn-danger-ghost btn-icon" type="button"
                            onClick={(e) => { e.stopPropagation(); setBanTarget({ id: u._id, name: u.displayName, action: 'ban' }); }}
                            aria-label={`Cấm ${u.displayName}`} title="Cấm tài khoản"
                          >
                            <ShieldAlert size={16} aria-hidden />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page} totalPages={totalPages} total={total}
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      <BanDialog target={banTarget} onClose={() => setBanTarget(null)} onDone={afterBanAction} />

      <ConfirmDialog
        open={exportOpen}
        onClose={() => { setExportOpen(false); setExportRange({ from: '', to: '' }); }}
        title={`Xuất ${total.toLocaleString('vi-VN')} tài khoản ra CSV?`}
        description="File chứa email/SĐT/IP đăng nhập KHÔNG che và ghi chú nội bộ. Tối đa 500 dòng — thu hẹp bộ lọc nếu cần đủ. Chỉ lưu ở máy được phép xử lý dữ liệu cá nhân."
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

      <ConfirmDialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        title={`Khôi phục tài khoản "${restoreTarget?.name ?? ''}"?`}
        description="Tài khoản hoạt động lại như trước khi xoá. Trạng thái cấm (nếu có) giữ nguyên — gỡ riêng nếu cần."
        confirmLabel="Khôi phục"
        variant="primary"
        busy={busy}
        onConfirm={confirmRestore}
      />
    </div>
  );
}
