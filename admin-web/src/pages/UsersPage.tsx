import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { VerificationBadge } from '../components/StatusBadge';
import { initials, banStatusLabel } from '../components/formatters';
import Dialog from '../components/Dialog';
import { useToast } from '../components/Toast';
import { useAdminList } from '../hooks/useAdminList';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { BanDialog, useViolationHistory } from '../components/UserModeration';
import apiClient from '../apiClient';

interface User {
  _id: string;
  displayName: string;
  email?: string;
  phone?: string;
  accountType: string;
  isBanned: boolean;
  banReason?: string | null;
  bannedUntil?: string | null;
  verificationStatus?: string;
  rejectionReason?: string;
  ownerUserId?: string;
}

const LIMIT = 20;

function accountTypeLabel(type: string) {
  return type === 'business' ? 'Doanh nghiệp' : 'Cá nhân';
}

function banStatus(u: User): string {
  return banStatusLabel(u);
}

export default function UsersPage() {
  const { addToast } = useToast();
  const { values, set } = useUrlFilters({ search: '', accountType: '', page: '1' });
  const page = Math.max(1, Number(values.page) || 1);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [confirmBan, setConfirmBan] = useState<{ id: string; name: string; action: 'ban' | 'unban' } | null>(null);

  const { rows, total, isLoading, isError, refetch } = useAdminList<User>(
    ['users', values.search, values.accountType, page],
    '/admin/users',
    {
      page,
      limit: LIMIT,
      search: values.search || undefined,
      accountType: values.accountType || undefined,
    },
  );

  const hasActiveFilters = Boolean(values.search || values.accountType);

  async function openDetail(id: string) {
    setDetailId(id);
    try {
      const res = await apiClient.get<User>(`/admin/users/${id}`);
      setDetailUser(res.data);
    } catch {
      addToast('error', 'Không thể tải thông tin người dùng.');
      setDetailId(null);
    }
  }

  function afterBanAction(action: 'ban' | 'unban') {
    addToast('success', action === 'ban' ? 'Đã cấm tài khoản.' : 'Đã bỏ cấm tài khoản.');
    refetch();
    if (detailId) openDetail(detailId);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="page-stack">
      <PageHeader title="Quản lý người dùng" description="Tìm kiếm tài khoản, kiểm tra trạng thái và xử lý ban/unban." />
      <TableShell
        title="Users"
        actions={<span className="badge badge-muted">{total.toLocaleString('vi-VN')} records</span>}
      >
        <form
          className="table-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value;
            const type = (e.currentTarget.elements.namedItem('type') as HTMLSelectElement).value;
            set({ search: input.trim(), accountType: type, page: '1' });
          }}
          aria-label="Tìm kiếm và lọc người dùng"
        >
          <div className="table-toolbar-main">
            <div className="form-field search-field">
              <label className="form-label" htmlFor="user-search">
                Tìm kiếm
              </label>
              <input
                className="input"
                id="user-search"
                name="q"
                type="search"
                placeholder="Tên, email, số điện thoại..."
                defaultValue={values.search}
                key={values.search}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="account-type-filter">
                Loại tài khoản
              </label>
              <select
                className="select"
                id="account-type-filter"
                name="type"
                defaultValue={values.accountType}
                key={values.accountType}
                onChange={(e) => set({ accountType: e.target.value, page: '1' })}
              >
                <option value="">Tất cả loại</option>
                <option value="personal">Cá nhân</option>
                <option value="business">Doanh nghiệp</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Tìm
            </button>
            {hasActiveFilters && (
              <button className="btn btn-ghost" onClick={() => set({ search: '', accountType: '', page: '1' })} type="button">
                Xóa lọc
              </button>
            )}
          </div>
        </form>

        {isError && (
          <p className="alert" role="alert" style={{ margin: 'var(--space-5)' }}>
            Không thể tải danh sách người dùng.
          </p>
        )}
        {isLoading && (
          <StateBlock variant="loading" icon="⌁" title="Đang tải danh sách" copy="Koola đang lấy dữ liệu người dùng mới nhất." />
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState title="Không tìm thấy người dùng" copy="Thử đổi từ khóa hoặc xóa bộ lọc." />
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="table-scroll">
            <table className="data-table" aria-label="Danh sách người dùng">
              <thead>
                <tr>
                  <th scope="col">Người dùng</th>
                  <th scope="col">Liên hệ</th>
                  <th scope="col">Loại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Xác minh</th>
                  <th scope="col" className="col-actions">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="cell-primary">
                        <div className="cell-avatar" aria-hidden="true">
                          {initials(u.displayName, 'U')}
                        </div>
                        <div>
                          <button className="cell-link" onClick={() => openDetail(u._id)} type="button">
                            {u.displayName}
                          </button>
                          <div className="cell-meta k-mono">{u._id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-title">{u.email ?? u.phone ?? '—'}</div>
                      <div className="cell-meta">Primary contact</div>
                    </td>
                    <td>
                      <span className={u.accountType === 'business' ? 'badge badge-primary' : 'badge badge-muted'}>
                        {accountTypeLabel(u.accountType)}
                      </span>
                    </td>
                    <td>
                      <span className={u.isBanned ? 'badge badge-danger' : 'badge badge-success'}>
                        {u.isBanned ? 'Đã cấm' : 'Hoạt động'}
                      </span>
                      {u.isBanned && u.banReason && <div className="cell-meta">{u.banReason}</div>}
                    </td>
                    <td>
                      <VerificationBadge status={u.verificationStatus} />
                    </td>
                    <td className="col-actions">
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openDetail(u._id)} type="button">
                          Chi tiết
                        </button>
                        {u.isBanned ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setConfirmBan({ id: u._id, name: u.displayName, action: 'unban' })}
                            type="button"
                          >
                            Bỏ cấm
                          </button>
                        ) : (
                          <button
                            className="btn btn-danger-ghost btn-sm"
                            onClick={() => setConfirmBan({ id: u._id, name: u.displayName, action: 'ban' })}
                            type="button"
                          >
                            Cấm
                          </button>
                        )}
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
          onPageChange={(p) => set({ page: String(p) })}
        />
      </TableShell>

      <UserDetailDrawer
        user={detailUser}
        onClose={() => {
          setDetailUser(null);
          setDetailId(null);
        }}
        onBan={(u) => setConfirmBan({ id: u._id, name: u.displayName, action: u.isBanned ? 'unban' : 'ban' })}
      />
      <BanDialog target={confirmBan} onClose={() => setConfirmBan(null)} onDone={afterBanAction} />
    </div>
  );
}

function UserDetailDrawer({
  user,
  onClose,
  onBan,
}: {
  user: User | null;
  onClose: () => void;
  onBan: (u: User) => void;
}) {
  const [tab, setTab] = useState<'info' | 'history'>('info');
  const { entries, loading } = useViolationHistory(user?._id ?? null);

  return (
    <Dialog open={user !== null} onClose={onClose} labelId="user-detail-title" variant="drawer">
      {user && (
        <aside className="drawer">
          <div className="drawer-header">
            <div>
              <div className="page-eyebrow">User profile</div>
              <h2 id="user-detail-title" className="panel-title">
                {user.displayName}
              </h2>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
              Đóng
            </button>
          </div>
          <div className="drawer-body page-stack">
            <div className="tabs" role="tablist" aria-label="Thông tin người dùng">
              <button role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')} type="button">
                Thông tin
              </button>
              <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')} type="button">
                Lịch sử vi phạm
              </button>
            </div>

            {tab === 'info' && (
              <>
                <dl className="description-list">
                  <dt>Email</dt>
                  <dd>{user.email ?? '—'}</dd>
                  <dt>Điện thoại</dt>
                  <dd>{user.phone ?? '—'}</dd>
                  <dt>Loại tài khoản</dt>
                  <dd>{accountTypeLabel(user.accountType)}</dd>
                  <dt>Trạng thái</dt>
                  <dd>{banStatus(user)}</dd>
                  {user.banReason && (
                    <>
                      <dt>Lý do cấm</dt>
                      <dd>{user.banReason}</dd>
                    </>
                  )}
                </dl>
                <button
                  className={user.isBanned ? 'btn btn-secondary' : 'btn btn-danger'}
                  onClick={() => onBan(user)}
                  type="button"
                >
                  {user.isBanned ? 'Bỏ cấm' : 'Cấm người dùng'}
                </button>
              </>
            )}

            {tab === 'history' && (
              <section className="panel">
                <div className="panel-header">
                  <div className="panel-title">Lịch sử vi phạm ({entries.length})</div>
                </div>
                <div className="panel-body">
                  {loading && <div className="skeleton-card" aria-label="Đang tải lịch sử" />}
                  {!loading && entries.length === 0 && (
                    <p className="cell-meta">Chưa có vi phạm nào được ghi nhận.</p>
                  )}
                  {entries.map((e, i) => (
                    <div className="queue-item" key={i}>
                      <div>
                        <strong>{e.title}</strong>
                        <span>
                          {e.status ? `${e.status} · ` : ''}
                          {e.at ?? ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>
      )}
    </Dialog>
  );
}
